/**
 * 数据库 seed 入口。
 *
 * 设计原则（AGENTS.md §3.5 / TECHNICAL_IMPLEMENTATION.md §14）：
 *   - **幂等**：每次执行结果一致；重复跑不产生重复行（全部用 upsert / 唯一键）。
 *   - **仅安全演示数据**：账号用明显占位的密码，内容与来源全部标注
 *     「示例 / 待核验」，且**一律不进入 PUBLISHED 状态** —— AI 生成或手工
 *     整理的内容必须经人工来源核查与 Reviewer 审核才能发布。
 *   - **生产迁移不得自动执行 seed**：本文件只由 `pnpm seed` 显式调用，
 *     CI 的 `migrate deploy` 不会触发它。
 *
 * 执行：pnpm --filter @nanking-atlas/database seed
 */

import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

/**
 * Argon2id 参数 —— 必须与 `apps/api/src/lib/password.ts` 一致，
 * 否则 seed 写入的哈希无法被 API 的 `verifyPassword` 验证。
 * 任何一侧改动都要同步。
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

const prisma = new PrismaClient();

/**
 * 演示账号密码。
 *
 * 硬编码是**故意的**：seed 只在本地/CI 跑，且 `.env` 之外不落任何凭据。
 * 生产库不执行 seed，所以这个值永远不会出现在真实环境。
 * 长度满足本服务的密码策略（≥12 字符）。
 */
const DEMO_PASSWORD = 'nanking-atlas-demo-2026';

/** 演示角色矩阵：一个账号覆盖一种角色，便于验证 RBAC。 */
const DEMO_USERS = [
  { email: 'admin@demo.local', displayName: '演示管理员', roles: ['ADMIN'] },
  { email: 'reviewer@demo.local', displayName: '演示审核员', roles: ['REVIEWER'] },
  { email: 'editor@demo.local', displayName: '演示编辑', roles: ['EDITOR'] },
] as const;

/**
 * 演示内容。
 *
 * 全部 status = DRAFT（待核验），不发布。
 * 文案明确标注"示例 / 待核验"，不冒充已核验的南京史实。
 */
const DEMO_CONTENTS = [
  {
    type: 'TOPIC',
    slug: 'demo-topic-qinhuai',
    title: '示例：秦淮风光带（待核验）',
    subtitle: '示例数据，不代表已核验的史实',
    summary: '示例内容：关于秦淮风光带的占位条目。所有事实均待人工核查，发布前不得对外展示。',
    bodyJson: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '示例 / 待核验：本条目由 seed 生成，用于验证编辑 → 送审 → 审核链路。内容未经来源核查，不得发布。',
            },
          ],
        },
      ],
    }),
    curatorNote: '示例 / 待核验：seed 生成的数据，用于流程演练。',
  },
  {
    type: 'PLACE',
    slug: 'demo-place-ming-city-wall',
    title: '示例：明城墙遗址（待核验）',
    subtitle: '示例数据，坐标未核验',
    summary: '示例内容：明城墙相关条目的占位版本。坐标与年代均未核验，不得作为精确信息引用。',
    bodyJson: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '示例 / 待核验：本条目为 seed 演示数据。未经人工核查，禁止发布或对外引用。',
            },
          ],
        },
      ],
    }),
    // 不填经纬度：未核验坐标不得给出（AGENTS.md §3.5）
    address: null,
    lon: null,
    lat: null,
    accuracy: 'UNKNOWN',
  },
] as const;

/**
 * 演示来源。
 *
 * 显式标注 kind = OTHER + verificationNote 未核验 —— 不冒充具体史籍。
 */
const DEMO_SOURCES = [
  {
    kind: 'OTHER',
    title: '示例来源（待补充真实出处）',
    author: null,
    publisher: null,
    citationText: '示例 / 待核验：此条目尚未绑定真实史料，发布前必须补充。',
    verificationNote: '未核验：seed 生成的占位来源，不得作为引用依据。',
  },
] as const;

async function seedUsers(passwordHash: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const user of DEMO_USERS) {
    // upsert 按 email 唯一键，保证重复执行不产生重复行
    const row = await prisma.user.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        passwordHash,
        displayName: user.displayName,
      },
      update: {
        // 重跑时刷新密码与显示名，但不重置 disabledAt（避免意外解锁账号）
        passwordHash,
        displayName: user.displayName,
      },
    });
    ids.set(user.email, row.id);

    // 角色集合：先清后建，保证与 DEMO_USERS 一致
    await prisma.userRoleAssignment.deleteMany({ where: { userId: row.id } });
    await prisma.userRoleAssignment.createMany({
      data: user.roles.map((role) => ({ userId: row.id, role })),
    });
  }
  return ids;
}

