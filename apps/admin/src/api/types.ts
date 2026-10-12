/**
 * 后端 DTO 的 TypeScript 类型。
 *
 * 取值集合与 `apps/api` 的 zod schema 逐项对齐（不是照抄文档，是照抄实现）：
 * - 枚举值：packages/database/src/enums.ts
 * - 内容 DTO：apps/api/src/modules/contents/content.controller.ts `toAdminDto`
 * - 类型扩展：`createContentSchema` 的 `typeExtensionSchema`（discriminated union）
 * - 来源 / 标签 / 关联：apps/api/src/modules/sources/sources.controller.ts
 * - 媒体：apps/api/src/modules/media/media.controller.ts
 *
 * 本文件只放类型与常量，不含任何 fetch / 运行时逻辑（AGENTS.md §6.2）。
 */

// ---------------------------------------------------------------------------
// 枚举
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

export const CONTENT_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'ARCHIVED',
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const USER_ROLES = ['ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SOURCE_KINDS = ['ARCHIVE', 'BOOK', 'ARTICLE', 'WEBSITE', 'ORAL', 'OTHER'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const MEDIA_RIGHTS_STATUSES = [
  'PUBLIC_DOMAIN',
  'CC_BY',
  'CC_BY_SA',
  'CC_BY_NC',
  'CC_BY_NC_SA',
  'CC0',
  'LICENSED',
  'UNKNOWN',
  'RESTRICTED',
] as const;
export type MediaRightsStatus = (typeof MEDIA_RIGHTS_STATUSES)[number];

