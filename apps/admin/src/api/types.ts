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

export interface ContentRelationDto {
  targetContentId: string;
  relationType: string;
  directionNote: string | null;
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
