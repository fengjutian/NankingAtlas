/**
 * 手写 OpenAPI 3.1 规范（P1-11）。
 *
 * ## 为什么手写而不是装饰器自动生成
 *
 * 1. **现有 DTO 是 zod schema，不是 class DTO。** 控制器里的写法是
 *    `const loginSchema = z.object({...}).strict()` + `loginSchema.parse(rawBody)`，
 *    没有 `@ApiProperty`。自动生成要么侵入改 30+ 控制器方法（超出 P1-11 的文件
 *    所有权范围），要么依赖 `@nestjs/swagger` 的 zod 集成。
 * 2. **不新增第三方依赖。** AGENTS.md §6.5 要求新依赖必须说明用途并检查许可；
 *    `@nestjs/swagger` 在本仓库解决不了"zod DTO 无装饰器"这个根因，
 *    却会把一个纯声明层需求变成运行时依赖。生成规范 + 客户端类型推导全部手写。
 *
 * ## 单一事实来源
 *
 * 枚举值直接从 `@nanking-atlas/database`（与 Prisma schema 同源）与
 * `@nanking-atlas/api-contract`（错误码）导入，不在此处复制字面量。
 *
 * ## 与运行时的对应关系
 *
 * - 全局前缀 `api/v1`，health 例外（见 `main.ts` 的 `setGlobalPrefix` exclude），
 *   因此本文档的 path 直接写完整路径（`/api/v1/...` 与 `/health/...`）。
 * - 成功响应体是 `{ data: ... }`（控制器返回值），`requestId` 只出现在响应头
 *   `X-Request-Id`，不出现在响应体里 —— 这与 `api-contract` 的
 *   `SuccessResponse` 辅助函数不同，文档以控制器实际返回为准。
 * - 错误响应体统一 `{ error: { code, message, details?, requestId } }`，
 *   与 `api-contract` 的 `ApiErrorResponse` 一致。
 * - 所有写接口用 `.strict()` 白名单，因此请求体 schema 统一
 *   `additionalProperties: false`（AGENTS.md §4.5）。
 */

import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  LANGUAGES,
  MEDIA_RIGHTS_STATUSES,
  RELATION_TYPES,
  SOURCE_KINDS,
  USER_ROLES,
  VERIFICATION_STATUSES,
} from '@nanking-atlas/database';

/**
 * API 错误码全集。
 *
 * 这里**不**从 `@nanking-atlas/api-contract` 导入：包边界规则
 * （`packages/eslint-config/boundaries.js`，api 项目项）明确禁止 API 依赖
 * api-contract —— 依赖方向是 api 生成契约、web/admin 消费契约，而不是反过来。
 *
 * 因此本列表需要与 `packages/api-contract/src/errors.ts` 的 `API_ERROR_CODES`
 * 保持一致。两边目前由人工同步；若后续要消除这份重复，应把错误码下沉到
 * `@nanking-atlas/validation` 这类底层共享包（属于跨包重构，需另行决策）。
 */
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'CONTENT_VERSION_CONFLICT',
  'CONTENT_SLUG_TAKEN',
  'CONTENT_STATE_INVALID',
  'PUBLICATION_NOT_READY',
  'INVALID_CREDENTIALS',
  'TOKEN_EXPIRED',
  'TOKEN_REVOKED',
  'ACCOUNT_DISABLED',
  'UPLOAD_INVALID',
  'UPLOAD_NOT_FOUND',
  'UPLOAD_MIME_MISMATCH',
  'MEDIA_RIGHTS_NOT_CLEARED',
] as const;

/** 与 `api-contract` 的 `DEFAULT_PAGE_SIZE` / `MAX_PAGE_SIZE` 保持一致（同步约束同上）。 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// 最小 OpenAPI 3.1 类型模型
//
// 只声明本仓库实际用到的字段。目的不是做一个完整的 OpenAPI 类型库，
// 而是让生成脚本与 breaking 检查器在 strict 模式下安全遍历文档且不出现 `any`。
// ---------------------------------------------------------------------------

export type SchemaTypeName =
  'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';

export type JsonPrimitive = string | number | boolean | null;

export interface SchemaObject {
  readonly type?: SchemaTypeName | readonly SchemaTypeName[];
  readonly format?: string;
  readonly title?: string;
  readonly description?: string;
  /** 属性值同样可以是 `$ref`，所以是 SchemaLike。 */
  readonly properties?: Readonly<Record<string, SchemaLike>>;
  readonly required?: readonly string[];
  /** 元素与嵌套 schema 都可以是 `$ref`，所以用 SchemaLike 而不是 SchemaObject。 */
  readonly additionalProperties?: boolean | SchemaLike;
  readonly items?: SchemaLike;
  readonly enum?: readonly JsonPrimitive[];
  readonly const?: JsonPrimitive;
  readonly default?: JsonPrimitive;
  readonly allOf?: readonly SchemaLike[];
  readonly oneOf?: readonly SchemaLike[];
  readonly discriminator?: {
    readonly propertyName: string;
    readonly mapping?: Readonly<Record<string, string>>;
  };
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minItems?: number;
  readonly pattern?: string;
  readonly example?: unknown;
}

export interface ReferenceObject {
  readonly $ref: string;
}

export type SchemaLike = SchemaObject | ReferenceObject;

/**
 * 认证方案。
 *
 * 注意它**不是** JSON Schema：`type` 取值是 `http` / `apiKey` / `oauth2` …，
 * 与 SchemaObject 的 `type` 不是同一套枚举，不能复用同一个类型。
 */
export interface SecuritySchemeObject {
  readonly type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect' | 'mutualTLS';
  readonly scheme?: string;
  readonly bearerFormat?: string;
  readonly in?: 'query' | 'header' | 'cookie';
  readonly name?: string;
  readonly description?: string;
}

export interface HeaderObject {
  readonly description?: string;
  readonly required?: boolean;
  readonly schema: SchemaLike;
}

export interface MediaTypeObject {
  readonly schema: SchemaLike;
}

export interface ResponseObject {
  readonly description: string;
  readonly headers?: Readonly<Record<string, HeaderObject>>;
  readonly content?: Readonly<Record<string, MediaTypeObject>>;
}

export interface ParameterObject {
  readonly name: string;
  readonly in: 'query' | 'path' | 'header' | 'cookie';
  readonly description?: string;
  readonly required?: boolean;
  readonly schema: SchemaLike;
}

export interface RequestBodyObject {
  readonly required: boolean;
  readonly description?: string;
  readonly content: Readonly<Record<string, MediaTypeObject>>;
}

/** `{ bearerAuth: [] }` 形式；空数组表示该 scheme 下不要求具体 scope。 */
export type SecurityRequirementObject = Readonly<Record<string, readonly string[]>>;

export type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

export interface OperationObject {
  readonly operationId: string;
  readonly summary: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly parameters?: readonly ParameterObject[];
  readonly requestBody?: RequestBodyObject;
  readonly responses: Readonly<Record<string, ResponseObject>>;
  /** 公开端点用 `[]` 显式覆盖全局 security；省略即继承文档级声明。 */
  readonly security?: readonly SecurityRequirementObject[];
}

/** PathItem 只承载 method 键；每个 operation 自带自己的 parameters。 */
export type PathItemObject = Readonly<Partial<Record<HttpMethod, OperationObject>>>;

