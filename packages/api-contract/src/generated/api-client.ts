// AUTO-GENERATED — DO NOT EDIT
//
// 本文件由 `apps/api/scripts/generate-openapi.ts` 生成，不要手工编辑。
// 重新生成：pnpm --filter @nanking-atlas/api openapi:generate
// 规范来源：apps/api/src/openapi.ts
//
// 契约纪律（技术方案 §7.3 + AGENTS.md §6.3）：跨 app 的类型一律来自本文件；
// web/admin 禁止自行复制 DTO 定义，也禁止 import apps/api 的内部模块。

/* eslint-disable */
// 下面这一行把生成文件标记为非人工维护：lint / 格式问题请回到生成器修，不要改这里。

/** 路径 → 该路径上已声明的 HTTP 方法（大写，可直接传给 `fetch`）。 */
export const NLA_API_PATHS = {
  '/health/live': ['GET'] as const,
  '/health/ready': ['GET'] as const,
  '/api/v1/auth/login': ['POST'] as const,
  '/api/v1/auth/refresh': ['POST'] as const,
  '/api/v1/auth/logout': ['POST'] as const,
  '/api/v1/auth/me': ['GET'] as const,
  '/api/v1/contents': ['GET'] as const,
  '/api/v1/contents/{slug}': ['GET'] as const,
  '/api/v1/places': ['GET'] as const,
  '/api/v1/places/{slug}': ['GET'] as const,
  '/api/v1/routes/{slug}': ['GET'] as const,
  '/api/v1/search': ['GET'] as const,
  '/api/v1/admin/places/reindex': ['POST'] as const,
  '/api/v1/admin/contents': ['GET', 'POST'] as const,
  '/api/v1/admin/contents/{id}': ['GET', 'PATCH'] as const,
  '/api/v1/admin/contents/{id}/transition': ['POST'] as const,
  '/api/v1/admin/contents/{id}/readiness': ['GET'] as const,
  '/api/v1/admin/contents/{id}/revisions': ['GET'] as const,
  '/api/v1/admin/contents/{id}/review-actions': ['GET'] as const,
  '/api/v1/admin/sources': ['GET', 'POST'] as const,
  '/api/v1/admin/contents/{id}/sources': ['POST', 'GET'] as const,
  '/api/v1/admin/tags': ['GET', 'POST'] as const,
  '/api/v1/admin/contents/{id}/tags': ['POST', 'GET'] as const,
  '/api/v1/admin/contents/{id}/relations': ['POST', 'GET'] as const,
  '/api/v1/admin/relation-targets': ['GET'] as const,
  '/api/v1/admin/routes/{id}/stops': ['GET', 'PUT'] as const,
  '/api/v1/admin/media/upload-intents': ['POST'] as const,
  '/api/v1/admin/media/{id}/complete': ['POST'] as const,
  '/api/v1/admin/users': ['GET', 'POST'] as const,
  '/api/v1/admin/users/{id}': ['PATCH'] as const,
  '/api/v1/homepage': ['GET'] as const,
  '/api/v1/admin/homepage-slots': ['GET', 'PATCH'] as const,
  '/api/v1/admin/homepage-slots/candidates': ['GET'] as const,
  '/api/v1/admin/audit-logs': ['GET'] as const,
} as const satisfies { readonly [P in NlaPath]: readonly NlaMethod[] };

export type ErrorResponse = {
  readonly error: {
    readonly code:
      | 'VALIDATION_FAILED'
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'RATE_LIMITED'
      | 'INTERNAL_ERROR'
      | 'SERVICE_UNAVAILABLE'
      | 'CONTENT_VERSION_CONFLICT'
      | 'CONTENT_SLUG_TAKEN'
      | 'CONTENT_STATE_INVALID'
      | 'PUBLICATION_NOT_READY'
      | 'INVALID_CREDENTIALS'
      | 'TOKEN_EXPIRED'
      | 'TOKEN_REVOKED'
      | 'ACCOUNT_DISABLED'
      | 'UPLOAD_INVALID'
      | 'UPLOAD_NOT_FOUND'
      | 'UPLOAD_MIME_MISMATCH'
      | 'MEDIA_RIGHTS_NOT_CLEARED';
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
    readonly requestId: string;
  };
};

export type ErrorDetail = Readonly<Record<string, unknown>>;

export type LoginRequest = { readonly email: string; readonly password: string };

export type RefreshRequest = Readonly<Record<string, unknown>>;

export type AuthSession = {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly roles: readonly UserRole[];
  };
};

export type AuthSessionResponse = { readonly data: AuthSession };

export type Me = { readonly id: string; readonly roles: readonly UserRole[] };

export type MeResponse = { readonly data: Me };

export type UserRole = 'ADMIN' | 'EDITOR' | 'REVIEWER' | 'VIEWER';

export type User = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly UserRole[];
  readonly disabledAt?: string | null | null;
};

export type CreateUserRequest = {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly roles: readonly UserRole[];
};

export type PatchUserRequest = {
  readonly displayName?: string;
  readonly roles?: readonly UserRole[];
  readonly disabled?: boolean;
  readonly password?: string;
};

export type UserResponse = { readonly data: User };

export type UserListPage = {
  readonly items: readonly User[];
  readonly nextCursor: string | null | null;
  readonly hasMore: boolean;
};

export type UserListResponse = { readonly data: UserListPage };

