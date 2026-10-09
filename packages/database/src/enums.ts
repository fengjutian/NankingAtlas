/**
 * 数据库层 enum 字面量联合（SQLite 替代 PostgreSQL native enum）。
 *
 * 由于 SQLite 没有原生 ENUM 类型，Prisma schema 中所有 enum 列实际存为 String。
 * 应用层通过本文件的 as const 数组 + zod 校验保证取值范围。
 *
 * 取值集合与 PostgreSQL 版本保持一致；新增值需同步修改。
 */

export const USER_ROLES = ['ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

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

export const LANGUAGES = ['ZH', 'EN'] as const;
export type Language = (typeof LANGUAGES)[number];

export const VERIFICATION_STATUSES = ['UNVERIFIED', 'PARTIAL', 'VERIFIED', 'DISPUTED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const PLACE_ACCURACIES = ['EXACT', 'APPROXIMATE', 'AREA_ONLY', 'UNKNOWN'] as const;
export type PlaceAccuracy = (typeof PLACE_ACCURACIES)[number];

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

export const MEDIA_USAGES = ['HERO', 'GALLERY', 'ILLUSTRATION', 'ATTACHMENT'] as const;
export type MediaUsage = (typeof MEDIA_USAGES)[number];

export const REVIEW_ACTION_KINDS = [
  'SUBMIT',
  'APPROVE',
  'REJECT',
  'PUBLISH',
  'ARCHIVE',
  'REQUEST_CHANGES',
] as const;
export type ReviewActionKind = (typeof REVIEW_ACTION_KINDS)[number];

export const RELATION_TYPES = [
  'RELATED_TO',
  'PART_OF',
  'INFLUENCED',
  'CONTINUES',
  'REFERENCES',
  'LOCATED_AT',
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];
