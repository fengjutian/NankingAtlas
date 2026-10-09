/**
 * 公开站 DTO 类型与运行时守卫（P2-03 ~ P2-08）。
 *
 * 设计：
 * - 事实来源是 `packages/api-contract` 的 OpenAPI 生成契约与 `apps/api` 的公开 DTO；
 *   本文件只做"公开站视图模型"，不复制 API 内部类型。
 * - 所有外部 JSON 都用 zod 在边界解析一次，页面内部只面对确定类型；
 *   解析失败一律降级，不抛给渲染层。
 * - 禁止 `any`：外部形状一律 `unknown` + schema。
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 枚举（技术方案 §5.1）
// ---------------------------------------------------------------------------

export const CONTENT_TYPES = [
  'PLACE',
  'PERSON',
  'EVENT',
  'ARCHITECTURE',
  'TRADITION',
  'TOPIC',
  'ROUTE',
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const LOCATION_ACCURACIES = ['EXACT', 'APPROXIMATE', 'AREA_ONLY', 'UNKNOWN'] as const;
export type LocationAccuracy = (typeof LOCATION_ACCURACIES)[number];

export const VERIFICATION_STATUSES = ['UNVERIFIED', 'PARTIAL', 'VERIFIED', 'DISPUTED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const RIGHTS_STATUSES = [
  'UNKNOWN',
  'LICENSED',
  'PUBLIC_DOMAIN',
  'FAIR_USE_REVIEWED',
  'OWNED',
  'RESTRICTED',
] as const;
export type RightsStatus = (typeof RIGHTS_STATUSES)[number];

export const SOURCE_KINDS = [
  'BOOK',
  'JOURNAL',
  'ARCHIVE',
  'WEBSITE',
  'INTERVIEW',
  'FIELD_NOTE',
  'OTHER',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** 技术方案 §5.3 / AGENTS.md §3.5：这两类版权状态不得在公开页面展示。 */
export const NON_PUBLIC_RIGHTS: readonly RightsStatus[] = ['UNKNOWN', 'RESTRICTED'];

export const CONTENT_TYPE_LABELS: Readonly<Record<ContentType, string>> = {
  PLACE: '地点',
  PERSON: '人物',
  EVENT: '事件',
  ARCHITECTURE: '建筑',
  TRADITION: '民俗',
  TOPIC: '专题',
  ROUTE: '路线',
};

export const ACCURACY_LABELS: Readonly<Record<LocationAccuracy, string>> = {
  EXACT: '精确点位',
  APPROXIMATE: '近似点位',
  AREA_ONLY: '仅区域级',
  UNKNOWN: '坐标未核验',
};

export const VERIFICATION_LABELS: Readonly<Record<VerificationStatus, string>> = {
  UNVERIFIED: '未核验',
  PARTIAL: '部分核验',
  VERIFIED: '已核验',
  DISPUTED: '存在争议',
};

export const RIGHTS_LABELS: Readonly<Record<RightsStatus, string>> = {
  UNKNOWN: '版权状态未知',
  LICENSED: '已授权',
  PUBLIC_DOMAIN: '公有领域',
  FAIR_USE_REVIEWED: '已审合理使用',
  OWNED: '自有版权',
  RESTRICTED: '受限，禁止公开',
};

export const SOURCE_KIND_LABELS: Readonly<Record<SourceKind, string>> = {
  BOOK: '著作',
  JOURNAL: '期刊',
  ARCHIVE: '档案',
  WEBSITE: '网站',
  INTERVIEW: '采访',
  FIELD_NOTE: '田野记录',
  OTHER: '其他',
};

export function contentTypeLabel(type: ContentType): string {
  return CONTENT_TYPE_LABELS[type];
}

export function isContentType(value: unknown): value is ContentType {
  return typeof value === 'string' && (CONTENT_TYPES as readonly string[]).includes(value);
}

export function isLocationAccuracy(value: unknown): value is LocationAccuracy {
  return typeof value === 'string' && (LOCATION_ACCURACIES as readonly string[]).includes(value);
}

export function isVerificationStatus(value: unknown): value is VerificationStatus {
  return typeof value === 'string' && (VERIFICATION_STATUSES as readonly string[]).includes(value);
}

export function isRightsStatus(value: unknown): value is RightsStatus {
  return typeof value === 'string' && (RIGHTS_STATUSES as readonly string[]).includes(value);
}