export type AuditLogEntry = {
  readonly id: string;
  readonly actorId: string | null | null;
  readonly actorDisplayName: string | null | null;
  readonly requestId: string | null | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly createdAt: string;
};

export type AuditLogPage = {
  readonly items: readonly AuditLogEntry[];
  readonly nextCursor: string | null | null;
  readonly hasMore: boolean;
};

export type AuditLogListResponse = { readonly data: AuditLogPage };

export type PublicSlot = {
  readonly slotKey: string;
  readonly position: number;
  readonly content: unknown;
};

export type Homepage = {
  readonly slots: readonly PublicSlot[];
  readonly featured: readonly ContentPublic[];
  readonly latest: readonly ContentPublic[];
};

export type HomepageResponse = { readonly data: Homepage };

export type AdminHomepageSlot = {
  readonly slotKey: string;
  readonly contentId: string | null | null;
  readonly contentTitle: string | null | null;
  readonly contentStatus: string | null | null;
  readonly position: number;
  readonly startsAt: string | null | null;
  readonly endsAt: string | null | null;
  readonly activeState: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED';
  readonly contentUnavailable: boolean;
  readonly conflictWith: readonly string[];
  readonly updatedAt: string;
};

export type AdminHomepageSlotListResponse = { readonly data: readonly AdminHomepageSlot[] };

export type HomepageSlot = {
  readonly slotKey: string;
  readonly position: number;
  readonly contentId: string | null | null;
};

export type HomepageSlotResponse = { readonly data: HomepageSlot };

export type HomepageSlotConfigRequest = {
  readonly slotKey: 'hero' | 'featured' | 'latest' | 'places' | 'routes';
  readonly contentId: string | null | null;
  readonly position?: number;
  readonly startsAt?: string | null | null;
  readonly endsAt?: string | null | null;
};

export type HomepageCandidate = {
  readonly id: string;
  readonly type: 'PLACE' | 'PERSON' | 'EVENT' | 'ARCHITECTURE' | 'TRADITION' | 'TOPIC' | 'ROUTE';
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly publishedAt: string | null | null;
};

export type HomepageCandidateList = { readonly items: readonly HomepageCandidate[] };

export type HomepageCandidateListResponse = { readonly data: HomepageCandidateList };

export type ContentType =
  'PLACE' | 'PERSON' | 'EVENT' | 'ARCHITECTURE' | 'TRADITION' | 'TOPIC' | 'ROUTE';

export type ContentStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

export type ContentExtension =
  | {
      readonly kind: 'PLACE';
      readonly address?: string | null | null;
      readonly lon?: number | null | null;
      readonly lat?: number | null | null;
      readonly accuracy?: 'EXACT' | 'APPROXIMATE' | 'AREA_ONLY' | 'UNKNOWN';
      readonly verificationStatus?: 'UNVERIFIED' | 'PARTIAL' | 'VERIFIED' | 'DISPUTED';
    }
  | {
      readonly kind: 'PERSON';
      readonly birthText?: string | null | null;
      readonly deathText?: string | null | null;
      readonly biographyNote?: string | null | null;
    }
  | {
      readonly kind: 'EVENT';
      readonly startDate?: string | null | null;
      readonly endDate?: string | null | null;
      readonly datePrecision?: 'YEAR' | 'MONTH' | 'DAY' | 'UNKNOWN';
      readonly dateNote?: string | null | null;
    }
  | {
      readonly kind: 'ARCHITECTURE';
      readonly builtPeriod?: string | null | null;
      readonly currentCondition?: string | null | null;
      readonly heritageLevel?: string | null | null;
    }
  | {
      readonly kind: 'TRADITION';
      readonly traditionType?: string;
      readonly transmissionMethod?: string | null | null;
    }
  | { readonly kind: 'TOPIC'; readonly curatorNote?: string | null | null }
  | {
      readonly kind: 'ROUTE';
      readonly durationMinutes?: number | null | null;
      readonly distanceMeters?: number | null | null;
    };

export type TiptapDocument = { readonly type: 'doc'; readonly content?: readonly unknown[] };

export type ContentPublic = {
  readonly id: string;
  readonly type: ContentType;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null | null;
  readonly summary: string | null | null;
  readonly body: TiptapDocument;
  readonly language: 'ZH' | 'EN';
  readonly publishedAt: string | null | null;
};

