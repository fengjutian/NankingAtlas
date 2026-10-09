import { prisma } from '../../lib/prisma.js';

/**
 * 公开搜索（P3-05）。
 *
 * 技术方案 §11「搜索实现」：
 *   - 查询长度 2–100；转义通配符；限制耗时；无结果返回推荐标签而不是虚构答案
 *   - 建立规范化搜索文档：标题、别名、摘要、正文纯文本、标签、地点名
 *
 * 数据层是 SQLite（无 pg_trgm 中文 trigram），降级方案：
 *   - 用 FTS5（若编译启用）做英文/数字的词法匹配
 *   - 中文走 `LIKE '%q%'` —— 无分词，但内容规模不大时可接受
 *   - 两者都查，合并去重
 *
 * **转义 LIKE 通配符**是必须的：用户输入 `%` 或 `_` 若不转义，
 * 会变成"匹配所有"，一次请求拖全表。
 */

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;

/** LIKE 通配符转义。`ESCAPE '\'` 配合使用。 */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/[%_\\]/gu, (char) => `\\${char}`);
}

export interface SearchHit {
  slug: string;
  type: string;
  title: string;
  summary: string | null;
  /** 命中位置，用于前端高亮。 */
  matchedOn: 'title' | 'summary' | 'body' | 'tag';
}

/** `$queryRaw` 返回行；`matched_tag` 非空表示命中了标签。 */
interface RawSearchRow {
  slug: string;
  type: string;
  title: string;
  summary: string | null;
  matched_tag: string | null;
}

export interface SearchResult {
  query: string;
  total: number;
  items: SearchHit[];
  /** 无结果时的建议（技术方案 §11：返回推荐标签而不是虚构答案）。 */
  suggestions: string[];
  /** 搜索后端说明，便于前端在结果区提示能力边界。 */
  backend: 'like';
}

/**
 * 关键词检索。
 *
 * 只搜已发布且未归档内容 —— 与公开接口的一致性约束。
 */
export async function searchPublicContent(input: {
  q: string;
  type?: string | undefined;
  limit: number;
}): Promise<SearchResult> {
  const q = input.q.trim();
  if (q.length < MIN_QUERY_LENGTH) {
    return { query: q, total: 0, items: [], suggestions: [], backend: 'like' };
  }
  const capped = q.slice(0, MAX_QUERY_LENGTH);

  // 必须自己拼 LIKE pattern 并显式 `ESCAPE '\'`：
  // Prisma 的 `contains` 生成的是 `LIKE '%' || ? || '%'`，**不转义**用户输入，
  // 搜 `%%` 会变成 `LIKE '%%%'` —— 一次请求拖回全部已发布内容（限流桶按请求
  // 计，挡不住）。`escapeLikePattern` 负责加反斜杠，缺了 ESCAPE 子句就等于没转义。
  //
  // 全部取值走 Prisma 标签模板参数化（AGENTS.md §4.5），没有任何字符串拼接进 SQL。
  const like = `%${escapeLikePattern(capped)}%`;
  const typeFilter = input.type ?? null;

  const rows = await prisma.$queryRaw<RawSearchRow[]>`
    SELECT c.slug          AS slug,
           c.type          AS type,
           c.title         AS title,
           c.summary       AS summary,
           (SELECT t.display_name
              FROM content_tags ct
              JOIN tags t ON t.slug = ct.tag_slug
             WHERE ct.content_id = c.id
               AND t.display_name LIKE ${like} ESCAPE '\\'
             LIMIT 1)      AS matched_tag
      FROM contents c
     WHERE c.status = 'PUBLISHED'
       AND c.archived_at IS NULL
       AND (${typeFilter} IS NULL OR c.type = ${typeFilter})
       AND (
            c.title LIKE ${like} ESCAPE '\\'
         OR c.summary LIKE ${like} ESCAPE '\\'
         OR c.body_json LIKE ${like} ESCAPE '\\'
         OR EXISTS (
              SELECT 1
                FROM content_tags ct2
                JOIN tags t2 ON t2.slug = ct2.tag_slug
               WHERE ct2.content_id = c.id
                 AND t2.display_name LIKE ${like} ESCAPE '\\'
            )
       )
     LIMIT ${input.limit}
  `;

  const items: SearchHit[] = rows.map((row) => ({
    slug: row.slug,
    type: row.type,
    title: row.title,
    summary: row.summary,
    matchedOn: pickMatch(row.title, row.summary, row.matched_tag !== null, capped),
  }));

  // 无结果时给推荐标签（技术方案 §11）
  const suggestions = items.length === 0 ? await recommendTags(input.type) : [];

  return {
    query: capped,
    total: items.length,
    items,
    suggestions,
    backend: 'like',
  };
}

/** 判定命中位置（标题优先，其次标签、摘要、正文）。 */
function pickMatch(
  title: string,
  summary: string | null,
  matchedTag: boolean,
  q: string,
): SearchHit['matchedOn'] {
  const needle = q.toLowerCase();
  if (title.toLowerCase().includes(needle)) return 'title';
  if (matchedTag) return 'tag';
  if (summary?.toLowerCase().includes(needle)) return 'summary';
  return 'body';
}

/**
 * 无结果推荐：取出现频次最高的标签。
 *
 * 技术方案 §11 明确「无结果返回推荐标签而不是虚构答案」——
 * 所以这里**不生成任何合成答案**，只返回库中真实存在的标签。
 */
async function recommendTags(type: string | undefined): Promise<string[]> {
  const rows = await prisma.tag.findMany({
    select: { slug: true, displayName: true, _count: { select: { contents: true } } },
    orderBy: { contents: { _count: 'desc' } },
    take: 8,
  });
  void type;
  return rows.map((row) => row.displayName);
}
