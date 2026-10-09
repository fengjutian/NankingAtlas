/**
 * OpenAPI 文档自身的结构契约测试（P1-11）。
 *
 * 这些断言防的是"加了路由忘了更新文档"和"文档悄悄偏离运行时契约"两类回归：
 * - 技术方案 §7.3 要求接口变更必须先更新契约与测试；
 * - AGENTS.md §6.3 要求跨应用类型来自生成契约，契约本身就必须可信。
 *
 * 断言刻意写死真实常量（slug 正则、limit 上限、错误码全集），而不是自我循环
 * 地验证文档内部一致性 —— 否则文档整体写错也照样绿灯。
 *
 * 注意：本文件不能 import `@nanking-atlas/api-contract`（包边界规则禁止 API
 * 依赖 api-contract），因此错误码与分页上限的期望值来自 `./openapi.js`。
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { slugSchema } from '@nanking-atlas/validation';

import {
  API_ERROR_CODES,
  countOperations,
  isHttpMethod,
  listOperations,
  MAX_PAGE_SIZE,
  openApiDocument,
  REQUEST_ID_HEADER_NAME,
  type OpenApiDocument,
  type OperationObject,
  type SchemaLike,
} from './openapi.js';

const doc: OpenApiDocument = openApiDocument;
const operations = listOperations(doc);

const ERROR_RESPONSE_REF = '#/components/schemas/ErrorResponse';

/** schema 片段读出来是 `unknown`，统一收窄成可点取成员的记录。 */
type SchemaRecord = Record<string, unknown>;

/** 取出 schema 片段的 `$ref`；不是引用则返回 null。 */
function refOf(schema: SchemaLike | undefined): string | null {
  if (schema === undefined || typeof schema !== 'object' || schema === null) {
    return null;
  }
  const ref = (schema as { $ref?: unknown }).$ref;
  return typeof ref === 'string' ? ref : null;
}

function record(value: unknown): SchemaRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as SchemaRecord)
    : {};
}

/** 取 components.schemas 里的一个 schema（缺失时让断言失败并给出名称）。 */
function schemaAt(name: string): SchemaRecord {
  const schema = doc.components.schemas[name];
  expect(schema, `components.schemas 缺少 ${name}`).toBeDefined();
  return record(schema);
}

/** 取对象 schema 里某个属性的子 schema；缺失时返回空记录。 */
function propertySchema(schema: SchemaRecord, name: string): SchemaRecord {
  return record(record(schema.properties)[name]);
}

/** 把 schema 里的字符串数组字段读出来（`required` / `enum` 都是这个形状）。 */
function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function findOperation(path: string, method: string): OperationObject | undefined {
  return operations.find((item) => item.path === path && item.method === method)?.operation;
}

/** 该 operation 是否为写操作。 */
function isWrite(method: string): boolean {
  return method === 'post' || method === 'patch' || method === 'put' || method === 'delete';
}

/** 会话类接口：登录 / 刷新 / 登出，不属于可重试的资源写。 */
function isAuthSession(path: string): boolean {
  return path.startsWith('/api/v1/auth/');
}

describe('OpenAPI 文档骨架', () => {
  it('声明 OpenAPI 3.1 版本', () => {
    expect(doc.openapi).toMatch(/^3\.1\.\d+$/);
  });

  it('info 具备 title / version / description', () => {
    expect(doc.info.title.length).toBeGreaterThan(0);
    expect(doc.info.version.length).toBeGreaterThan(0);
    expect(doc.info.description.length).toBeGreaterThan(0);
  });

  it('info.description 是中文说明且包含关键约定', () => {
    expect(doc.info.description).toContain('/api/v1');
    expect(doc.info.description).toContain('X-Request-Id');
    expect(doc.info.description).toContain('If-Match');
    expect(/[一-龥]/.test(doc.info.description)).toBe(true);
  });

  it('声明至少一个 server', () => {
    expect(doc.servers.length).toBeGreaterThan(0);
  });

  it('components.schemas 至少 10 个', () => {
    expect(Object.keys(doc.components.schemas).length).toBeGreaterThanOrEqual(10);
  });

  it('覆盖全部已实现路由（>= 25 个 operation）', () => {
    expect(countOperations(doc)).toBeGreaterThanOrEqual(25);
  });
});