export type ContentAdmin = {
  readonly id: string;
  readonly type: ContentType;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null | null;
  readonly summary: string | null | null;
  readonly body: TiptapDocument;
  readonly status: ContentStatus;
  readonly language: 'ZH' | 'EN';
  readonly version: number;
  readonly createdById: string;
  readonly updatedById: string;
  readonly publishedAt: string | null | null;
  readonly archivedAt: string | null | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type Bbox = {
  readonly minLon: number;
  readonly minLat: number;
  readonly maxLon: number;
  readonly maxLat: number;
};

export type GeoPoint = { readonly lon: number; readonly lat: number };

export type PlaceBboxItem = {
  readonly slug: string;
  readonly title: string;
  readonly summary: string | null | null;
  readonly type: ContentType;
  readonly lon: number | null | null;
  readonly lat: number | null | null;
  readonly hasPoint: boolean;
  readonly note: string | null | null;
  readonly accuracy: 'EXACT' | 'APPROXIMATE' | 'AREA_ONLY' | 'UNKNOWN';
  readonly verificationStatus: 'UNVERIFIED' | 'PARTIAL' | 'VERIFIED' | 'DISPUTED';
};

export type PlaceBbox = {
  readonly bbox: Bbox;
  readonly center: GeoPoint;
  readonly total: number;
  readonly truncated: boolean;
  readonly items: readonly PlaceBboxItem[];
};

export type RouteStopPlace = {
  readonly slug: string;
  readonly title: string;
  readonly accuracy: 'EXACT' | 'APPROXIMATE' | 'AREA_ONLY' | 'UNKNOWN';
  readonly verificationStatus: 'UNVERIFIED' | 'PARTIAL' | 'VERIFIED' | 'DISPUTED';
  readonly lon: number | null | null;
  readonly lat: number | null | null;
  readonly hasPoint: boolean;
  readonly pointNote: string | null | null;
};

export type RouteStop = {
  readonly position: number;
  readonly note: string | null | null;
  readonly place: unknown;
};

export type Route = {
  readonly slug: string;
  readonly title: string;
  readonly summary: string | null | null;
  readonly durationMinutes: number | null | null;
  readonly distanceMeters: number | null | null;
  readonly stopCount: number;
  readonly stops: readonly RouteStop[];
  readonly line: readonly GeoPoint[];
};

export type SearchHit = {
  readonly slug: string;
  readonly type: ContentType;
  readonly title: string;
  readonly summary: string | null | null;
  readonly matchedOn: 'title' | 'summary' | 'body' | 'tag';
};

export type SearchResult = {
  readonly query: string;
  readonly total: number;
  readonly items: readonly SearchHit[];
  readonly suggestions: readonly string[];
  readonly backend: 'like';
};

export type ReindexResult = { readonly ok: boolean };

export type CreateContentRequest = {
  readonly type: ContentType;
  readonly slug: string;
  readonly title: string;
  readonly subtitle?: string | null | null;
  readonly summary?: string | null | null;
  readonly body: TiptapDocument;
  readonly language?: 'ZH' | 'EN';
  readonly extension: ContentExtension;
};

export type PatchContentRequest = {
  readonly title?: string;
  readonly subtitle?: string | null | null;
  readonly summary?: string | null | null;
  readonly body?: TiptapDocument;
  readonly slug?: string;
  readonly extension?: ContentExtension;
};

export type TransitionRequest = {
  readonly action: 'EDIT' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'PUBLISH' | 'ARCHIVE' | 'RESTORE';
  readonly reason?: string;
};

export type ContentPublicResponse = { readonly data: ContentPublic };

export type ContentPublicListResponse = { readonly data: readonly ContentPublic[] };

export type ContentAdminResponse = { readonly data: ContentAdmin };

export type ContentAdminListResponse = { readonly data: readonly ContentAdmin[] };

export type PlaceBboxResponse = { readonly data: PlaceBbox };

export type RouteResponse = { readonly data: Route };

export type SearchResponse = { readonly data: SearchResult };

export type ReindexResponse = { readonly data: ReindexResult };

export type ReadinessIssue = {
  readonly field: string;
  readonly code: string;
  readonly message: string;
};

export type ReadinessReport = {
  readonly ready: boolean;
  readonly issues: readonly ReadinessIssue[];
};

export type ReadinessResponse = { readonly data: ReadinessReport };

export type HistoryActor = { readonly id: string; readonly displayName: string };

export type RevisionSnapshot = {
  readonly title: string;
  readonly subtitle: string | null | null;
  readonly summary: string | null | null;
  readonly slug: string;
  readonly bodyText: string;
  readonly bodyTextLength: number;
  readonly bodyTextTruncated: boolean;
};

export type Revision = {
  readonly revisionNo: number;
  readonly createdAt: string;
  readonly action: 'CREATE' | 'UPDATE';
  readonly actor: HistoryActor;
  readonly snapshot: RevisionSnapshot;
};

export type RevisionPage = {
  readonly items: readonly Revision[];
  readonly nextCursor: string | null | null;
  readonly hasMore: boolean;
};

export type ReviewActionRecord = {
  readonly action: 'EDIT' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'PUBLISH' | 'ARCHIVE' | 'RESTORE';
  readonly fromStatus: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  readonly toStatus: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  readonly reason: string | null | null;
  readonly createdAt: string;
  readonly actor: HistoryActor;
};

export type ReviewActionPage = {
  readonly items: readonly ReviewActionRecord[];
  readonly nextCursor: string | null | null;
  readonly hasMore: boolean;
};

export type RevisionPageResponse = { readonly data: RevisionPage };

export type ReviewActionPageResponse = { readonly data: ReviewActionPage };

export type Source = {
  readonly id: string;
  readonly kind: 'ARCHIVE' | 'BOOK' | 'ARTICLE' | 'WEBSITE' | 'ORAL' | 'OTHER';
  readonly title: string;
  readonly author?: string | null | null;
  readonly publisher?: string | null | null;
  readonly publicationDate?: string | null | null;
  readonly url?: string | null | null;
  readonly accessedAt?: string | null | null;
  readonly citationText?: string | null | null;
  readonly verificationNote?: string | null | null;
};

export type CreateSourceRequest = {
  readonly kind: 'ARCHIVE' | 'BOOK' | 'ARTICLE' | 'WEBSITE' | 'ORAL' | 'OTHER';
  readonly title: string;
  readonly author?: string | null | null;
  readonly publisher?: string | null | null;
  readonly publicationDate?: string | null | null;
  readonly url?: string | null | null;
  readonly accessedAt?: string | null | null;
  readonly citationText?: string | null | null;
  readonly verificationNote?: string | null | null;
};

export type AttachSourceRequest = {
  readonly sourceId: string;
  readonly claimScope: string;
  readonly pageReference?: string | null | null;
  readonly isPrimary?: boolean;
};

export type SourceResponse = { readonly data: Source };

export type SourceSearchResult = {
  readonly id: string;
  readonly kind: 'ARCHIVE' | 'BOOK' | 'ARTICLE' | 'WEBSITE' | 'ORAL' | 'OTHER';
  readonly title: string;
  readonly author: string | null | null;
  readonly publisher: string | null | null;
  readonly publicationDate: string | null | null;
  readonly accessedAt: string | null | null;
  readonly verificationNote: string | null | null;
};

export type SourceSearchPage = {
  readonly items: readonly SourceSearchResult[];
  readonly nextCursor: string | null | null;
  readonly hasMore: boolean;
};

export type SourceSearchQuery = {
  readonly q?: string;
  readonly kind?: 'ARCHIVE' | 'BOOK' | 'ARTICLE' | 'WEBSITE' | 'ORAL' | 'OTHER';
  readonly sort?: 'createdAt:desc' | 'title:asc';
  readonly limit?: number;
  readonly cursor?: string;
};

export type SourceSearchResponse = { readonly data: SourceSearchPage };

export type ContentSource = {
  readonly claimScope: string;
  readonly pageReference: string | null | null;
  readonly isPrimary: boolean;
  readonly source: Source;
};

export type ContentSourceListResponse = { readonly data: readonly ContentSource[] };

export type Tag = { readonly slug: string; readonly displayName: string };

export type UpsertTagRequest = { readonly slug: string; readonly displayName: string };

export type AttachTagRequest = { readonly tagSlug: string };

export type TagResponse = { readonly data: Tag };

export type TagListResponse = { readonly data: readonly Tag[] };

export type ContentRelation = {
  readonly otherContentId: string;
  readonly otherTitle: string | null | null;
  readonly otherType: string | null | null;
  readonly relationType:
    'RELATED_TO' | 'PART_OF' | 'INFLUENCED' | 'CONTINUES' | 'REFERENCES' | 'LOCATED_AT';
  readonly direction: 'OUTGOING' | 'INCOMING';
  readonly symmetric: boolean;
  readonly directionNote: string | null | null;
};

export type CreateRelationRequest = {
  readonly targetContentId: string;
  readonly relationType:
    'RELATED_TO' | 'PART_OF' | 'INFLUENCED' | 'CONTINUES' | 'REFERENCES' | 'LOCATED_AT';
  readonly directionNote?: string | null | null;
};

export type ContentRelationListResponse = { readonly data: readonly ContentRelation[] };

export type RelationTarget = {
  readonly id: string;
  readonly type: 'PLACE' | 'PERSON' | 'EVENT' | 'ARCHITECTURE' | 'TRADITION' | 'TOPIC' | 'ROUTE';
  readonly slug: string;
  readonly title: string;
  readonly status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
};

export type RelationTargetList = { readonly items: readonly RelationTarget[] };

export type RelationTargetListResponse = { readonly data: RelationTargetList };

export type TagWithUsage = {
  readonly slug: string;
  readonly displayName: string;
  readonly usageCount: number;
};

export type TagWithUsageList = { readonly items: readonly TagWithUsage[] };

export type TagWithUsageListResponse = { readonly data: TagWithUsageList };

export type RouteStopAdminItem = {
  readonly position: number;
  readonly note: string | null | null;
  readonly place: unknown;
};

export type RouteStopAdminPlace = {
  readonly contentId: string;
  readonly title: string;
  readonly slug: string;
  readonly status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  readonly archivedAt: string | null | null;
  readonly verificationStatus: 'UNVERIFIED' | 'PARTIAL' | 'VERIFIED' | 'DISPUTED';
  readonly accuracy: string;
  readonly hasPoint: boolean;
  readonly pointNote: string | null | null;
};

export type RouteStopAdminList = { readonly stops: readonly RouteStopAdminItem[] };

export type RouteStopAdminListResponse = { readonly data: RouteStopAdminList };

export type ReplaceRouteStopsRequest = {
  readonly stops: readonly {
    readonly placeContentId: string;
    readonly note?: string | null | null;
  }[];
};

export type RouteStopWriteResult = { readonly stopCount: number };

export type RouteStopWriteResultResponse = { readonly data: RouteStopWriteResult };

export type UploadIntent = {
  readonly mediaId: string;
  readonly uploadUrl: string;
  readonly expiresAt: string;
};

export type CreateUploadIntentRequest = {
  readonly fileName: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  readonly sizeBytes: number;
};

export type CompleteUploadRequest = {
  readonly checksum: string;
  readonly altText: string;
  readonly rightsStatus:
    | 'PUBLIC_DOMAIN'
    | 'CC_BY'
    | 'CC_BY_SA'
    | 'CC_BY_NC'
    | 'CC_BY_NC_SA'
    | 'CC0'
    | 'LICENSED'
    | 'UNKNOWN'
    | 'RESTRICTED';
  readonly license?: string | null | null;
  readonly creditLine?: string | null | null;
  readonly creator?: string | null | null;
  readonly width?: number | null | null;
  readonly height?: number | null | null;
};

export type MediaCompletion = {
  readonly id: string;
  readonly rightsStatus:
    | 'PUBLIC_DOMAIN'
    | 'CC_BY'
    | 'CC_BY_SA'
    | 'CC_BY_NC'
    | 'CC_BY_NC_SA'
    | 'CC0'
    | 'LICENSED'
    | 'UNKNOWN'
    | 'RESTRICTED';
  readonly usableInPublic: boolean;
};

export type UploadIntentResponse = { readonly data: UploadIntent };

export type MediaCompletionResponse = { readonly data: MediaCompletion };

export type OkResult = { readonly ok: true };

export type OkResponse = { readonly data: OkResult };

export type HealthLiveResponse = { readonly status: 'ok'; readonly service: 'api' };

export type HealthReadyResponse = {
  readonly status: 'ok';
  readonly service: 'api';
  readonly appEnv: string;
  readonly checks: Readonly<Record<string, unknown>>;
};

/** operationId → 方法 / 路径 / 参数 / 请求体 / 响应。 */
export interface NlaOperationMap {
  /** GET /health/live */
  healthLive: {
    readonly method: 'GET';
    readonly path: '/health/live';
    readonly tags: readonly ['health'];
    readonly security: 'public';
    readonly parameters: readonly [];
    readonly requestBody: undefined | undefined;
    readonly response: HealthLiveResponse;
    readonly errorResponses: { readonly '500': ErrorResponse };
  };
  /** GET /health/ready */
  healthReady: {
    readonly method: 'GET';
    readonly path: '/health/ready';
    readonly tags: readonly ['health'];
    readonly security: 'public';
    readonly parameters: readonly [];
    readonly requestBody: undefined | undefined;
    readonly response: HealthReadyResponse;
    readonly errorResponses: { readonly '500': ErrorResponse };
  };
  /** POST /api/v1/auth/login */
  authLogin: {
    readonly method: 'POST';
    readonly path: '/api/v1/auth/login';
    readonly tags: readonly ['auth'];
    readonly security: 'public';
    readonly parameters: readonly [];
    readonly requestBody: LoginRequest | undefined;
    readonly response: AuthSessionResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
    };
  };
  /** POST /api/v1/auth/refresh */
  authRefresh: {
    readonly method: 'POST';
    readonly path: '/api/v1/auth/refresh';
    readonly tags: readonly ['auth'];
    readonly security: 'public';
    readonly parameters: readonly [];
    readonly requestBody: RefreshRequest | undefined;
    readonly response: AuthSessionResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
    };
  };
  /** POST /api/v1/auth/logout */
  authLogout: {
    readonly method: 'POST';
    readonly path: '/api/v1/auth/logout';
    readonly tags: readonly ['auth'];
    readonly security: 'public';
    readonly parameters: readonly [];
    readonly requestBody: undefined | undefined;
    readonly response: undefined;
    readonly errorResponses: { readonly '429': ErrorResponse; readonly '500': ErrorResponse };
  };
  /** GET /api/v1/auth/me */
  authMe: {
    readonly method: 'GET';
    readonly path: '/api/v1/auth/me';
    readonly tags: readonly ['auth'];
    readonly security: 'bearer';
    readonly parameters: readonly [];
    readonly requestBody: undefined | undefined;
    readonly response: MeResponse;
    readonly errorResponses: { readonly '401': ErrorResponse; readonly '403': ErrorResponse };
  };
  /** GET /api/v1/contents */
  listPublicContents: {
    readonly method: 'GET';
    readonly path: '/api/v1/contents';
    readonly tags: readonly ['contents'];
    readonly security: 'public';
    readonly parameters: readonly [
      | {
          readonly name: 'type';
          readonly in: 'query';
          readonly required: false;
          readonly type: ContentType;
        }
      | {
          readonly name: 'limit';
          readonly in: 'query';
          readonly required: false;
          readonly type: number;
        },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: ContentPublicListResponse;
    readonly errorResponses: { readonly '422': ErrorResponse; readonly '500': ErrorResponse };
  };
  /** GET /api/v1/contents/{slug} */
  getPublicContent: {
    readonly method: 'GET';
    readonly path: '/api/v1/contents/{slug}';
    readonly tags: readonly ['contents'];
    readonly security: 'public';
    readonly parameters: readonly [
      {
        readonly name: 'slug';
        readonly in: 'path';
        readonly required: true;
        readonly type: string;
      },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: ContentPublicResponse;
    readonly errorResponses: { readonly '404': ErrorResponse; readonly '500': ErrorResponse };
  };
  /** GET /api/v1/places */
  listPlacesInBbox: {
    readonly method: 'GET';
    readonly path: '/api/v1/places';
    readonly tags: readonly ['places'];
    readonly security: 'public';
    readonly parameters: readonly [
      | {
          readonly name: 'bbox';
          readonly in: 'query';
          readonly required: true;
          readonly type: string;
        }
      | {
          readonly name: 'type';
          readonly in: 'query';
          readonly required: false;
          readonly type: ContentType;
        }
      | {
          readonly name: 'limit';
          readonly in: 'query';
          readonly required: false;
          readonly type: number;
        },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: PlaceBboxResponse;
    readonly errorResponses: { readonly '400': ErrorResponse; readonly '500': ErrorResponse };
  };
  /** GET /api/v1/places/{slug} */
  getPublicPlace: {
    readonly method: 'GET';
    readonly path: '/api/v1/places/{slug}';
    readonly tags: readonly ['places'];
    readonly security: 'public';
    readonly parameters: readonly [
      {
        readonly name: 'slug';
        readonly in: 'path';
        readonly required: true;
        readonly type: string;
      },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: ContentPublicResponse;
    readonly errorResponses: { readonly '404': ErrorResponse; readonly '500': ErrorResponse };
  };
  /** GET /api/v1/routes/{slug} */
  getPublicRoute: {
    readonly method: 'GET';
    readonly path: '/api/v1/routes/{slug}';
    readonly tags: readonly ['routes'];
    readonly security: 'public';
    readonly parameters: readonly [
      {
        readonly name: 'slug';
        readonly in: 'path';
        readonly required: true;
        readonly type: string;
      },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: RouteResponse;
    readonly errorResponses: { readonly '404': ErrorResponse; readonly '500': ErrorResponse };
  };
  /** GET /api/v1/search */
  searchPublicContent: {
    readonly method: 'GET';
    readonly path: '/api/v1/search';
    readonly tags: readonly ['search'];
    readonly security: 'public';
    readonly parameters: readonly [
      | { readonly name: 'q'; readonly in: 'query'; readonly required: true; readonly type: string }
      | {
          readonly name: 'type';
          readonly in: 'query';
          readonly required: false;
          readonly type: ContentType;
        }
      | {
          readonly name: 'limit';
          readonly in: 'query';
          readonly required: false;
          readonly type: number;
        },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: SearchResponse;
    readonly errorResponses: { readonly '400': ErrorResponse; readonly '500': ErrorResponse };
  };
  /** POST /api/v1/admin/places/reindex */
  reindexPlaces: {
    readonly method: 'POST';
    readonly path: '/api/v1/admin/places/reindex';
    readonly tags: readonly ['places'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      {
        readonly name: 'Idempotency-Key';
        readonly in: 'header';
        readonly required: false;
        readonly type: string;
      },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: ReindexResponse;
    readonly errorResponses: { readonly '401': ErrorResponse; readonly '403': ErrorResponse };
  };
  /** GET /api/v1/admin/contents */
  listAdminContents: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/contents';
    readonly tags: readonly ['contents'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | {
          readonly name: 'type';
          readonly in: 'query';
          readonly required: false;
          readonly type: ContentType;
        }
      | {
          readonly name: 'status';
          readonly in: 'query';
          readonly required: false;
          readonly type: ContentStatus;
        }
      | {
          readonly name: 'limit';
          readonly in: 'query';
          readonly required: false;
          readonly type: number;
        },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: ContentAdminListResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** POST /api/v1/admin/contents */
  createContent: {
    readonly method: 'POST';
    readonly path: '/api/v1/admin/contents';
    readonly tags: readonly ['contents'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      {
        readonly name: 'Idempotency-Key';
        readonly in: 'header';
        readonly required: false;
        readonly type: string;
      },
    ];
    readonly requestBody: CreateContentRequest | undefined;
    readonly response: ContentAdminResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '409': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/admin/contents/{id} */
  getAdminContent: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/contents/{id}';
    readonly tags: readonly ['contents'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: ContentAdminResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '404': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** PATCH /api/v1/admin/contents/{id} */
  updateContent: {
    readonly method: 'PATCH';
    readonly path: '/api/v1/admin/contents/{id}';
    readonly tags: readonly ['contents'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string }
      | {
          readonly name: 'If-Match';
          readonly in: 'header';
          readonly required: true;
          readonly type: string;
        }
      | {
          readonly name: 'Idempotency-Key';
          readonly in: 'header';
          readonly required: false;
          readonly type: string;
        },
    ];
    readonly requestBody: PatchContentRequest | undefined;
    readonly response: ContentAdminResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '404': ErrorResponse;
      readonly '409': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** POST /api/v1/admin/contents/{id}/transition */
  transitionContent: {
    readonly method: 'POST';
    readonly path: '/api/v1/admin/contents/{id}/transition';
    readonly tags: readonly ['contents'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string }
      | {
          readonly name: 'Idempotency-Key';
          readonly in: 'header';
          readonly required: false;
          readonly type: string;
        },
    ];
    readonly requestBody: TransitionRequest | undefined;
    readonly response: ContentAdminResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '404': ErrorResponse;
      readonly '409': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/admin/contents/{id}/readiness */
  getContentReadiness: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/contents/{id}/readiness';
    readonly tags: readonly ['contents'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: ReadinessResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '404': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/admin/contents/{id}/revisions */
  listContentRevisions: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/contents/{id}/revisions';
    readonly tags: readonly ['contents'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string }
      | {
          readonly name: 'cursor';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        }
      | {
          readonly name: 'limit';
          readonly in: 'query';
          readonly required: false;
          readonly type: number;
        },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: RevisionPageResponse;
    readonly errorResponses: {
      readonly '400': ErrorResponse;
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '404': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/admin/contents/{id}/review-actions */
  listContentReviewActions: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/contents/{id}/review-actions';
    readonly tags: readonly ['contents'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string }
      | {
          readonly name: 'cursor';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        }
      | {
          readonly name: 'limit';
          readonly in: 'query';
          readonly required: false;
          readonly type: number;
        },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: ReviewActionPageResponse;
    readonly errorResponses: {
      readonly '400': ErrorResponse;
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '404': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/admin/sources */
  searchSources: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/sources';
    readonly tags: readonly ['sources'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | {
          readonly name: 'q';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        }
      | {
          readonly name: 'kind';
          readonly in: 'query';
          readonly required: false;
          readonly type: 'ARCHIVE' | 'BOOK' | 'ARTICLE' | 'WEBSITE' | 'ORAL' | 'OTHER';
        }
      | {
          readonly name: 'sort';
          readonly in: 'query';
          readonly required: false;
          readonly type: 'createdAt:desc' | 'title:asc';
        }
      | {
          readonly name: 'limit';
          readonly in: 'query';
          readonly required: false;
          readonly type: number;
        }
      | {
          readonly name: 'cursor';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: SourceSearchResponse;
    readonly errorResponses: {
      readonly '400': ErrorResponse;
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** POST /api/v1/admin/sources */
  createSource: {
    readonly method: 'POST';
    readonly path: '/api/v1/admin/sources';
    readonly tags: readonly ['sources'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      {
        readonly name: 'Idempotency-Key';
        readonly in: 'header';
        readonly required: false;
        readonly type: string;
      },
    ];
    readonly requestBody: CreateSourceRequest | undefined;
    readonly response: SourceResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** POST /api/v1/admin/contents/{id}/sources */
  attachSource: {
    readonly method: 'POST';
    readonly path: '/api/v1/admin/contents/{id}/sources';
    readonly tags: readonly ['sources'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string }
      | {
          readonly name: 'Idempotency-Key';
          readonly in: 'header';
          readonly required: false;
          readonly type: string;
        },
    ];
    readonly requestBody: AttachSourceRequest | undefined;
    readonly response: OkResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '404': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/admin/contents/{id}/sources */
  listContentSources: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/contents/{id}/sources';
    readonly tags: readonly ['sources'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: ContentSourceListResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/admin/tags */
  listAllTags: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/tags';
    readonly tags: readonly ['tags'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | {
          readonly name: 'q';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        }
      | {
          readonly name: 'limit';
          readonly in: 'query';
          readonly required: false;
          readonly type: number;
        },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: TagWithUsageListResponse;
    readonly errorResponses: {
      readonly '400': ErrorResponse;
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** POST /api/v1/admin/tags */
  upsertTag: {
    readonly method: 'POST';
    readonly path: '/api/v1/admin/tags';
    readonly tags: readonly ['tags'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      {
        readonly name: 'Idempotency-Key';
        readonly in: 'header';
        readonly required: false;
        readonly type: string;
      },
    ];
    readonly requestBody: UpsertTagRequest | undefined;
    readonly response: TagResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** POST /api/v1/admin/contents/{id}/tags */
  attachTag: {
    readonly method: 'POST';
    readonly path: '/api/v1/admin/contents/{id}/tags';
    readonly tags: readonly ['tags'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string }
      | {
          readonly name: 'Idempotency-Key';
          readonly in: 'header';
          readonly required: false;
          readonly type: string;
        },
    ];
    readonly requestBody: AttachTagRequest | undefined;
    readonly response: OkResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '404': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/admin/contents/{id}/tags */
  listContentTags: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/contents/{id}/tags';
    readonly tags: readonly ['tags'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: TagListResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** POST /api/v1/admin/contents/{id}/relations */
  createRelation: {
    readonly method: 'POST';
    readonly path: '/api/v1/admin/contents/{id}/relations';
    readonly tags: readonly ['relations'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string }
      | {
          readonly name: 'Idempotency-Key';
          readonly in: 'header';
          readonly required: false;
          readonly type: string;
        },
    ];
    readonly requestBody: CreateRelationRequest | undefined;
    readonly response: OkResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '404': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/admin/contents/{id}/relations */
  listContentRelations: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/contents/{id}/relations';
    readonly tags: readonly ['relations'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: ContentRelationListResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/admin/relation-targets */
  searchRelationTargets: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/relation-targets';
    readonly tags: readonly ['relations'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | {
          readonly name: 'q';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        }
      | {
          readonly name: 'limit';
          readonly in: 'query';
          readonly required: false;
          readonly type: number;
        },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: RelationTargetListResponse;
    readonly errorResponses: {
      readonly '400': ErrorResponse;
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/admin/routes/{id}/stops */
  listRouteStops: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/routes/{id}/stops';
    readonly tags: readonly ['routes'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: RouteStopAdminListResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** PUT /api/v1/admin/routes/{id}/stops */
  replaceRouteStops: {
    readonly method: 'PUT';
    readonly path: '/api/v1/admin/routes/{id}/stops';
    readonly tags: readonly ['routes'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string }
      | {
          readonly name: 'Idempotency-Key';
          readonly in: 'header';
          readonly required: false;
          readonly type: string;
        },
    ];
    readonly requestBody: ReplaceRouteStopsRequest | undefined;
    readonly response: RouteStopWriteResultResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '404': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** POST /api/v1/admin/media/upload-intents */
  createUploadIntent: {
    readonly method: 'POST';
    readonly path: '/api/v1/admin/media/upload-intents';
    readonly tags: readonly ['media'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      {
        readonly name: 'Idempotency-Key';
        readonly in: 'header';
        readonly required: false;
        readonly type: string;
      },
    ];
    readonly requestBody: CreateUploadIntentRequest | undefined;
    readonly response: UploadIntentResponse;
    readonly errorResponses: {
      readonly '400': ErrorResponse;
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** POST /api/v1/admin/media/{id}/complete */
  completeUpload: {
    readonly method: 'POST';
    readonly path: '/api/v1/admin/media/{id}/complete';
    readonly tags: readonly ['media'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string }
      | {
          readonly name: 'Idempotency-Key';
          readonly in: 'header';
          readonly required: false;
          readonly type: string;
        },
    ];
    readonly requestBody: CompleteUploadRequest | undefined;
    readonly response: MediaCompletionResponse;
    readonly errorResponses: {
      readonly '400': ErrorResponse;
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '404': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/admin/users */
  listUsers: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/users';
    readonly tags: readonly ['users'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | {
          readonly name: 'q';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        }
      | {
          readonly name: 'role';
          readonly in: 'query';
          readonly required: false;
          readonly type: 'ADMIN' | 'EDITOR' | 'REVIEWER' | 'VIEWER';
        }
      | {
          readonly name: 'status';
          readonly in: 'query';
          readonly required: false;
          readonly type: 'enabled' | 'disabled';
        }
      | {
          readonly name: 'limit';
          readonly in: 'query';
          readonly required: false;
          readonly type: number;
        }
      | {
          readonly name: 'cursor';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: UserListResponse;
    readonly errorResponses: {
      readonly '400': ErrorResponse;
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** POST /api/v1/admin/users */
  createUser: {
    readonly method: 'POST';
    readonly path: '/api/v1/admin/users';
    readonly tags: readonly ['users'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      {
        readonly name: 'Idempotency-Key';
        readonly in: 'header';
        readonly required: false;
        readonly type: string;
      },
    ];
    readonly requestBody: CreateUserRequest | undefined;
    readonly response: UserResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '409': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** PATCH /api/v1/admin/users/{id} */
  updateUser: {
    readonly method: 'PATCH';
    readonly path: '/api/v1/admin/users/{id}';
    readonly tags: readonly ['users'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | { readonly name: 'id'; readonly in: 'path'; readonly required: true; readonly type: string }
      | {
          readonly name: 'Idempotency-Key';
          readonly in: 'header';
          readonly required: false;
          readonly type: string;
        },
    ];
    readonly requestBody: PatchUserRequest | undefined;
    readonly response: UserResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '404': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/homepage */
  getHomepage: {
    readonly method: 'GET';
    readonly path: '/api/v1/homepage';
    readonly tags: readonly ['homepage'];
    readonly security: 'public';
    readonly parameters: readonly [];
    readonly requestBody: undefined | undefined;
    readonly response: HomepageResponse;
    readonly errorResponses: { readonly '500': ErrorResponse };
  };
  /** GET /api/v1/admin/homepage-slots */
  listHomepageSlots: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/homepage-slots';
    readonly tags: readonly ['homepage'];
    readonly security: 'bearer';
    readonly parameters: readonly [];
    readonly requestBody: undefined | undefined;
    readonly response: AdminHomepageSlotListResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** PATCH /api/v1/admin/homepage-slots */
  configureHomepageSlot: {
    readonly method: 'PATCH';
    readonly path: '/api/v1/admin/homepage-slots';
    readonly tags: readonly ['homepage'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      {
        readonly name: 'Idempotency-Key';
        readonly in: 'header';
        readonly required: false;
        readonly type: string;
      },
    ];
    readonly requestBody: HomepageSlotConfigRequest | undefined;
    readonly response: HomepageSlotResponse;
    readonly errorResponses: {
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '422': ErrorResponse;
      readonly '429': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/admin/homepage-slots/candidates */
  listHomepageSlotCandidates: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/homepage-slots/candidates';
    readonly tags: readonly ['homepage'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | {
          readonly name: 'q';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        }
      | {
          readonly name: 'limit';
          readonly in: 'query';
          readonly required: false;
          readonly type: number;
        },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: HomepageCandidateListResponse;
    readonly errorResponses: {
      readonly '400': ErrorResponse;
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
  /** GET /api/v1/admin/audit-logs */
  searchAuditLogs: {
    readonly method: 'GET';
    readonly path: '/api/v1/admin/audit-logs';
    readonly tags: readonly ['audit'];
    readonly security: 'bearer';
    readonly parameters: readonly [
      | {
          readonly name: 'actorId';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        }
      | {
          readonly name: 'action';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        }
      | {
          readonly name: 'entityType';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        }
      | {
          readonly name: 'entityId';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        }
      | {
          readonly name: 'from';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        }
      | {
          readonly name: 'to';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        }
      | {
          readonly name: 'limit';
          readonly in: 'query';
          readonly required: false;
          readonly type: number;
        }
      | {
          readonly name: 'cursor';
          readonly in: 'query';
          readonly required: false;
          readonly type: string;
        },
    ];
    readonly requestBody: undefined | undefined;
    readonly response: AuditLogListResponse;
    readonly errorResponses: {
      readonly '400': ErrorResponse;
      readonly '401': ErrorResponse;
      readonly '403': ErrorResponse;
      readonly '500': ErrorResponse;
    };
  };
}

export type NlaOperationId = keyof NlaOperationMap;

export type NlaPath = NlaOperationMap[NlaOperationId]['path'];

export type NlaMethod = NlaOperationMap[NlaOperationId]['method'];

/** 指定路径上允许的方法联合。 */
export type NlaMethodFor<P extends NlaPath> = (typeof NLA_API_PATHS)[P][number];

/** 统一响应头名，所有响应都会带上。 */
export const NLA_REQUEST_ID_HEADER = 'X-Request-Id';