export function isSourceKind(value: unknown): value is SourceKind {
  return typeof value === 'string' && (SOURCE_KINDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// 公开内容
// ---------------------------------------------------------------------------

/** `GET /api/v1/contents` 与 `GET /api/v1/contents/:slug` 的公开 DTO（apps/api content.controller.ts）。 */
export const publicContentSchema = z.object({
  id: z.string().min(1),
  type: z.enum(CONTENT_TYPES),
  slug: z.string().min(1),
  title: z.string(),
  subtitle: z.string().nullable(),
  summary: z.string().nullable(),
  body: z.unknown(),
  language: z.string(),
  publishedAt: z.string().nullable(),
});

export type PublicContent = z.infer<typeof publicContentSchema>;

/**
 * `/places/:slug` 的公开 DTO：公开内容 + 地点扩展字段（全部可缺省）。
 * 未声明的字段被 zod 剥离，因此内部备注不会随页面数据外泄。
 */
export const publicPlaceSchema = publicContentSchema.extend({
  address: z.string().nullable().optional(),
  lon: z.number().nullable().optional(),
  lat: z.number().nullable().optional(),
  accuracy: z.enum(LOCATION_ACCURACIES).nullable().optional(),
  verificationStatus: z.enum(VERIFICATION_STATUSES).nullable().optional(),
});

export type PlaceContent = z.infer<typeof publicPlaceSchema>;

export const publicContentListSchema = z.object({ data: z.array(publicContentSchema) });

/** 类型专属字段（技术方案 §5.2）。公开端点在 P2 尚未全部开放，字段一律可缺省。 */
export const placeExtensionSchema = z.object({
  address: z.string().nullable().optional(),
  lon: z.number().nullable().optional(),
  lat: z.number().nullable().optional(),
  accuracy: z.enum(LOCATION_ACCURACIES).nullable().optional(),
  verificationStatus: z.enum(VERIFICATION_STATUSES).nullable().optional(),
});
export type PlaceExtension = z.infer<typeof placeExtensionSchema>;

export const topicExtensionSchema = z.object({
  curatorNote: z.string().nullable().optional(),
});
export type TopicExtension = z.infer<typeof topicExtensionSchema>;

export const routeStopSchema = z.object({
  position: z.number().int().nonnegative(),
  placeSlug: z.string().nullable().optional(),
  placeTitle: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});
export type RouteStop = z.infer<typeof routeStopSchema>;

export const routeExtensionSchema = z.object({
  durationMinutes: z.number().nullable().optional(),
  distanceMeters: z.number().nullable().optional(),
  stops: z.array(routeStopSchema).nullable().optional(),
});
export type RouteExtension = z.infer<typeof routeExtensionSchema>;

export const personExtensionSchema = z.object({
  birthText: z.string().nullable().optional(),
  deathText: z.string().nullable().optional(),
  biographyNote: z.string().nullable().optional(),
});
export type PersonExtension = z.infer<typeof personExtensionSchema>;

export const eventExtensionSchema = z.object({
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  datePrecision: z.enum(['YEAR', 'MONTH', 'DAY', 'UNKNOWN']).nullable().optional(),
  dateNote: z.string().nullable().optional(),
});
export type EventExtension = z.infer<typeof eventExtensionSchema>;

export const architectureExtensionSchema = z.object({
  builtPeriod: z.string().nullable().optional(),
  currentCondition: z.string().nullable().optional(),
  heritageLevel: z.string().nullable().optional(),
});
export type ArchitectureExtension = z.infer<typeof architectureExtensionSchema>;

export const traditionExtensionSchema = z.object({
  traditionType: z.string().nullable().optional(),
  transmissionMethod: z.string().nullable().optional(),
});
export type TraditionExtension = z.infer<typeof traditionExtensionSchema>;

/** `GET /api/v1/homepage`：本轮由 API 侧实现，缺失时页面降级。 */
export const homepageSchema = z.object({
  slots: z
    .array(
      z.object({
        key: z.string(),
        title: z.string().nullable().optional(),
        contents: z.array(publicContentSchema).default([]),
      }),
    )
    .default([]),
  latest: z.array(publicContentSchema).default([]),
  featured: z.array(publicContentSchema).default([]),
});
export type Homepage = z.infer<typeof homepageSchema>;

// ---------------------------------------------------------------------------
// 来源 / 关联 / 媒体
// ---------------------------------------------------------------------------

export const publicSourceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(SOURCE_KINDS),
  title: z.string(),
  author: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  publicationDate: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  citationText: z.string().nullable().optional(),
  verificationNote: z.string().nullable().optional(),
  claimScope: z.string().nullable().optional(),
  pageReference: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
});
export type PublicSource = z.infer<typeof publicSourceSchema>;