describe('operation 完整性', () => {
  it('每个 operation 都有 operationId / summary / responses', () => {
    for (const { path, method, operation } of operations) {
      const where = `${method.toUpperCase()} ${path}`;
      expect(operation.operationId.length, `${where} 缺 operationId`).toBeGreaterThan(0);
      expect(operation.summary.length, `${where} 缺 summary`).toBeGreaterThan(0);
      expect(Object.keys(operation.responses).length, `${where} 缺 responses`).toBeGreaterThan(0);
    }
  });

  it('operationId 全局唯一', () => {
    const ids = operations.map((item) => item.operation.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个 path 只出现一次（无重复声明）', () => {
    const keys = Object.keys(doc.paths);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('每个 path 至少声明一个 method，且 method 键合法', () => {
    for (const [path, pathItem] of Object.entries(doc.paths)) {
      const methods = Object.keys(pathItem).filter(isHttpMethod);
      expect(methods.length, `${path} 没有 method`).toBeGreaterThan(0);
      expect(Object.keys(pathItem).every(isHttpMethod), `${path} 含非法键`).toBe(true);
    }
  });

  it('每个响应都有 description', () => {
    for (const { path, method, operation } of operations) {
      for (const [status, response] of Object.entries(operation.responses)) {
        expect(
          response.description.length,
          `${method.toUpperCase()} ${path} ${status} 缺 description`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('每个 operation 都声明了 tag，且 tag 在顶层 tags 中登记', () => {
    const declared = new Set(doc.tags.map((tag) => tag.name));
    for (const { path, method, operation } of operations) {
      expect(operation.tags.length, `${method.toUpperCase()} ${path} 缺 tags`).toBeGreaterThan(0);
      for (const tag of operation.tags) {
        expect(declared.has(tag), `tag "${tag}" 未在顶层 tags 登记`).toBe(true);
      }
    }
  });
});

describe('错误契约统一', () => {
  it('所有 4xx / 5xx 响应都引用统一的 ErrorResponse', () => {
    for (const { path, method, operation } of operations) {
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!status.startsWith('4') && !status.startsWith('5')) {
          continue;
        }
        const ref = refOf(response.content?.['application/json']?.schema);
        expect(ref, `${method.toUpperCase()} ${path} ${status} 未引用 ErrorResponse`).toBe(
          ERROR_RESPONSE_REF,
        );
      }
    }
  });

  it('每个 operation 至少有一个 4xx 或 5xx 响应', () => {
    for (const { path, method, operation } of operations) {
      const hasError = Object.keys(operation.responses).some(
        (status) => status.startsWith('4') || status.startsWith('5'),
      );
      expect(hasError, `${method.toUpperCase()} ${path} 没有错误响应`).toBe(true);
    }
  });

  it('ErrorResponse 的 code 枚举与 API_ERROR_CODES 完全一致', () => {
    const codeSchema = propertySchema(propertySchema(schemaAt('ErrorResponse'), 'error'), 'code');
    expect(stringList(codeSchema.enum)).toEqual([...API_ERROR_CODES]);
  });

  it('错误码无重复且都是大写蛇形', () => {
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
    for (const code of API_ERROR_CODES) {
      expect(code, `错误码 "${code}" 不是大写蛇形`).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it('ErrorResponse 形状为 { error: { code, message, details?, requestId } }', () => {
    const errorResponse = schemaAt('ErrorResponse');
    const error = propertySchema(errorResponse, 'error');
    expect(Object.keys(record(error.properties)).sort()).toEqual([
      'code',
      'details',
      'message',
      'requestId',
    ]);
    expect(stringList(error.required)).toEqual(['code', 'message', 'requestId']);
    expect(stringList(errorResponse.required)).toEqual(['error']);
  });

  it('details 是自由对象而非强约束结构（允许字段级错误）', () => {
    const details = propertySchema(propertySchema(schemaAt('ErrorResponse'), 'error'), 'details');
    expect(details.type).toBe('object');
    expect(details.additionalProperties).toBe(true);
  });
});

describe('响应头约定', () => {
  it('每个 operation 的每个响应都声明 X-Request-Id', () => {
    for (const { path, method, operation } of operations) {
      for (const [status, response] of Object.entries(operation.responses)) {
        expect(
          response.headers?.[REQUEST_ID_HEADER_NAME],
          `${method.toUpperCase()} ${path} ${status} 缺 ${REQUEST_ID_HEADER_NAME}`,
        ).toBeDefined();
      }
    }
  });

  it('X-Request-Id 声明为必填', () => {
    const header =
      doc.paths['/api/v1/auth/me']?.get?.responses['200']?.headers?.[REQUEST_ID_HEADER_NAME];
    expect(header?.required).toBe(true);
  });
});

describe('写操作约定', () => {
  it('每个 POST / PATCH 都有 4xx 响应', () => {
    for (const { path, method, operation } of operations) {
      if (!isWrite(method)) {
        continue;
      }
      const hasClientError = Object.keys(operation.responses).some((status) =>
        status.startsWith('4'),
      );
      expect(hasClientError, `${method.toUpperCase()} ${path} 没有 4xx 响应`).toBe(true);
    }
  });

  it('写操作都声明 Idempotency-Key 请求头', () => {
    for (const { path, method, operation } of operations) {
      if (!isWrite(method) || isAuthSession(path)) {
        continue;
      }
      const names = (operation.parameters ?? []).map((parameter) => parameter.name);
      expect(names, `${method.toUpperCase()} ${path} 缺 Idempotency-Key`).toContain(
        'Idempotency-Key',
      );
    }
  });

  it('auth 会话接口不声明 Idempotency-Key（登录不是可重试的资源写）', () => {
    // 技术方案 §7.1 把幂等键限定在"发布、上传完成确认、批量操作"。
    // login/refresh/logout 是会话操作，声明幂等键会误导调用方以为服务端做了去重。
    for (const path of ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout']) {
      const operation = operations.find((item) => item.path === path)?.operation;
      const names = (operation?.parameters ?? []).map((parameter) => parameter.name);
      expect(names, `${path} 不应声明 Idempotency-Key`).not.toContain('Idempotency-Key');
    }
  });

  it('Idempotency-Key 是可选的（带与不带都应被接受）', () => {
    const create = findOperation('/api/v1/admin/contents', 'post');
    const key = (create?.parameters ?? []).find((item) => item.name === 'Idempotency-Key');
    expect(key?.required).toBe(false);
    expect(key?.in).toBe('header');
  });

  it('PATCH /admin/contents/{id} 声明必填 If-Match 且为弱 ETag 形式', () => {
    const update = findOperation('/api/v1/admin/contents/{id}', 'patch');
    const ifMatch = (update?.parameters ?? []).find((item) => item.name === 'If-Match');
    expect(ifMatch).toBeDefined();
    expect(ifMatch?.required).toBe(true);
    const pattern = record(ifMatch?.schema).pattern;
    expect(typeof pattern).toBe('string');
    const regex = new RegExp(pattern as string);
    expect(regex.test('W/"3"')).toBe(true);
    expect(regex.test('"3"')).toBe(false);
    expect(regex.test('3')).toBe(false);
  });

  it('PATCH 用户接口不要求 If-Match（该接口无乐观锁版本字段）', () => {
    const patchUser = findOperation('/api/v1/admin/users/{id}', 'patch');
    const names = (patchUser?.parameters ?? []).map((item) => item.name);
    expect(names).not.toContain('If-Match');
  });

  it('所有请求体都以 application/json 声明', () => {
    for (const { path, method, operation } of operations) {
      const body = operation.requestBody;
      if (body === undefined) {
        continue;
      }
      expect(
        body.content['application/json'],
        `${method.toUpperCase()} ${path} 请求体未声明 application/json`,
      ).toBeDefined();
    }
  });

  it('请求体 schema 禁止未知字段（对应 zod .strict() 白名单）', () => {
    const createContent = findOperation('/api/v1/admin/contents', 'post');
    const ref = refOf(createContent?.requestBody?.content['application/json']?.schema);
    expect(ref).toBe('#/components/schemas/CreateContentRequest');
    expect(schemaAt('CreateContentRequest').additionalProperties).toBe(false);
  });
});

describe('认证与安全声明', () => {
  it('bearerAuth 使用 HTTP bearer', () => {
    const scheme = record(doc.components.securitySchemes.bearerAuth);
    expect(scheme.type).toBe('http');
    expect(scheme.scheme).toBe('bearer');
  });

  it('公开端点显式声明 security: []', () => {
    const publicOperations = [
      ['/health/live', 'get'],
      ['/health/ready', 'get'],
      ['/api/v1/auth/login', 'post'],
      ['/api/v1/contents', 'get'],
    ] as const;
    for (const [path, method] of publicOperations) {
      const operation = findOperation(path, method);
      expect(operation, `缺少 ${path} ${method}`).toBeDefined();
      expect(operation?.security, `${path} ${method} 未声明 security: []`).toEqual([]);
    }
  });

  it('后台端点声明 bearerAuth', () => {
    expect(findOperation('/api/v1/admin/contents', 'get')?.security).toEqual([{ bearerAuth: [] }]);
  });

  it('health 端点不带 /api/v1 前缀，其余业务路径都带', () => {
    for (const { path } of operations) {
      if (path.startsWith('/health')) {
        expect(path).not.toContain('/api/v1');
      } else {
        expect(path, `${path} 缺少 /api/v1 前缀`).toMatch(/^\/api\/v1\//);
      }
    }
  });
});

describe('schema 与运行时约束一致', () => {
  it('slug 正则与 @nanking-atlas/validation 的 slugSchema 行为一致', () => {
    const pattern = propertySchema(schemaAt('CreateContentRequest'), 'slug').pattern;
    expect(typeof pattern).toBe('string');

    const docRegex = z.string().regex(new RegExp(pattern as string));
    const samples = [
      'nanjing',
      'qinhuai-district',
      '2024-archive',
      '',
      'Nanjing',
      '-lead',
      'trail-',
      'double--hyphen',
      'under_score',
      '南京市',
    ];
    for (const sample of samples) {
      expect(docRegex.safeParse(sample).success, `slug "${sample}" 判定不一致`).toBe(
        slugSchema.safeParse(sample).success,
      );
    }
  });

  it('limit 上限与 MAX_PAGE_SIZE 一致', () => {
    const parameters = findOperation('/api/v1/contents', 'get')?.parameters ?? [];
    const limit = parameters.find((item) => item.name === 'limit');
    expect(record(limit?.schema).maximum).toBe(MAX_PAGE_SIZE);
    expect(MAX_PAGE_SIZE).toBe(100);
  });

  it('内容类型枚举与 database 包一致', () => {
    const contentType = schemaAt('ContentType').enum;
    expect(Array.isArray(contentType)).toBe(true);
    expect(contentType).toContain('PLACE');
    expect(contentType).toContain('ROUTE');
  });

  it('UserRole 枚举覆盖四个后台角色', () => {
    expect(schemaAt('UserRole').enum).toEqual(['ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER']);
  });

  it('媒体版权状态包含 UNKNOWN 与 RESTRICTED（禁止公开发布的两种）', () => {
    expect(schemaAt('CreateUploadIntentRequest').required).toEqual([
      'fileName',
      'mimeType',
      'sizeBytes',
    ]);
    const rights = propertySchema(schemaAt('CompleteUploadRequest'), 'rightsStatus');
    expect(rights.enum).toContain('UNKNOWN');
    expect(rights.enum).toContain('RESTRICTED');
  });

  it('没有悬空的 $ref（每个引用都能在 components.schemas 找到）', () => {
    const known = new Set(Object.keys(doc.components.schemas));
    const dangling: string[] = [];

    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) {
          walk(item);
        }
        return;
      }
      if (typeof node !== 'object' || node === null) {
        return;
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') {
          if (!known.has(value.replace('#/components/schemas/', ''))) {
            dangling.push(value);
          }
          continue;
        }
        walk(value);
      }
    };

    walk(doc.paths);
    walk(doc.components.schemas);
    expect(dangling).toEqual([]);
  });
});

describe('路径前缀覆盖（新增路由时防止漏更新文档）', () => {
  const expectedPrefixes = [
    'auth',
    'users',
    'contents',
    'sources',
    'tags',
    'relations',
    'media',
  ] as const;

  for (const prefix of expectedPrefixes) {
    it(`文档覆盖 ${prefix} 相关路径`, () => {
      const matched = operations.filter((item) => item.path.includes(`/${prefix}`));
      expect(matched.length, `没有任何 ${prefix} 路径被文档覆盖`).toBeGreaterThan(0);
    });
  }

  it('admin 端点覆盖内容、来源、标签、关联、媒体、用户六类', () => {
    const adminPaths = operations
      .map((item) => item.path)
      .filter((path) => path.startsWith('/api/v1/admin/'));
    for (const segment of ['contents', 'sources', 'tags', 'relations', 'media', 'users']) {
      expect(
        adminPaths.some((path) => path.includes(segment)),
        `admin 路径缺少 ${segment}`,
      ).toBe(true);
    }
  });
});