export interface OpenApiDocument {
  readonly openapi: string;
  readonly info: {
    readonly title: string;
    readonly version: string;
    readonly description: string;
  };
  readonly servers: readonly { readonly url: string; readonly description: string }[];
  readonly tags: readonly { readonly name: string; readonly description: string }[];
  readonly paths: Readonly<Record<string, PathItemObject>>;
  readonly components: {
    readonly securitySchemes: Readonly<Record<string, SecuritySchemeObject>>;
    readonly schemas: Readonly<Record<string, SchemaObject>>;
  };
}

export const HTTP_METHODS: readonly HttpMethod[] = ['get', 'post', 'patch', 'put', 'delete'];

/** 判断对象键是否为 HTTP method —— 遍历 PathItem 时用来滤掉非 method 字段。 */
export function isHttpMethod(key: string): key is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(key);
}

/** 判断 schema 是否是 `$ref`。用 `hasOwnProperty` 而不是属性访问，避免引入 `any`。 */
export function isReferenceObject(schema: SchemaLike): schema is ReferenceObject {
  return typeof schema === 'object' && Object.prototype.hasOwnProperty.call(schema, '$ref');
}

function ref(name: string): ReferenceObject {
  return { $ref: `#/components/schemas/${name}` };
}

/** 从 `#/components/schemas/X` 取出组件名；非本组件引用返回 null。 */
export function localSchemaRefName(schema: SchemaLike): string | null {
  if (!isReferenceObject(schema)) {
    return null;
  }
  const prefix = '#/components/schemas/';
  return schema.$ref.startsWith(prefix) ? schema.$ref.slice(prefix.length) : null;
}

// ---------------------------------------------------------------------------
// 请求头约定（与 main.ts CORS allowedHeaders、api-contract 常量保持一致）
// ---------------------------------------------------------------------------

export const REQUEST_ID_HEADER_NAME = 'X-Request-Id';

/** 与 `content.controller.ts` 的 `ifMatchPattern` 完全一致。 */
const IF_MATCH_PATTERN = '^W/"[0-9]{1,9}"$';

/** 与 `api-contract` 的 `idempotencyKeySchema` 完全一致。 */
const IDEMPOTENCY_KEY_PATTERN = '^[A-Za-z0-9._:-]+$';

/** 与 `packages/validation` 的 `slugSchema` 正则完全一致。 */
const SLUG_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*$';

const REQUEST_ID_HEADER: HeaderObject = {
  description: '请求关联 ID，与错误体内的 `error.requestId` 一致；报障时提供该值。',
  required: true,
  schema: { type: 'string', minLength: 1, maxLength: 128 },
};

// ---------------------------------------------------------------------------
// 组件 schema
// ---------------------------------------------------------------------------

const stringSchema = (description: string, extra?: Partial<SchemaObject>): SchemaObject => ({
  type: 'string',
  description,
  ...extra,
});

/** 控制器 DTO 里 `.nullish()` 的字段：可缺省、可显式传 null。 */
const nullableStringField = (maxLength: number): SchemaObject => ({
  type: ['string', 'null'],
  maxLength,
});

const isoDateTimeField = (description: string): SchemaObject => ({
  type: ['string', 'null'],
  format: 'date-time',
  description,
});

const ErrorDetailSchema: SchemaObject = {
  type: 'object',
  description: '结构化字段级错误信息。禁止包含堆栈、SQL 或文件路径（AGENTS.md §4.7）。',
  additionalProperties: true,
};

const ErrorResponseSchema: SchemaObject = {
  type: 'object',
  description: '统一错误响应体，与 `api-contract` 的 `ApiErrorResponse` 一一对应。',
  required: ['error'],
  additionalProperties: false,
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      additionalProperties: false,
      properties: {
        code: {
          type: 'string',
          description: '机器可读错误码，取值来自 `API_ERROR_CODES` 全集。',
          enum: API_ERROR_CODES,
        },
        message: stringSchema('人类可读描述，不得包含堆栈或 SQL。', { minLength: 1 }),
        details: ErrorDetailSchema,
        requestId: stringSchema('与响应头 `X-Request-Id` 一致的关联 ID。', {
          minLength: 1,
          maxLength: 128,
        }),
      },
    },
  },
};

const UserRoleSchema: SchemaObject = {
  type: 'string',
  description: '后台角色。Editor 不得审核或发布，审核与发布仅 Reviewer/Admin。',
  enum: USER_ROLES,
};

const UserSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'email', 'displayName', 'roles'],
  additionalProperties: false,
  properties: {
    id: stringSchema('用户 ID（CUID）。'),
    email: stringSchema('登录邮箱。', { format: 'email', minLength: 3, maxLength: 320 }),
    displayName: stringSchema('显示名。', { minLength: 1, maxLength: 80 }),
    roles: { type: 'array', minItems: 1, items: ref('UserRole') },
    disabledAt: isoDateTimeField('停用时间；null 表示启用中。'),
  },
};

const AuthSessionSchema: SchemaObject = {
  type: 'object',
  description: '登录/刷新成功后返回的会话数据。refresh token 只经 HttpOnly cookie 下发。',
  required: ['accessToken', 'accessTokenExpiresAt', 'user'],
  additionalProperties: false,
  properties: {
    accessToken: stringSchema('JWT access token，作为 `Authorization: Bearer` 使用。'),
    accessTokenExpiresAt: {
      type: 'string',
      format: 'date-time',
      description: 'access token 过期时间（ISO 8601）。',
    },
    user: {
      type: 'object',
      required: ['id', 'email', 'displayName', 'roles'],
      additionalProperties: false,
      properties: {
        id: stringSchema('用户 ID。'),
        email: stringSchema('登录邮箱。', { format: 'email' }),
        displayName: stringSchema('显示名。'),
        roles: { type: 'array', items: ref('UserRole') },
      },
    },
  },
};

const ContentTypeSchema: SchemaObject = {
  type: 'string',
  description: '内容类型，决定 `extension` 使用的判别联合分支。',
  enum: CONTENT_TYPES,
};

const ContentStatusSchema: SchemaObject = {
  type: 'string',
  description: '内容状态。流转必须经服务端状态机，客户端不能直接写入。',
  enum: CONTENT_STATUSES,
};

/**
 * 内容扩展字段：与 `content.controller.ts` 的 `typeExtensionSchema` 一一对应。
 * `kind` 是判别键，缺省值由 `type` 决定，因此这里用 oneOf + discriminator。
 */