async function seedContents(authorId: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const item of DEMO_CONTENTS) {
    const row = await prisma.content.upsert({
      where: { slug: item.slug },
      create: {
        type: item.type,
        slug: item.slug,
        title: item.title,
        subtitle: item.subtitle,
        summary: item.summary,
        bodyJson: item.bodyJson,
        // 一律 DRAFT：未经人工核查的内容不得进入 PUBLISHED
        status: 'DRAFT',
        language: 'ZH',
        createdById: authorId,
        updatedById: authorId,
      },
      update: {
        title: item.title,
        subtitle: item.subtitle,
        summary: item.summary,
        bodyJson: item.bodyJson,
        // 不覆盖 status：编辑可能已把草稿推进到 IN_REVIEW，
        // seed 重跑不应把进行中的审核打回草稿
        updatedById: authorId,
      },
    });
    ids.set(item.slug, row.id);

    if (item.type === 'TOPIC') {
      await prisma.topic.upsert({
        where: { contentId: row.id },
        create: { contentId: row.id, curatorNote: item.curatorNote },
        update: { curatorNote: item.curatorNote },
      });
    } else if (item.type === 'PLACE') {
      await prisma.place.upsert({
        where: { contentId: row.id },
        create: {
          contentId: row.id,
          address: null,
          lon: null,
          lat: null,
          accuracy: 'UNKNOWN',
          verificationStatus: 'UNVERIFIED',
        },
        update: {
          // 同样不覆盖坐标：编辑填的经纬度不应被 seed 清掉
          verificationStatus: 'UNVERIFIED',
        },
      });
    }
  }
  return ids;
}

async function seedSources(): Promise<string[]> {
  const ids: string[] = [];
  for (const item of DEMO_SOURCES) {
    // 无稳定唯一键（url 可空），用 title + kind 组合判定是否已存在
    const existing = await prisma.source.findFirst({
      where: { kind: item.kind, title: item.title },
    });
    if (existing !== null) {
      ids.push(existing.id);
      continue;
    }
    const created = await prisma.source.create({
      data: {
        kind: item.kind,
        title: item.title,
        citationText: item.citationText,
        verificationNote: item.verificationNote,
      },
    });
    ids.push(created.id);
  }
  return ids;
}

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: ARGON2_OPTIONS.type,
    memoryCost: ARGON2_OPTIONS.memoryCost,
    timeCost: ARGON2_OPTIONS.timeCost,
    parallelism: ARGON2_OPTIONS.parallelism,
  });

  const users = await seedUsers(passwordHash);
  const editorId = users.get('editor@demo.local');
  const adminId = users.get('admin@demo.local');
  if (editorId === undefined || adminId === undefined) {
    throw new Error('demo users missing after seed');
  }

  const contents = await seedContents(editorId);
  const sourceIds = await seedSources();

  // 给每个演示内容挂上唯一那条示例来源（组合唯一保证幂等）
  const demoSourceId = sourceIds[0];
  if (demoSourceId !== undefined) {
    for (const contentId of contents.values()) {
      const existing = await prisma.contentSource.findUnique({
        where: {
          contentId_sourceId_claimScope: {
            contentId,
            sourceId: demoSourceId,
            claimScope: 'seed 示例数据（待核验）',
          },
        },
        select: { contentId: true },
      });
      if (existing !== null) {
        continue;
      }
      await prisma.contentSource.create({
        data: {
          contentId,
          sourceId: demoSourceId,
          claimScope: 'seed 示例数据（待核验）',
          isPrimary: true,
        },
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    [
      '[seed] 完成（全部为「示例 / 待核验」数据，状态一律 DRAFT，未发布）',
      `[seed] 账号 ${String(DEMO_USERS.length)} 个：${DEMO_USERS.map((u) => u.email).join(', ')}`,
      `[seed] 统一密码：${DEMO_PASSWORD}`,
      `[seed] 内容 ${String(contents.size)} 条；来源 ${String(sourceIds.length)} 条`,
      '[seed] 提醒：这些账号仅用于本地与 CI，生产环境禁止执行 seed',
    ].join('\n'),
  );
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[seed] 失败', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