export const contentRelationSchema = z.object({
  relationType: z.string(),
  directionNote: z.string().nullable().optional(),
  targetSlug: z.string().nullable().optional(),
  targetTitle: z.string().nullable().optional(),
  targetType: z.enum(CONTENT_TYPES).nullable().optional(),
});
export type ContentRelation = z.infer<typeof contentRelationSchema>;

export const publicMediaSchema = z.object({
  url: z.string(),
  altText: z.string().nullable().optional(),
  creditLine: z.string().nullable().optional(),
  rightsStatus: z.enum(RIGHTS_STATUSES),
  caption: z.string().nullable().optional(),
});
export type PublicMedia = z.infer<typeof publicMediaSchema>;

/**
 * 公开页面媒体准入（技术方案 §5.3 / AGENTS.md §3.6）。
 *
 * 规则：版权状态 `UNKNOWN` / `RESTRICTED` 一律不展示；
 * 且公开图片必须同时具备 alt 与 credit line，否则无法满足可访问性与署名要求。
 * 返回可直接渲染的媒体列表，被过滤的条目由调用方在"版权说明"里说明数量。
 */
export function selectPublicMedia(items: readonly PublicMedia[]): readonly PublicMedia[] {
  return items.filter((item) => {
    if (NON_PUBLIC_RIGHTS.includes(item.rightsStatus)) return false;
    return hasText(item.altText) && hasText(item.creditLine);
  });
}

export function countHiddenMedia(items: readonly PublicMedia[]): number {
  return items.length - selectPublicMedia(items).length;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

// ---------------------------------------------------------------------------
// 坐标展示规则（AGENTS.md §3.5）
// ---------------------------------------------------------------------------

/**
 * 是否允许展示精确经纬度。
 *
 * AGENTS.md §3.5：「未确认坐标不得猜测精确点」
 * 技术方案 §9.2：「未核实或仅区域级位置不画精确点」
 *
 * 判据与后端 `places-query.service.ts` 的 `hasTrustedPoint` **必须一致**：
 *   `accuracy === 'EXACT'` **且** `verificationStatus === 'VERIFIED'`
 *
 * 曾经这里写成 `EXACT || APPROXIMATE` 且不看核验状态，
 * 结果同一条目在 `/map` 被拒绝画点、详情页却打印 5 位小数。
 */
export function canShowExactCoordinates(
  accuracy: LocationAccuracy | null | undefined,
  verificationStatus?: VerificationStatus | null,
): boolean {
  if (verificationStatus !== undefined && verificationStatus !== null) {
    return accuracy === 'EXACT' && verificationStatus === 'VERIFIED';
  }
  // 没传核验状态时退化为只看精度（调用方若同时要求核验，
  // 应自行再判一次；map-data 的 canRenderMarker 已额外要求 hasPoint）。
  return accuracy === 'EXACT';
}

export function formatCoordinates(
  lon: number | null | undefined,
  lat: number | null | undefined,
): string | null {
  if (typeof lon !== 'number' || typeof lat !== 'number') return null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}（纬度, 经度）`;
}

// ---------------------------------------------------------------------------
// 展示辅助
// ---------------------------------------------------------------------------

export interface TypeFact {
  readonly label: string;
  readonly value: string;
  /** 缺省或受限字段的补充说明（例如"坐标未核验，不展示精确经纬度"）。 */
  readonly note?: string;
}

/** 类型专属字段的统一容器。字段全部可缺省 —— 公开端点未开放时页面降级展示。 */
export interface TypeExtras {
  readonly place?: PlaceExtension | null;
  readonly topic?: TopicExtension | null;
  readonly route?: RouteExtension | null;
  readonly person?: PersonExtension | null;
  readonly event?: EventExtension | null;
  readonly architecture?: ArchitectureExtension | null;
  readonly tradition?: TraditionExtension | null;
}

function text(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function push(facts: TypeFact[], label: string, value: string | null, note?: string): void {
  if (value !== null) {
    facts.push(note === undefined ? { label, value } : { label, value, note });
    return;
  }
  facts.push({ label, value: '暂缺', note: note ?? '公开接口尚未提供该字段' });
}

/**
 * 生成详情页"类型专属字段区"。
 *
 * 坐标规则（AGENTS.md §3.5）：只有 `EXACT` 且核验状态为 `VERIFIED` 才展示
 * 精确经纬度，否则只说明精度与核验状态。
 */
export function buildTypeFacts(content: PublicContent, extras: TypeExtras = {}): TypeFact[] {
  const facts: TypeFact[] = [];
  switch (content.type) {
    case 'PLACE': {
      const place = extras.place ?? {};
      push(facts, '地址', text(place.address));
      push(
        facts,
        '坐标精度',
        place.accuracy != null ? ACCURACY_LABELS[place.accuracy] : null,
        place.accuracy === 'UNKNOWN' || place.accuracy === 'AREA_ONLY'
          ? '坐标未核验或仅为区域级，不展示精确经纬度'
          : undefined,
      );
      push(
        facts,
        '核验状态',
        place.verificationStatus != null ? VERIFICATION_LABELS[place.verificationStatus] : null,
      );
      if (canShowExactCoordinates(place.accuracy, place.verificationStatus)) {
        push(facts, '经纬度', formatCoordinates(place.lon, place.lat));
      } else {
        push(facts, '经纬度', '暂不展示', '坐标精度不足以支持精确点位');
      }
      break;
    }
    case 'TOPIC': {
      push(facts, '策展笔记', text(extras.topic?.curatorNote));
      break;
    }
    case 'ROUTE': {
      const route = extras.route ?? {};
      push(
        facts,
        '建议时长',
        typeof route.durationMinutes === 'number' ? `${route.durationMinutes} 分钟` : null,
      );
      push(
        facts,
        '路线长度',
        typeof route.distanceMeters === 'number' ? formatDistance(route.distanceMeters) : null,
      );
      push(
        facts,
        '站点数量',
        typeof route.stops === 'number' || Array.isArray(route.stops)
          ? `${(route.stops ?? []).length} 站`
          : null,
      );
      break;
    }
    case 'PERSON': {
      const person = extras.person ?? {};
      push(facts, '生年', text(person.birthText));
      push(facts, '卒年', text(person.deathText));
      push(facts, '生平说明', text(person.biographyNote));
      break;
    }
    case 'EVENT': {
      const event = extras.event ?? {};
      push(facts, '开始时间', text(event.startDate));
      push(facts, '结束时间', text(event.endDate));
      push(facts, '日期精度', event.datePrecision ?? null);
      push(facts, '日期说明', text(event.dateNote));
      break;
    }
    case 'ARCHITECTURE': {
      const architecture = extras.architecture ?? {};
      push(facts, '建造年代', text(architecture.builtPeriod));
      push(facts, '现状', text(architecture.currentCondition));
      push(facts, '保护级别', text(architecture.heritageLevel));
      break;
    }
    case 'TRADITION': {
      const tradition = extras.tradition ?? {};
      push(facts, '类型', text(tradition.traditionType));
      push(facts, '传承方式', text(tradition.transmissionMethod));
      break;
    }
    default: {
      break;
    }
  }
  return facts;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '';
  if (meters < 1000) return `${Math.round(meters)} 米`;
  return `${(meters / 1000).toFixed(1)} 公里`;
}

/** 统一的中文日期格式；无第三方 date 库（AGENTS.md §6.5）。 */
export function formatDateZh(iso: string | null | undefined): string {
  if (typeof iso !== 'string' || iso === '') return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

/** 取用于列表/OG 的纯文本摘要：优先 summary，其次正文纯文本截断。 */
export function buildExcerpt(
  summary: string | null | undefined,
  bodyText: string,
  maxLength = 120,
): string {
  const base =
    typeof summary === 'string' && summary.trim() !== '' ? summary.trim() : bodyText.trim();
  const collapsed = base.replace(/\s+/g, ' ');
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength)}…`;
}