const ContentExtensionSchema: SchemaObject = {
  description: '按内容类型区分的扩展字段。`kind` 必须与 `type` 一致。',
  discriminator: { propertyName: 'kind' },
  oneOf: [
    {
      type: 'object',
      required: ['kind'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'PLACE' },
        address: nullableStringField(300),
        lon: {
          type: ['number', 'null'],
          description: '经度。`accuracy=UNKNOWN` 时不得提供精确坐标。',
          minimum: -180,
          maximum: 180,
        },
        lat: {
          type: ['number', 'null'],
          description: '纬度。`accuracy=UNKNOWN` 时不得提供精确坐标。',
          minimum: -90,
          maximum: 90,
        },
        accuracy: {
          type: 'string',
          enum: ['EXACT', 'APPROXIMATE', 'AREA_ONLY', 'UNKNOWN'],
          description: '坐标精度。UNKNOWN 时公开端不显示精确 marker。',
        },
        verificationStatus: { type: 'string', enum: VERIFICATION_STATUSES },
      },
    },
    {
      type: 'object',
      required: ['kind'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'PERSON' },
        birthText: nullableStringField(200),
        deathText: nullableStringField(200),
        biographyNote: nullableStringField(2000),
      },
    },
    {
      type: 'object',
      required: ['kind'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'EVENT' },
        startDate: { type: ['string', 'null'], format: 'date' },
        endDate: { type: ['string', 'null'], format: 'date' },
        datePrecision: { type: 'string', enum: ['YEAR', 'MONTH', 'DAY', 'UNKNOWN'] },
        dateNote: nullableStringField(500),
      },
    },
    {
      type: 'object',
      required: ['kind'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'ARCHITECTURE' },
        builtPeriod: nullableStringField(200),
        currentCondition: nullableStringField(1000),
        heritageLevel: nullableStringField(200),
      },
    },
    {
      type: 'object',
      required: ['kind'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'TRADITION' },
        traditionType: { type: 'string', minLength: 1, maxLength: 100 },
        transmissionMethod: nullableStringField(1000),
      },
    },
    {
      type: 'object',
      required: ['kind'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'TOPIC' },
        curatorNote: nullableStringField(2000),
      },
    },
    {
      type: 'object',
      required: ['kind'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'ROUTE' },
        durationMinutes: {
          type: ['integer', 'null'],
          description: '建议游览时长（分钟）。',
          minimum: 1,
          maximum: 1440,
        },
        distanceMeters: { type: ['integer', 'null'], description: '路线长度（米）。', minimum: 1 },
      },
    },
  ],
};

/**
 * Tiptap JSON 文档。
 *
 * 对应 `packages/validation` 的 `parseTiptapDocument`：服务端按节点/标记白名单
 * 校验，拒绝 `script`、事件属性与 `javascript:` 链接（AGENTS.md §3.4、§4.5）。
 */
const TiptapDocumentSchema: SchemaObject = {
  type: 'object',
  description: 'Tiptap JSON 文档。服务端做白名单校验，非白名单节点/标记会被拒绝。',
  required: ['type'],
  additionalProperties: true,
  properties: {
    type: { type: 'string', const: 'doc' },
    content: {
      type: 'array',
      description: '顶层块节点数组；具体节点结构由白名单校验保证。',
      items: {},
    },
  },
};

const ContentPublicSchema: SchemaObject = {
  type: 'object',
  description: '公开内容视图：不含状态、version 与审核人等后台字段。',
  required: [
    'id',
    'type',
    'slug',
    'title',
    'subtitle',
    'summary',
    'body',
    'language',
    'publishedAt',
  ],
  additionalProperties: false,
  properties: {
    id: stringSchema('内容 ID。'),
    type: ref('ContentType'),
    slug: stringSchema('URL slug。', { pattern: SLUG_PATTERN, minLength: 1, maxLength: 120 }),
    title: stringSchema('标题。', { minLength: 1, maxLength: 200 }),
    subtitle: nullableStringField(300),
    summary: nullableStringField(1000),
    body: ref('TiptapDocument'),
    language: { type: 'string', enum: LANGUAGES },
    publishedAt: isoDateTimeField('发布时间；未发布为 null。'),
  },
};

const ContentAdminSchema: SchemaObject = {
  type: 'object',
  description: '后台内容视图：在公开字段基础上追加状态、乐观锁版本与审计字段。',
  required: [
    'id',
    'type',
    'slug',
    'title',
    'subtitle',
    'summary',
    'body',
    'status',
    'language',
    'version',
    'createdById',
    'updatedById',
    'publishedAt',
    'archivedAt',
    'createdAt',
    'updatedAt',
  ],
  additionalProperties: false,
  properties: {
    id: stringSchema('内容 ID。'),
    type: ref('ContentType'),
    slug: stringSchema('URL slug。', { pattern: SLUG_PATTERN, minLength: 1, maxLength: 120 }),
    title: stringSchema('标题。', { minLength: 1, maxLength: 200 }),
    subtitle: nullableStringField(300),
    summary: nullableStringField(1000),
    body: ref('TiptapDocument'),
    status: ref('ContentStatus'),
    language: { type: 'string', enum: LANGUAGES },
    version: {
      type: 'integer',
      description: '乐观锁版本号。更新时必须以 `If-Match: W/"<version>"` 回传。',
      minimum: 1,
    },
    createdById: stringSchema('创建者 ID。'),
    updatedById: stringSchema('最后修改者 ID。'),
    publishedAt: isoDateTimeField('发布时间。'),
    archivedAt: isoDateTimeField('归档时间。'),
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const SourceSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'kind', 'title'],
  additionalProperties: false,
  properties: {
    id: stringSchema('来源 ID。'),
    kind: { type: 'string', description: '来源类型。', enum: SOURCE_KINDS },
    title: stringSchema('来源标题。', { minLength: 1, maxLength: 300 }),
    author: nullableStringField(200),
    publisher: nullableStringField(200),
    publicationDate: isoDateTimeField('出版/发表时间。'),
    url: nullableStringField(2000),
    accessedAt: isoDateTimeField('访问时间。'),
    citationText: nullableStringField(4000),
    verificationNote: nullableStringField(2000),
  },
};

const ContentSourceSchema: SchemaObject = {
  type: 'object',
  description: '内容与来源的挂载记录，`claimScope` 说明该来源支撑的是哪条论断。',
  required: ['claimScope', 'pageReference', 'isPrimary', 'source'],
  additionalProperties: false,
  properties: {
    claimScope: stringSchema('该来源支撑的论断范围。', { minLength: 1, maxLength: 500 }),
    pageReference: nullableStringField(200),
    isPrimary: { type: 'boolean', description: '是否为主要来源。' },
    source: ref('Source'),
  },
};

const TagSchema: SchemaObject = {
  type: 'object',
  required: ['slug', 'displayName'],
  additionalProperties: false,
  properties: {
    slug: stringSchema('标签 slug。', { minLength: 1, maxLength: 80 }),
    displayName: stringSchema('标签显示名。', { minLength: 1, maxLength: 100 }),
  },
};

const ContentRelationSchema: SchemaObject = {
  type: 'object',
  required: ['targetContentId', 'relationType', 'directionNote'],
  additionalProperties: false,
  properties: {
    targetContentId: stringSchema('关联到的另一条内容 ID。'),
    relationType: { type: 'string', enum: RELATION_TYPES },
    directionNote: nullableStringField(500),
  },
};

const ReadinessIssueSchema: SchemaObject = {
  type: 'object',
  required: ['field', 'code', 'message'],
  additionalProperties: false,
  properties: {
    field: stringSchema('未通过的字段名。'),
    code: stringSchema('机器可读的问题码。'),
    message: stringSchema('人类可读描述。'),
  },
};

const UploadIntentSchema: SchemaObject = {
  type: 'object',
  required: ['mediaId', 'uploadUrl', 'expiresAt'],
  additionalProperties: false,
  properties: {
    mediaId: stringSchema('媒体 ID，完成确认时回传。'),
    uploadUrl: stringSchema('短期上传凭证 URL。'),
    expiresAt: { type: 'string', format: 'date-time', description: '凭证过期时间。' },
  },
};

const MediaCompletionSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'rightsStatus', 'usableInPublic'],
  additionalProperties: false,
  properties: {
    id: stringSchema('媒体 ID。'),
    rightsStatus: {
      type: 'string',
      enum: MEDIA_RIGHTS_STATUSES,
      description: '版权状态。UNKNOWN/RESTRICTED 不可用于公开发布。',
    },
    usableInPublic: { type: 'boolean', description: '按版权状态推导的可公开使用结论。' },
  },
};

const OkResultSchema: SchemaObject = {
  type: 'object',
  description: '无返回负载的操作结果。',
  required: ['ok'],
  additionalProperties: false,
  properties: { ok: { type: 'boolean', const: true } },
};

const MeSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'roles'],
  additionalProperties: false,
  properties: {
    id: stringSchema('当前登录用户 ID。'),
    roles: { type: 'array', items: ref('UserRole') },
  },
};

// ---- 请求体 ----

const LoginRequestSchema: SchemaObject = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: stringSchema('登录邮箱。', { format: 'email', minLength: 3, maxLength: 320 }),
    password: stringSchema('明文密码，服务端使用 Argon2id 校验。', {
      minLength: 1,
      maxLength: 1024,
    }),
  },
};

const RefreshRequestSchema: SchemaObject = {
  type: 'object',
  description: '请求体必须为空对象；refresh token 从 HttpOnly cookie 读取。',
  additionalProperties: false,
  properties: {},
};

const CreateUserRequestSchema: SchemaObject = {
  type: 'object',
  required: ['email', 'password', 'displayName', 'roles'],
  additionalProperties: false,
  properties: {
    email: stringSchema('登录邮箱。', { format: 'email', minLength: 3, maxLength: 320 }),
    password: stringSchema('初始密码，服务端以 Argon2id 存储。', { minLength: 1, maxLength: 1024 }),
    displayName: stringSchema('显示名。', { minLength: 1, maxLength: 80 }),
    roles: { type: 'array', minItems: 1, items: ref('UserRole') },
  },
};

const PatchUserRequestSchema: SchemaObject = {
  type: 'object',
  description: '至少提供一个字段，否则返回 422。',
  additionalProperties: false,
  properties: {
    displayName: stringSchema('显示名。', { minLength: 1, maxLength: 80 }),
    roles: { type: 'array', minItems: 1, items: ref('UserRole') },
    disabled: {
      type: 'boolean',
      description: '停用账号。禁止禁用自己或最后一个启用的管理员。',
    },
    password: stringSchema('重置密码；成功后所有会话失效。', { minLength: 1, maxLength: 1024 }),
  },
};

const CreateContentRequestSchema: SchemaObject = {
  type: 'object',
  required: ['type', 'slug', 'title', 'body', 'extension'],
  additionalProperties: false,
  properties: {
    type: ref('ContentType'),
    slug: stringSchema('URL slug，全局唯一。', {
      pattern: SLUG_PATTERN,
      minLength: 1,
      maxLength: 120,
    }),
    title: stringSchema('标题。', { minLength: 1, maxLength: 200 }),
    subtitle: nullableStringField(300),
    summary: nullableStringField(1000),
    body: ref('TiptapDocument'),
    language: { type: 'string', enum: LANGUAGES, default: 'ZH' },
    extension: ref('ContentExtension'),
  },
};

const PatchContentRequestSchema: SchemaObject = {
  type: 'object',
  description: '至少提供一个字段，否则返回 422。乐观锁由 `If-Match` 请求头承载。',
  additionalProperties: false,
  properties: {
    title: stringSchema('标题。', { minLength: 1, maxLength: 200 }),
    subtitle: nullableStringField(300),
    summary: nullableStringField(1000),
    body: ref('TiptapDocument'),
    slug: stringSchema('URL slug。', { pattern: SLUG_PATTERN, minLength: 1, maxLength: 120 }),
    extension: ref('ContentExtension'),
  },
};

const TransitionRequestSchema: SchemaObject = {
  type: 'object',
  required: ['action'],
  additionalProperties: false,
  properties: {
    action: {
      type: 'string',
      description: '状态机动作。合法迁移由服务端判定，非法跳转返回 409。',
      enum: ['EDIT', 'SUBMIT', 'APPROVE', 'REJECT', 'PUBLISH', 'ARCHIVE', 'RESTORE'],
    },
    reason: stringSchema('拒绝/退回原因，写入 review_actions 与审计日志。', { maxLength: 2000 }),
  },
};

const CreateSourceRequestSchema: SchemaObject = {
  type: 'object',
  required: ['kind', 'title'],
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: SOURCE_KINDS },
    title: stringSchema('来源标题。', { minLength: 1, maxLength: 300 }),
    author: nullableStringField(200),
    publisher: nullableStringField(200),
    publicationDate: { type: ['string', 'null'], format: 'date' },
    url: nullableStringField(2000),
    accessedAt: { type: ['string', 'null'], format: 'date-time' },
    citationText: nullableStringField(4000),
    verificationNote: nullableStringField(2000),
  },
};

const AttachSourceRequestSchema: SchemaObject = {
  type: 'object',
  required: ['sourceId', 'claimScope'],
  additionalProperties: false,
  properties: {
    sourceId: stringSchema('来源 ID。', { minLength: 1 }),
    claimScope: stringSchema('该来源支撑的论断范围。', { minLength: 1, maxLength: 500 }),
    pageReference: nullableStringField(200),
    isPrimary: { type: 'boolean', description: '是否为主要来源。' },
  },
};

const UpsertTagRequestSchema: SchemaObject = {
  type: 'object',
  required: ['slug', 'displayName'],
  additionalProperties: false,
  properties: {
    slug: stringSchema('标签 slug。', { minLength: 1, maxLength: 80 }),
    displayName: stringSchema('标签显示名。', { minLength: 1, maxLength: 100 }),
  },
};

const AttachTagRequestSchema: SchemaObject = {
  type: 'object',
  required: ['tagSlug'],
  additionalProperties: false,
  properties: { tagSlug: stringSchema('标签 slug。', { minLength: 1, maxLength: 80 }) },
};

const CreateRelationRequestSchema: SchemaObject = {
  type: 'object',
  required: ['targetContentId', 'relationType'],
  additionalProperties: false,
  properties: {
    targetContentId: stringSchema('关联到的另一条内容 ID。', { minLength: 1 }),
    relationType: { type: 'string', enum: RELATION_TYPES, minLength: 1, maxLength: 40 },
    directionNote: nullableStringField(500),
  },
};

const CreateUploadIntentRequestSchema: SchemaObject = {
  type: 'object',
  required: ['fileName', 'mimeType', 'sizeBytes'],
  additionalProperties: false,
  properties: {
    fileName: stringSchema('原始文件名，扩展名须与 MIME 一致。', { minLength: 1, maxLength: 255 }),
    mimeType: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
    sizeBytes: {
      type: 'integer',
      description: '字节数，上限 10 MiB。',
      minimum: 1,
      maximum: 10 * 1024 * 1024,
    },
  },
};

const CompleteUploadRequestSchema: SchemaObject = {
  type: 'object',
  description: '上传落盘后的元数据确认。checksum 为 sha256 hex。',
  required: ['checksum', 'altText', 'rightsStatus'],
  additionalProperties: false,
  properties: {
    checksum: stringSchema('文件 sha256 十六进制摘要。', {
      pattern: '^[0-9a-f]{64}$',
      minLength: 64,
      maxLength: 64,
    }),
    altText: stringSchema('替代文本；公开发布必填。', { minLength: 1, maxLength: 500 }),
    rightsStatus: { type: 'string', enum: MEDIA_RIGHTS_STATUSES },
    license: nullableStringField(200),
    creditLine: nullableStringField(300),
    creator: nullableStringField(200),
    width: { type: ['integer', 'null'], minimum: 1 },
    height: { type: ['integer', 'null'], minimum: 1 },
  },
};