export const RELATION_TYPES = [
  'RELATED_TO',
  'PART_OF',
  'INFLUENCED',
  'CONTINUES',
  'REFERENCES',
  'LOCATED_AT',
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const PLACE_ACCURACIES = ['EXACT', 'APPROXIMATE', 'AREA_ONLY', 'UNKNOWN'] as const;
export type PlaceAccuracy = (typeof PLACE_ACCURACIES)[number];

export const VERIFICATION_STATUSES = ['UNVERIFIED', 'PARTIAL', 'VERIFIED', 'DISPUTED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const EVENT_DATE_PRECISIONS = ['YEAR', 'MONTH', 'DAY', 'UNKNOWN'] as const;
export type EventDatePrecision = (typeof EVENT_DATE_PRECISIONS)[number];

export const LANGUAGES = ['ZH', 'EN'] as const;
export type Language = (typeof LANGUAGES)[number];

export const CONTENT_ACTIONS = [
  'EDIT',
  'SUBMIT',
  'APPROVE',
  'REJECT',
  'PUBLISH',
  'ARCHIVE',
  'RESTORE',
] as const;
export type ContentAction = (typeof CONTENT_ACTIONS)[number];

/** 服务端乐观锁冲突的 code（apps/api global-exception.filter.ts）。 */
export const CONTENT_VERSION_CONFLICT = 'CONTENT_VERSION_CONFLICT';

// ---------------------------------------------------------------------------
// 类型扩展（discriminated union，服务端强校验 kind 与 type 一致）
// ---------------------------------------------------------------------------

export type TypeExtension =
  | {
      kind: 'PLACE';
      address?: string | null;
      lon?: number | null;
      lat?: number | null;
      accuracy?: PlaceAccuracy;
      verificationStatus?: VerificationStatus;
    }
  | {
      kind: 'PERSON';
      birthText?: string | null;
      deathText?: string | null;
      biographyNote?: string | null;
    }
  | {
      kind: 'EVENT';
      startDate?: string | null;
      endDate?: string | null;
      datePrecision?: EventDatePrecision;
      dateNote?: string | null;
    }
  | {
      kind: 'ARCHITECTURE';
      builtPeriod?: string | null;
      currentCondition?: string | null;
      heritageLevel?: string | null;
    }
  | {
      kind: 'TRADITION';
      /** 服务端 `z.string().min(1)` —— 该类型必填。 */
      traditionType: string;
      transmissionMethod?: string | null;
    }
  | { kind: 'TOPIC'; curatorNote?: string | null }
  | {
      kind: 'ROUTE';
      durationMinutes?: number | null;
      distanceMeters?: number | null;
    };

// ---------------------------------------------------------------------------
// 传输信封
// ---------------------------------------------------------------------------

export interface ApiEnvelope<T> {
  data: T;
}

/** 统一错误格式：`{ error: { code, message, details?, requestId } }`。 */
export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

// ---------------------------------------------------------------------------
// 认证
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: readonly UserRole[];
}

export interface AuthSession {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: AuthUser;
}

export interface CurrentUserDto {
  id: string;
  roles: readonly UserRole[];
}

// ---------------------------------------------------------------------------
// 用户与角色管理（FD-005）
// ---------------------------------------------------------------------------

/** 后台用户管理行。**不含**密码或密码哈希（服务端从不下发）。 */
export interface AdminUserDto {
  id: string;
  email: string;
  displayName: string;
  roles: readonly UserRole[];
  disabledAt: string | null;
}

export interface UserListPage {
  items: AdminUserDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
  roles: readonly UserRole[];
}

export interface PatchUserInput {
  displayName?: string;
  roles?: readonly UserRole[];
  disabled?: boolean;
  /** 只在重置时输入；服务端不回显、不记审计明文。 */
  password?: string;
}

// ---------------------------------------------------------------------------
// 审计日志（FD-006）
// ---------------------------------------------------------------------------

/**
 * 审计记录。
 *
 * `before` / `after` 是**已解析的对象**（服务端返回时解析好了），敏感字段
 * 的**值**在写入前已被替换成 `[REDACTED]` —— 字段名保留，便于看出"原本有"。
 */
export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  /** 只给展示名，不给 email。 */
  actorDisplayName: string | null;
  requestId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AuditSearchQuery {
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  /** ISO 8601。 */
  from?: string;
  /** ISO 8601。 */
  to?: string;
  cursor?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// 首页槽位（FD-007）
// ---------------------------------------------------------------------------

/**
 * 后台视角的槽位。
 *
 * 额外字段解释「为什么首页上不显示」：`activeState`（时间窗）与
 * `contentUnavailable`（内容状态）是**两个独立**原因，都要能看到。
 */
export interface AdminHomepageSlot {
  slotKey: string;
  contentId: string | null;
  contentTitle: string | null;
  contentStatus: string | null;
  position: number;
  startsAt: string | null;
  endsAt: string | null;
  activeState: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED';
  contentUnavailable: boolean;
  /** 同一内容还被挂在哪些槽位上。 */
  conflictWith: string[];
  updatedAt: string;
}

/** 可挂载到首页的内容候选；服务端只返回已发布且未归档的。 */
export interface HomepageCandidate {
  id: string;
  type: string;
  slug: string;
  title: string;
  status: string;
  publishedAt: string | null;
}

export interface HomepageSlotConfigInput {
  slotKey: string;
  contentId: string | null;
  position: number;
  /** ISO 8601；null 表示不限。 */
  startsAt: string | null;
  endsAt: string | null;
}

// ---------------------------------------------------------------------------
// 标签与关系（FD-008）
// ---------------------------------------------------------------------------

/** 标签 + 使用次数。 */
export interface TagWithUsage {
  slug: string;
  displayName: string;
  usageCount: number;
}

/** 关系方向：`OUTGOING` 本内容 → 对方；`INCOMING` 对方 → 本内容。 */
export type RelationDirection = 'OUTGOING' | 'INCOMING';

/**
 * 关联项（FD-008）。
 *
 * `otherContentId` 永远是**对方**，`direction` 说明本内容处于哪一侧 ——
 * 方向由服务端归一，前端不自己推断（否则"被指向的内容"会把自己当成关联对象）。
 * 刻意**不保留** `targetContentId`：那个字段名会诱导前端重新推断方向。
 */
export interface ContentRelationDto {
  otherContentId: string;
  otherTitle: string | null;
  otherType: string | null;
  relationType: string;
  direction: RelationDirection;
  /** 关系是否天然对称（`RELATED_TO`）。 */
  symmetric: boolean;
  directionNote: string | null;
}

/** 可作为关系目标的内容候选；允许是草稿。 */
export interface RelationTargetItem {
  id: string;
  type: string;
  slug: string;
  title: string;
  status: string;
}

// ---------------------------------------------------------------------------
// 路线站点（FD-009）
// ---------------------------------------------------------------------------

/**
 * 编排视角的路线站点。
 *
 * `place: null` = 站点占位还在、但引用的内容已被删除（保留占位是为了不打乱站序）。
 * `hasPoint: false` = 坐标未核验 → 站点仍在列表里，但**不会**画到地图上。
 */
export interface RouteStopAdminItem {
  position: number;
  note: string | null;
  place: {
    contentId: string;
    title: string;
    slug: string;
    status: string;
    /** 与 status 是两个独立维度：归档后 status 仍是 PUBLISHED。 */
    archivedAt: string | null;
    verificationStatus: string;
    accuracy: string;
    hasPoint: boolean;
    pointNote: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// 内容
// ---------------------------------------------------------------------------

export interface AdminContentDto {
  id: string;
  type: ContentType;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  body: unknown;
  status: ContentStatus;
  language: string;
  version: number;
  createdById: string;
  updatedById: string;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContentInput {
  type: ContentType;
  slug: string;
  title: string;
  subtitle?: string | null;
  summary?: string | null;
  body: unknown;
  language?: Language;
  extension: TypeExtension;
}

export interface AdminContentPatch {
  title?: string;
  subtitle?: string | null;
  summary?: string | null;
  body?: unknown;
  slug?: string;
  extension?: TypeExtension;
}

export interface ReadinessIssue {
  field: string;
  code: string;
  message: string;
}

export interface ReadinessResult {
  ready: boolean;
  issues: ReadinessIssue[];
}

// ---------------------------------------------------------------------------
// 来源 / 标签 / 关联
// ---------------------------------------------------------------------------

export interface SourceDto {
  id: string;
  kind: SourceKind;
  title: string;
  author: string | null;
  publisher: string | null;
  publicationDate: string | null;
  url: string | null;
  accessedAt: string | null;
  citationText: string | null;
  verificationNote: string | null;
}

export interface CreateSourceInput {
  kind: SourceKind;
  title: string;
  author?: string | null;
  publisher?: string | null;
  publicationDate?: string | null;
  url?: string | null;
  accessedAt?: string | null;
  citationText?: string | null;
  verificationNote?: string | null;
}

export interface ContentSourceLink {
  claimScope: string;
  pageReference: string | null;
  isPrimary: boolean;
  source: SourceDto;
}

export interface AttachSourceInput {
  sourceId: string;
  claimScope: string;
  pageReference?: string | null;
  isPrimary?: boolean;
}

export interface TagDto {
  slug: string;
  displayName: string;
}

export interface UpsertTagInput {
  slug: string;
  displayName: string;
}

export interface CreateRelationInput {
  targetContentId: string;
  relationType: string;
  directionNote?: string | null;
}

// ---------------------------------------------------------------------------
// 媒体
// ---------------------------------------------------------------------------

export interface UploadIntentDto {
  mediaId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface CreateUploadIntentInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MediaCompleteDto {
  id: string;
  rightsStatus: string;
  usableInPublic: boolean;
}

export interface CompleteMediaInput {
  checksum: string;
  altText: string;
  rightsStatus: MediaRightsStatus;
  license?: string | null;
  creditLine?: string | null;
  creator?: string | null;
  width?: number | null;
  height?: number | null;
}