/** 路由前缀 → 详情页路径。未知类型回落到文化志，避免生成死链。 */
export const DETAIL_PATHS: Readonly<Record<ContentType, string>> = {
  PLACE: '/places',
  PERSON: '/people',
  EVENT: '/events',
  ARCHITECTURE: '/architectures',
  TRADITION: '/chronicle',
  TOPIC: '/topics',
  ROUTE: '/routes',
};

/** 文化志收录的类型（历史长文与档案）。 */
export const CHRONICLE_TYPES: readonly ContentType[] = [
  'PERSON',
  'EVENT',
  'ARCHITECTURE',
  'TRADITION',
  'TOPIC',
];

/** 生活录收录的类型（当代街巷、饮食与日常记录）。 */
export const LIVING_TYPES: readonly ContentType[] = ['PLACE', 'TOPIC'];

export function detailHref(content: { type: ContentType; slug: string }): string {
  return `${DETAIL_PATHS[content.type]}/${content.slug}`;
}

/** 关键词匹配（列表本地筛选；服务端搜索在 P3 接入）。 */
export function matchesKeyword(
  fields: readonly (string | null | undefined)[],
  keyword: string,
): boolean {
  const needle = keyword.trim().toLowerCase();
  if (needle === '') return true;
  return fields.some((field) => typeof field === 'string' && field.toLowerCase().includes(needle));
}