// ---- 响应封装（控制器统一返回 `{ data: ... }`）----

/** 生成 `{ data: <schema> }` 响应封装。 */
function dataEnvelope(data: SchemaLike, description: string): SchemaObject {
  return {
    type: 'object',
    description,
    required: ['data'],
    additionalProperties: false,
    properties: { data },
  };
}

function dataListEnvelope(item: SchemaLike, description: string): SchemaObject {
  return {
    type: 'object',
    description,
    required: ['data'],
    additionalProperties: false,
    properties: { data: { type: 'array', items: item } },
  };
}

const SCHEMAS: Readonly<Record<string, SchemaObject>> = {
  // 错误
  ErrorResponse: ErrorResponseSchema,
  ErrorDetail: ErrorDetailSchema,

  // 认证
  LoginRequest: LoginRequestSchema,
  RefreshRequest: RefreshRequestSchema,
  AuthSession: AuthSessionSchema,
  AuthSessionResponse: dataEnvelope(ref('AuthSession'), '登录/刷新成功响应。'),
  Me: MeSchema,
  MeResponse: dataEnvelope(ref('Me'), '当前登录用户响应。'),

  // 用户
  UserRole: UserRoleSchema,
  User: UserSchema,
  CreateUserRequest: CreateUserRequestSchema,
  PatchUserRequest: PatchUserRequestSchema,
  UserResponse: dataEnvelope(ref('User'), '单个用户响应。'),
  UserListResponse: dataListEnvelope(ref('User'), '用户列表响应。'),

  // 内容
  ContentType: ContentTypeSchema,
  ContentStatus: ContentStatusSchema,
  ContentExtension: ContentExtensionSchema,
  TiptapDocument: TiptapDocumentSchema,
  ContentPublic: ContentPublicSchema,
  ContentAdmin: ContentAdminSchema,
  CreateContentRequest: CreateContentRequestSchema,
  PatchContentRequest: PatchContentRequestSchema,
  TransitionRequest: TransitionRequestSchema,
  ContentPublicResponse: dataEnvelope(ref('ContentPublic'), '公开内容详情响应。'),
  ContentPublicListResponse: dataListEnvelope(ref('ContentPublic'), '公开内容列表响应。'),
  ContentAdminResponse: dataEnvelope(ref('ContentAdmin'), '后台内容详情响应。'),
  ContentAdminListResponse: dataListEnvelope(ref('ContentAdmin'), '后台内容列表响应。'),
  ReadinessIssue: ReadinessIssueSchema,
  ReadinessReport: {
    type: 'object',
    description: '发布前校验结果。`ready=false` 时 PUBLISH 返回 422。',
    required: ['ready', 'issues'],
    additionalProperties: false,
    properties: {
      ready: { type: 'boolean', description: '是否满足发布条件。' },
      issues: { type: 'array', items: ref('ReadinessIssue') },
    },
  },
  ReadinessResponse: dataEnvelope(ref('ReadinessReport'), '发布前校验响应。'),

  // 来源 / 标签 / 关联
  Source: SourceSchema,
  CreateSourceRequest: CreateSourceRequestSchema,
  AttachSourceRequest: AttachSourceRequestSchema,
  SourceResponse: dataEnvelope(ref('Source'), '来源详情响应。'),
  ContentSource: ContentSourceSchema,
  ContentSourceListResponse: dataListEnvelope(ref('ContentSource'), '内容的来源列表响应。'),
  Tag: TagSchema,
  UpsertTagRequest: UpsertTagRequestSchema,
  AttachTagRequest: AttachTagRequestSchema,
  TagResponse: dataEnvelope(ref('Tag'), '标签 upsert 响应。'),
  TagListResponse: dataListEnvelope(ref('Tag'), '内容的标签列表响应。'),
  ContentRelation: ContentRelationSchema,
  CreateRelationRequest: CreateRelationRequestSchema,
  ContentRelationListResponse: dataListEnvelope(ref('ContentRelation'), '内容的关联列表响应。'),

  // 媒体
  UploadIntent: UploadIntentSchema,
  CreateUploadIntentRequest: CreateUploadIntentRequestSchema,
  CompleteUploadRequest: CompleteUploadRequestSchema,
  MediaCompletion: MediaCompletionSchema,
  UploadIntentResponse: dataEnvelope(ref('UploadIntent'), '上传凭证响应。'),
  MediaCompletionResponse: dataEnvelope(ref('MediaCompletion'), '上传完成确认响应。'),

  // 通用
  OkResult: OkResultSchema,
  OkResponse: dataEnvelope(ref('OkResult'), '无负载操作的成功响应。'),
  HealthLiveResponse: {
    type: 'object',
    required: ['status', 'service'],
    additionalProperties: false,
    properties: {
      status: { type: 'string', const: 'ok' },
      service: { type: 'string', const: 'api' },
    },
  },
  HealthReadyResponse: {
    type: 'object',
    required: ['status', 'service', 'appEnv', 'checks'],
    additionalProperties: false,
    properties: {
      status: { type: 'string', const: 'ok' },
      service: { type: 'string', const: 'api' },
      appEnv: stringSchema('部署环境标识。'),
      checks: {
        type: 'object',
        additionalProperties: { type: 'string', const: 'ok' },
        description: '依赖探活结果；P1 阶段仅有 process。',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// 响应 / 参数构造器
// ---------------------------------------------------------------------------

const JSON_CONTENT_TYPE = 'application/json';

/** 给任意响应补上 `X-Request-Id` 响应头声明。 */
function withRequestId(response: ResponseObject): ResponseObject {
  return {
    ...response,
    headers: { ...response.headers, [REQUEST_ID_HEADER_NAME]: REQUEST_ID_HEADER },
  };
}

function okResponse(schemaName: string, description: string): ResponseObject {
  return withRequestId({
    description,
    content: { [JSON_CONTENT_TYPE]: { schema: ref(schemaName) } },
  });
}

function errorResponse(description: string): ResponseObject {
  return withRequestId({
    description,
    content: { [JSON_CONTENT_TYPE]: { schema: ref('ErrorResponse') } },
  });
}

function jsonBody(schemaName: string, required: boolean, description?: string): RequestBodyObject {
  return {
    required,
    content: { [JSON_CONTENT_TYPE]: { schema: ref(schemaName) } },
    ...(description === undefined ? {} : { description }),
  };
}

/** 写接口的幂等键。技术方案 §7.1 规定用于发布、上传确认与批量操作。 */
function idempotencyKeyHeader(description: string): ParameterObject {
  return {
    name: 'Idempotency-Key',
    in: 'header',
    description,
    required: false,
    schema: {
      type: 'string',
      minLength: 8,
      maxLength: 255,
      pattern: IDEMPOTENCY_KEY_PATTERN,
    },
  };
}

/** `PATCH /admin/contents/{id}` 的乐观锁条件，缺失或格式错误均返回 422。 */
const IF_MATCH_PARAMETER: ParameterObject = {
  name: 'If-Match',
  in: 'header',
  description: '乐观锁版本号，形如 `W/"3"`。缺失或格式非法返回 422；版本过期返回 409。',
  required: true,
  schema: { type: 'string', pattern: IF_MATCH_PATTERN },
};

const ID_PATH_PARAMETER: ParameterObject = {
  name: 'id',
  in: 'path',
  description: '内容 ID。',
  required: true,
  schema: { type: 'string', minLength: 1 },
};

const SLUG_PATH_PARAMETER: ParameterObject = {
  name: 'slug',
  in: 'path',
  description: '内容 slug。',
  required: true,
  schema: { type: 'string', pattern: SLUG_PATTERN, minLength: 1, maxLength: 120 },
};

const MEDIA_ID_PATH_PARAMETER: ParameterObject = {
  name: 'id',
  in: 'path',
  description: '媒体 ID。',
  required: true,
  schema: { type: 'string', minLength: 1 },
};

const USER_ID_PATH_PARAMETER: ParameterObject = {
  name: 'id',
  in: 'path',
  description: '用户 ID。',
  required: true,
  schema: { type: 'string', minLength: 1 },
};

const LIMIT_QUERY_PARAMETER: ParameterObject = {
  name: 'limit',
  in: 'query',
  description: `返回条数上限，默认 ${String(DEFAULT_PAGE_SIZE)}，最大 ${String(MAX_PAGE_SIZE)}。`,
  required: false,
  schema: {
    type: 'integer',
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
  },
};

const CONTENT_TYPE_QUERY_PARAMETER: ParameterObject = {
  name: 'type',
  in: 'query',
  description: '按内容类型过滤。',
  required: false,
  schema: ref('ContentType'),
};

const CONTENT_STATUS_QUERY_PARAMETER: ParameterObject = {
  name: 'status',
  in: 'query',
  description: '按内容状态过滤（后台列表）。',
  required: false,
  schema: ref('ContentStatus'),
};

/** 已认证端点的通用错误响应集合。 */
const AUTH_ERRORS: Readonly<Record<string, ResponseObject>> = {
  '401': errorResponse('缺少或无法证明身份（凭据错误、token 过期或吊销）。'),
  '403': errorResponse('身份已知但无权（角色不足或账号被停用）。'),
};

const WRITE_ERRORS: Readonly<Record<string, ResponseObject>> = {
  ...AUTH_ERRORS,
  '422': errorResponse('请求格式合法但校验失败（字段级错误见 `error.details`）。'),
  '429': errorResponse('触发限流。'),
  '500': errorResponse('服务内部错误；不返回堆栈或 SQL。'),
};

// ---------------------------------------------------------------------------
// paths
// ---------------------------------------------------------------------------

const BEARER_SECURITY: readonly SecurityRequirementObject[] = [{ bearerAuth: [] }];
const PUBLIC_SECURITY: readonly SecurityRequirementObject[] = [];

const PATHS: Readonly<Record<string, PathItemObject>> = {
  // ---- health（不在 /api/v1 前缀下，见 main.ts 的 setGlobalPrefix exclude）----
  '/health/live': {
    get: {
      operationId: 'healthLive',
      summary: '存活探针',
      description: '只检查进程是否存活，不访问数据库。',
      tags: ['health'],
      security: PUBLIC_SECURITY,
      responses: {
        '200': okResponse('HealthLiveResponse', '进程存活。'),
        '500': errorResponse('服务内部错误。'),
      },
    },
  },
  '/health/ready': {
    get: {
      operationId: 'healthReady',
      summary: '就绪探针',
      description: '汇总依赖探活结果；P1 阶段仅检查进程。',
      tags: ['health'],
      security: PUBLIC_SECURITY,
      responses: {
        '200': okResponse('HealthReadyResponse', '依赖就绪。'),
        '500': errorResponse('服务内部错误。'),
      },
    },
  },

  // ---- auth ----
  '/api/v1/auth/login': {
    post: {
      operationId: 'authLogin',
      summary: '后台登录',
      description: '限流 5 次/分钟/IP。成功后通过 HttpOnly cookie 下发 refresh token。',
      tags: ['auth'],
      security: PUBLIC_SECURITY,
      requestBody: jsonBody('LoginRequest', true),
      responses: {
        '200': okResponse('AuthSessionResponse', '登录成功。'),
        '401': errorResponse('凭据错误或账号被停用。'),
        '422': errorResponse('请求体校验失败。'),
        '429': errorResponse('触发限流。'),
      },
    },
  },
  '/api/v1/auth/refresh': {
    post: {
      operationId: 'authRefresh',
      summary: '刷新会话',
      description: '旋转 refresh token：旧 token 立即吊销。token 从 cookie 读取，请求体为空对象。',
      tags: ['auth'],
      security: PUBLIC_SECURITY,
      requestBody: jsonBody('RefreshRequest', false),
      responses: {
        '200': okResponse('AuthSessionResponse', '刷新成功。'),
        '401': errorResponse('refresh token 缺失、过期或已吊销。'),
        '422': errorResponse('请求体不是空对象。'),
        '429': errorResponse('触发限流。'),
      },
    },
  },
  '/api/v1/auth/logout': {
    post: {
      operationId: 'authLogout',
      summary: '登出',
      description: '幂等：无论 cookie 是否存在都返回 204 并清除 cookie。',
      tags: ['auth'],
      security: PUBLIC_SECURITY,
      responses: {
        '204': withRequestId({ description: '已登出（无响应体）。' }),
        '429': errorResponse('触发限流。'),
        '500': errorResponse('服务内部错误。'),
      },
    },
  },
  '/api/v1/auth/me': {
    get: {
      operationId: 'authMe',
      summary: '当前登录用户',
      description: '登录即可访问，返回用户 ID 与角色列表。',
      tags: ['auth'],
      security: BEARER_SECURITY,
      responses: {
        '200': okResponse('MeResponse', '当前用户信息。'),
        ...AUTH_ERRORS,
      },
    },
  },

  // ---- 公开内容 ----
  '/api/v1/contents': {
    get: {
      operationId: 'listPublicContents',
      summary: '公开内容列表',
      description: '只返回 PUBLISHED 且未归档的内容，按发布时间倒序。',
      tags: ['contents'],
      security: PUBLIC_SECURITY,
      parameters: [CONTENT_TYPE_QUERY_PARAMETER, LIMIT_QUERY_PARAMETER],
      responses: {
        '200': okResponse('ContentPublicListResponse', '公开内容列表。'),
        '422': errorResponse('查询参数非法。'),
        '500': errorResponse('服务内部错误。'),
      },
    },
  },
  '/api/v1/contents/{slug}': {
    get: {
      operationId: 'getPublicContent',
      summary: '公开内容详情',
      description: '草稿、归档与不存在统一返回 404，不泄露"存在但未发布"。',
      tags: ['contents'],
      security: PUBLIC_SECURITY,
      parameters: [SLUG_PATH_PARAMETER],
      responses: {
        '200': okResponse('ContentPublicResponse', '公开内容详情。'),
        '404': errorResponse('内容不存在或未发布。'),
        '500': errorResponse('服务内部错误。'),
      },
    },
  },

  // ---- 后台内容 ----
  '/api/v1/admin/contents': {
    get: {
      operationId: 'listAdminContents',
      summary: '后台内容列表',
      description: '任意编辑角色可见，按更新时间倒序。',
      tags: ['contents'],
      security: BEARER_SECURITY,
      parameters: [
        CONTENT_TYPE_QUERY_PARAMETER,
        CONTENT_STATUS_QUERY_PARAMETER,
        LIMIT_QUERY_PARAMETER,
      ],
      responses: {
        '200': okResponse('ContentAdminListResponse', '后台内容列表。'),
        ...AUTH_ERRORS,
        '422': errorResponse('查询参数非法。'),
        '500': errorResponse('服务内部错误。'),
      },
    },
    post: {
      operationId: 'createContent',
      summary: '创建内容草稿',
      description: '正文按 Tiptap 白名单校验；创建后状态为 DRAFT、version=1。',
      tags: ['contents'],
      security: BEARER_SECURITY,
      parameters: [idempotencyKeyHeader('可选。技术方案 §7.1：写接口支持 Idempotency-Key。')],
      requestBody: jsonBody('CreateContentRequest', true),
      responses: {
        '201': okResponse('ContentAdminResponse', '创建成功。'),
        ...WRITE_ERRORS,
        '409': errorResponse('slug 已被占用。'),
      },
    },
  },
  '/api/v1/admin/contents/{id}': {
    get: {
      operationId: 'getAdminContent',
      summary: '后台内容详情',
      tags: ['contents'],
      security: BEARER_SECURITY,
      parameters: [ID_PATH_PARAMETER],
      responses: {
        '200': okResponse('ContentAdminResponse', '内容详情。'),
        ...AUTH_ERRORS,
        '404': errorResponse('内容不存在。'),
        '500': errorResponse('服务内部错误。'),
      },
    },
    patch: {
      operationId: 'updateContent',
      summary: '更新内容',
      description:
        '乐观锁更新：必须携带 `If-Match: W/"<version>"`。版本不一致返回 409，且不会静默覆盖。',
      tags: ['contents'],
      security: BEARER_SECURITY,
      parameters: [
        ID_PATH_PARAMETER,
        IF_MATCH_PARAMETER,
        idempotencyKeyHeader('可选。技术方案 §7.1：写接口支持 Idempotency-Key。'),
      ],
      requestBody: jsonBody('PatchContentRequest', true),
      responses: {
        '200': okResponse('ContentAdminResponse', '更新成功。'),
        ...WRITE_ERRORS,
        '404': errorResponse('内容不存在。'),
        '409': errorResponse('If-Match 版本与当前版本不一致。'),
      },
    },
  },
  '/api/v1/admin/contents/{id}/transition': {
    post: {
      operationId: 'transitionContent',
      summary: '内容状态流转',
      description:
        '唯一合法的状态变更入口。流转由服务端状态机判定；Editor 不得审批或发布。PUBLISH 前会执行发布校验，未通过返回 422。',
      tags: ['contents'],
      security: BEARER_SECURITY,
      parameters: [
        ID_PATH_PARAMETER,
        idempotencyKeyHeader('可选。发布动作建议携带，用于重试去重（技术方案 §7.1）。'),
      ],
      requestBody: jsonBody('TransitionRequest', true),
      responses: {
        '200': okResponse('ContentAdminResponse', '流转成功。'),
        ...WRITE_ERRORS,
        '404': errorResponse('内容不存在。'),
        '409': errorResponse('当前状态不允许该动作。'),
      },
    },
  },
  '/api/v1/admin/contents/{id}/readiness': {
    get: {
      operationId: 'getContentReadiness',
      summary: '发布前校验预览',
      description: '返回来源、版权、必填字段与地理核验的检查结果，用于编辑端提示。',
      tags: ['contents'],
      security: BEARER_SECURITY,
      parameters: [ID_PATH_PARAMETER],
      responses: {
        '200': okResponse('ReadinessResponse', '校验结果。'),
        ...AUTH_ERRORS,
        '404': errorResponse('内容不存在。'),
        '500': errorResponse('服务内部错误。'),
      },
    },
  },

  // ---- 来源 ----
  '/api/v1/admin/sources': {
    post: {
      operationId: 'createSource',
      summary: '创建来源',
      description: '来源是可追溯性的核心记录；AI 生成内容发布前必须挂来源。',
      tags: ['sources'],
      security: BEARER_SECURITY,
      parameters: [idempotencyKeyHeader('可选。技术方案 §7.1：写接口支持 Idempotency-Key。')],
      requestBody: jsonBody('CreateSourceRequest', true),
      responses: {
        '201': okResponse('SourceResponse', '创建成功。'),
        ...WRITE_ERRORS,
      },
    },
  },
  '/api/v1/admin/contents/{id}/sources': {
    post: {
      operationId: 'attachSource',
      summary: '为内容挂来源',
      description: '同一内容重复挂同一来源会被唯一约束拒绝。',
      tags: ['sources'],
      security: BEARER_SECURITY,
      parameters: [
        ID_PATH_PARAMETER,
        idempotencyKeyHeader('可选。技术方案 §7.1：写接口支持 Idempotency-Key。'),
      ],
      requestBody: jsonBody('AttachSourceRequest', true),
      responses: {
        '201': okResponse('OkResponse', '挂载成功。'),
        ...WRITE_ERRORS,
        '404': errorResponse('内容或来源不存在。'),
      },
    },
    get: {
      operationId: 'listContentSources',
      summary: '列出内容的来源',
      tags: ['sources'],
      security: BEARER_SECURITY,
      parameters: [ID_PATH_PARAMETER],
      responses: {
        '200': okResponse('ContentSourceListResponse', '来源列表。'),
        ...AUTH_ERRORS,
        '500': errorResponse('服务内部错误。'),
      },
    },
  },

  // ---- 标签 ----
  '/api/v1/admin/tags': {
    post: {
      operationId: 'upsertTag',
      summary: '创建或更新标签',
      description: '按 slug upsert：已存在时只更新显示名，幂等。',
      tags: ['tags'],
      security: BEARER_SECURITY,
      parameters: [idempotencyKeyHeader('可选。技术方案 §7.1：写接口支持 Idempotency-Key。')],
      requestBody: jsonBody('UpsertTagRequest', true),
      responses: {
        '201': okResponse('TagResponse', 'upsert 成功。'),
        ...WRITE_ERRORS,
      },
    },
  },
  '/api/v1/admin/contents/{id}/tags': {
    post: {
      operationId: 'attachTag',
      summary: '为内容打标签',
      description: '重复打标跳过，幂等。',
      tags: ['tags'],
      security: BEARER_SECURITY,
      parameters: [
        ID_PATH_PARAMETER,
        idempotencyKeyHeader('可选。技术方案 §7.1：写接口支持 Idempotency-Key。'),
      ],
      requestBody: jsonBody('AttachTagRequest', true),
      responses: {
        '201': okResponse('OkResponse', '打标成功。'),
        ...WRITE_ERRORS,
        '404': errorResponse('内容不存在。'),
      },
    },
    get: {
      operationId: 'listContentTags',
      summary: '列出内容的标签',
      tags: ['tags'],
      security: BEARER_SECURITY,
      parameters: [ID_PATH_PARAMETER],
      responses: {
        '200': okResponse('TagListResponse', '标签列表。'),
        ...AUTH_ERRORS,
        '500': errorResponse('服务内部错误。'),
      },
    },
  },

  // ---- 关联 ----
  '/api/v1/admin/contents/{id}/relations': {
    post: {
      operationId: 'createRelation',
      summary: '创建内容关联',
      description: '关联在两个方向都可查询，因此列出时会包含入边与出边。',
      tags: ['relations'],
      security: BEARER_SECURITY,
      parameters: [
        ID_PATH_PARAMETER,
        idempotencyKeyHeader('可选。技术方案 §7.1：写接口支持 Idempotency-Key。'),
      ],
      requestBody: jsonBody('CreateRelationRequest', true),
      responses: {
        '201': okResponse('OkResponse', '创建成功。'),
        ...WRITE_ERRORS,
        '404': errorResponse('内容不存在。'),
      },
    },
    get: {
      operationId: 'listContentRelations',
      summary: '列出内容关联',
      tags: ['relations'],
      security: BEARER_SECURITY,
      parameters: [ID_PATH_PARAMETER],
      responses: {
        '200': okResponse('ContentRelationListResponse', '关联列表。'),
        ...AUTH_ERRORS,
        '500': errorResponse('服务内部错误。'),
      },
    },
  },

  // ---- 媒体 ----
  '/api/v1/admin/media/upload-intents': {
    post: {
      operationId: 'createUploadIntent',
      summary: '申请上传凭证',
      description: '签发短期上传凭证并创建 PENDING 媒体记录；校验扩展名与 MIME 一致性。',
      tags: ['media'],
      security: BEARER_SECURITY,
      parameters: [idempotencyKeyHeader('可选。技术方案 §7.1：写接口支持 Idempotency-Key。')],
      requestBody: jsonBody('CreateUploadIntentRequest', true),
      responses: {
        '201': okResponse('UploadIntentResponse', '凭证签发成功。'),
        ...WRITE_ERRORS,
        '400': errorResponse('扩展名与 MIME 不符或大小非法。'),
      },
    },
  },
  '/api/v1/admin/media/{id}/complete': {
    post: {
      operationId: 'completeUpload',
      summary: '上传完成确认',
      description:
        '幂等：intent 只能从 PENDING 单向变 COMPLETED，重复确认返回 400 而不是重复写库。UNKNOWN/RESTRICTED 版权状态不得公开发布。',
      tags: ['media'],
      security: BEARER_SECURITY,
      parameters: [
        MEDIA_ID_PATH_PARAMETER,
        idempotencyKeyHeader('技术方案 §7.1：上传完成确认接受 Idempotency-Key。'),
      ],
      requestBody: jsonBody('CompleteUploadRequest', true),
      responses: {
        '201': okResponse('MediaCompletionResponse', '确认成功。'),
        ...WRITE_ERRORS,
        '400': errorResponse('checksum 非法、意图已处理或已过期。'),
        '404': errorResponse('媒体不存在。'),
      },
    },
  },

  // ---- 用户 ----
  '/api/v1/admin/users': {
    get: {
      operationId: 'listUsers',
      summary: '列出用户',
      description: '仅 Admin 可见；当前实现返回前 100 条。',
      tags: ['users'],
      security: BEARER_SECURITY,
      responses: {
        '200': okResponse('UserListResponse', '用户列表。'),
        ...AUTH_ERRORS,
        '500': errorResponse('服务内部错误。'),
      },
    },
    post: {
      operationId: 'createUser',
      summary: '创建用户',
      description: '仅 Admin 可用；密码以 Argon2id 存储。',
      tags: ['users'],
      security: BEARER_SECURITY,
      parameters: [idempotencyKeyHeader('可选。技术方案 §7.1：写接口支持 Idempotency-Key。')],
      requestBody: jsonBody('CreateUserRequest', true),
      responses: {
        '201': okResponse('UserResponse', '创建成功。'),
        ...WRITE_ERRORS,
        '409': errorResponse('邮箱已被占用。'),
      },
    },
  },
  '/api/v1/admin/users/{id}': {
    patch: {
      operationId: 'updateUser',
      summary: '更新用户',
      description:
        '仅 Admin 可用。禁止禁用自己、最后一个启用的管理员，或移除其 ADMIN 角色。改密码或停用会立即吊销全部会话。',
      tags: ['users'],
      security: BEARER_SECURITY,
      parameters: [
        USER_ID_PATH_PARAMETER,
        idempotencyKeyHeader('可选。技术方案 §7.1：写接口支持 Idempotency-Key。'),
      ],
      requestBody: jsonBody('PatchUserRequest', true),
      responses: {
        '200': okResponse('UserResponse', '更新成功。'),
        ...WRITE_ERRORS,
        '403': errorResponse('违反最后一个管理员保护规则。'),
        '404': errorResponse('用户不存在。'),
      },
    },
  },
};

// ---------------------------------------------------------------------------
// 文档
// ---------------------------------------------------------------------------

/**
 * OpenAPI 3.1 文档。
 *
 * `servers.url` 用 `/` 相对根：业务接口带 `/api/v1` 前缀而 health 不带，
 * 单个 server 入口无法同时表达两者，所以路径里写完整前缀（与 `main.ts` 一致）。
 */
export const openApiDocument: OpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Nanking Atlas API',
    version: '1.0.0',
    description: [
      '南京城市文化数字档案平台的统一后端 API。',
      '',
      '## 约定',
      '',
      '- 业务接口统一前缀 `/api/v1`；健康检查 `/health/*` 不带前缀。',
      '- 每个响应都带 `X-Request-Id` 响应头，错误体中的 `error.requestId` 与之一致，报障时请提供该值。',
      '- 统一错误体 `{ error: { code, message, details?, requestId } }`。',
      '- 认证使用 `Authorization: Bearer <accessToken>`；refresh token 只经 HttpOnly cookie 传递。',
      '- 写接口可携带 `Idempotency-Key`；内容更新必须携带 `If-Match: W/"<version>"`，版本冲突返回 409。',
      '- 内容可信度：坐标未核实时 `accuracy=UNKNOWN`，不得猜测精确点；AI 生成内容发布前必须有来源。',
    ].join('\n'),
  },
  servers: [{ url: '/', description: '同源部署路径（业务接口带 /api/v1 前缀）。' }],
  tags: [
    { name: 'health', description: '存活与就绪探针。' },
    { name: 'auth', description: '后台认证与会话。' },
    { name: 'contents', description: '内容（地点/人物/事件/建筑/民俗/专题/路线）。' },
    { name: 'sources', description: '史料来源与论断挂载。' },
    { name: 'tags', description: '标签。' },
    { name: 'relations', description: '内容关联。' },
    { name: 'media', description: '图片上传与版权元数据。' },
    { name: 'users', description: '后台用户与角色管理。' },
  ],
  paths: PATHS,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '登录或刷新后获得的 access token，作为 `Authorization: Bearer <token>` 发送。',
      },
    },
    schemas: SCHEMAS,
  },
};

/** 遍历文档里全部 operation（按 path、method 的声明顺序）。 */
export function listOperations(
  doc: OpenApiDocument = openApiDocument,
): { path: string; method: HttpMethod; operation: OperationObject }[] {
  const result: { path: string; method: HttpMethod; operation: OperationObject }[] = [];
  for (const [path, pathItem] of Object.entries(doc.paths)) {
    for (const [key, operation] of Object.entries(pathItem)) {
      if (!isHttpMethod(key) || operation === undefined) {
        continue;
      }
      result.push({ path, method: key, operation });
    }
  }
  return result;
}

/** operation 总数 —— CI 与测试断言用。 */
export function countOperations(doc: OpenApiDocument = openApiDocument): number {
  return listOperations(doc).length;
}
