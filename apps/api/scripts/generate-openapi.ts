/**
 * P1-11 规范生成器。
 *
 * 从 `src/openapi.ts` 的手写文档对象推导两个产物：
 *
 * 1. `apps/api/openapi.json` —— 规范 JSON 快照，供 breaking 检查与人工查阅；
 * 2. `packages/api-contract/src/generated/api-client.ts` —— 前端类型客户端。
 *
 * ## 为什么不启动 Nest 运行时
 *
 * 文档是纯对象，没有 DI、没有数据库访问。`import` 它即可，
 * 避免为了生成规范而连 DATABASE_URL（AGENTS.md §2.5：禁止用 mock 冒充持久化功能，
 * 这里反过来 —— 不需要 mock，也不需要真实连接）。
 *
 * ## 为什么手写类型推导
 *
 * AGENTS.md §6.5：新依赖必须说明用途并检查许可。`openapi-typescript` / `orval`
 * 能做同样的事，但本仓库的规范规模（27 个 operation）用不上它们带来的
 * 运行时 fetch 封装与代码生成框架；手写 ~150 行推导逻辑即可完全掌控输出形态，
 * 且输出可重复、无时间戳、diff 干净。
 *
 * 用法：`pnpm --filter @nanking-atlas/api openapi:generate`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { format, resolveConfig } from 'prettier';

import {
  isReferenceObject,
  listOperations,
  openApiDocument,
  REQUEST_ID_HEADER_NAME,
  type HttpMethod,
  type OperationObject,
  type OpenApiDocument,
  type ParameterObject,
  type SchemaLike,
  type SchemaObject,
  type SchemaTypeName,
} from '../src/openapi.js';

/** pnpm 执行脚本时 cwd = 包目录（apps/api）。 */
const API_ROOT = process.cwd();
const REPO_ROOT = resolve(API_ROOT, '..', '..');

const OPENAPI_JSON_PATH = resolve(API_ROOT, 'openapi.json');
const CLIENT_PATH = resolve(REPO_ROOT, 'packages/api-contract/src/generated/api-client.ts');

// ---------------------------------------------------------------------------
// schema → TypeScript
// ---------------------------------------------------------------------------

/** 把 JSON Schema 片段映射成 TypeScript 类型表达式（字符串）。 */
function schemaToTs(schema: SchemaLike): string {
  if (isReferenceObject(schema)) {
    const name = schema.$ref.startsWith('#/components/schemas/')
      ? schema.$ref.slice('#/components/schemas/'.length)
      : schema.$ref;
    return name;
  }

  // const 最具体，优先于 enum。
  if (schema.const !== undefined) {
    return JSON.stringify(schema.const);
  }

  if (schema.enum !== undefined && schema.enum.length > 0) {
    return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  }

  const types = schemaTypes(schema);
  if (types.length === 0) {
    // `{}` 之类的自由 schema（例如 Tiptap 节点的 content 项）。
    return 'unknown';
  }

  const nullable = types.includes('null');
  const nonNull = types.filter((type) => type !== 'null');
  // `noUncheckedIndexedAccess` 让 `nonNull[0]` 带 undefined；此处已由
  // `nonNull.length > 0` 分支保证非空，但索引仍需显式守卫。
  const first = nonNull[0];
  const core =
    first === undefined
      ? 'null'
      : nonNull.length > 1
        ? nonNull.map(singleTypeToTs).join(' & ')
        : singleTypeToTs(first);

  return nullable ? `${core} | null` : core;
}

function schemaTypes(schema: SchemaObject): SchemaTypeName[] {
  if (schema.type === undefined) {
    return [];
  }
  return typeof schema.type === 'string' ? [schema.type] : [...schema.type];
}

function singleTypeToTs(type: SchemaTypeName): string {
  switch (type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return 'readonly unknown[]';
    case 'object':
      return 'Readonly<Record<string, unknown>>';
  }
}

/** 对象 schema → TS 对象字面量类型；带 `properties` 时逐字段展开。 */
function objectToTs(schema: SchemaObject): string {
  const properties = schema.properties;
  if (properties === undefined || Object.keys(properties).length === 0) {
    return 'Readonly<Record<string, unknown>>';
  }

  const required = new Set(schema.required ?? []);
  const fields = Object.entries(properties).map(([name, propertySchema]) => {
    const optional = required.has(name) ? '' : '?';
    return `readonly ${propertyKey(name)}${optional}: ${typeOf(propertySchema)}`;
  });
  return `{ ${fields.join('; ')} }`;
}

/** 完整类型映射：处理 $ref / enum / object / array / oneOf / 标量。 */
function typeOf(schema: SchemaLike): string {
  if (isReferenceObject(schema)) {
    return schemaToTs(schema);
  }

  // oneOf（内容扩展字段的判别联合等）映射为联合类型。
  if (schema.oneOf !== undefined && schema.oneOf.length > 0) {
    return schema.oneOf.map((member) => typeOf(member)).join(' | ');
  }

  const types = schemaTypes(schema);
  const nullable = types.includes('null');
  const nonNull = types.filter((type) => type !== 'null');

  let core: string;
  const first = nonNull[0];

  if (first === undefined) {
    core = 'unknown';
  } else if (first === 'array') {
    core = `readonly ${schema.items === undefined ? 'unknown' : typeOf(schema.items)}[]`;
  } else if (first === 'object') {
    core = objectToTs(schema);
  } else {
    // 标量：enum / const 已在 schemaToTs 里处理，这里只兜底原始类型。
    const scalar = schemaToTs(schema);
    core = scalar === 'unknown' ? singleTypeToTs(first) : scalar;
  }

  return nullable ? `${core} | null` : core;
}

function propertyKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

// ---------------------------------------------------------------------------
// 组件 schema → type 声明
// ---------------------------------------------------------------------------

function renderSchemas(doc: OpenApiDocument): string {
  const lines: string[] = [];
  for (const [name, schema] of Object.entries(doc.components.schemas)) {
    lines.push(`export type ${name} = ${typeOf(schema)};`);
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// operation → 类型
// ---------------------------------------------------------------------------

function renderParameter(parameter: ParameterObject): string {
  const required = parameter.required === true ? 'true' : 'false';
  return (
    `{ readonly name: ${JSON.stringify(parameter.name)}; readonly in: ${JSON.stringify(parameter.in)}; ` +
    `readonly required: ${required}; readonly type: ${typeOf(parameter.schema)} }`
  );
}

function renderParameters(operation: OperationObject): string {
  const parameters = operation.parameters ?? [];
  if (parameters.length === 0) {
    return 'readonly []';
  }
  return `readonly [\n    ${parameters.map(renderParameter).join('\n    | ')}\n  ]`;
}

function renderResponses(operation: OperationObject): string {
  const entries = Object.entries(operation.responses);
  const success = entries.filter(([status]) => status.startsWith('2'));
  const errors = entries.filter(([status]) => !status.startsWith('2'));

  const successType = success[0]?.[1].content?.['application/json']?.schema;
  const successLine = successType === undefined ? 'undefined' : typeOf(successType);

  const errorLines = errors.map(([status, response]) => {
    const schema = response.content?.['application/json']?.schema;
    const rendered = schema === undefined ? 'never' : typeOf(schema);
    return `      readonly '${status}': ${rendered}`;
  });
  const errorBlock =
    errorLines.length === 0
      ? '    readonly errorResponses: Readonly<Record<string, never>>;'
      : `    readonly errorResponses: { ${errorLines.join('; ')} };`;

  return `    readonly response: ${successLine};\n${errorBlock}`;
}

function renderOperationMap(doc: OpenApiDocument): string {
  const entries: string[] = [];
  for (const { path, method, operation } of listOperations(doc)) {
    const securityKind =
      (operation.security ?? [{ bearerAuth: [] }]).length === 0 ? 'public' : 'bearer';
    const requestBody =
      operation.requestBody?.content['application/json']?.schema === undefined
        ? 'undefined'
        : typeOf(operation.requestBody.content['application/json']?.schema ?? {});

    entries.push(
      [
        `  /** ${method.toUpperCase()} ${path} */`,
        `  ${operation.operationId}: {`,
        `    readonly method: '${method.toUpperCase()}';`,
        `    readonly path: '${path}';`,
        `    readonly tags: readonly [${operation.tags.map((tag) => `'${tag}'`).join(', ')}];`,
        `    readonly security: '${securityKind}';`,
        `    readonly parameters: ${renderParameters(operation)};`,
        `    readonly requestBody: ${requestBody} | undefined;`,
        renderResponses(operation),
        '  };',
      ].join('\n'),
    );
  }
  return entries.join('\n');
}

function renderPathsConst(doc: OpenApiDocument): string {
  const byPath = new Map<string, HttpMethod[]>();
  for (const { path, method } of listOperations(doc)) {
    const existing = byPath.get(path);
    if (existing === undefined) {
      byPath.set(path, [method]);
    } else {
      existing.push(method);
    }
  }

  const entries = [...byPath.entries()].map(([path, methods]) => {
    const list = methods.map((method) => `'${method.toUpperCase()}'`).join(', ');
    return `  ${JSON.stringify(path)}: [${list}] as const,`;
  });

  return entries.join('\n');
}

// ---------------------------------------------------------------------------
// 组装
// ---------------------------------------------------------------------------

const GENERATED_HEADER = [
  '// AUTO-GENERATED — DO NOT EDIT',
  '//',
  '// 本文件由 `apps/api/scripts/generate-openapi.ts` 生成，不要手工编辑。',
  '// 重新生成：pnpm --filter @nanking-atlas/api openapi:generate',
  '// 规范来源：apps/api/src/openapi.ts',
  '//',
  '// 契约纪律（技术方案 §7.3 + AGENTS.md §6.3）：跨 app 的类型一律来自本文件；',
  '// web/admin 禁止自行复制 DTO 定义，也禁止 import apps/api 的内部模块。',
  '',
].join('\n');

function renderClient(doc: OpenApiDocument): string {
  return [
    GENERATED_HEADER,
    '/* eslint-disable */',
    '// 下面这一行把生成文件标记为非人工维护：lint / 格式问题请回到生成器修，不要改这里。',
    '',
    '/** 路径 → 该路径上已声明的 HTTP 方法（大写，可直接传给 `fetch`）。 */',
    'export const NLA_API_PATHS = {',
    renderPathsConst(doc),
    '} as const satisfies { readonly [P in NlaPath]: readonly NlaMethod[] };',
    '',
    renderSchemas(doc),
    '/** operationId → 方法 / 路径 / 参数 / 请求体 / 响应。 */',
    'export interface NlaOperationMap {',
    renderOperationMap(doc),
    '}',
    '',
    'export type NlaOperationId = keyof NlaOperationMap;',
    '',
    "export type NlaPath = NlaOperationMap[NlaOperationId]['path'];",
    '',
    "export type NlaMethod = NlaOperationMap[NlaOperationId]['method'];",
    '',
    '/** 指定路径上允许的方法联合。 */',
    'export type NlaMethodFor<P extends NlaPath> = (typeof NLA_API_PATHS)[P][number];',
    '',
    '/** 统一响应头名，所有响应都会带上。 */',
    `export const NLA_REQUEST_ID_HEADER = ${JSON.stringify(REQUEST_ID_HEADER_NAME)};`,
    '',
  ].join('\n');
}

/**
 * 产物必须与仓库 `format:check` 一致。
 *
 * 生成器直接调 prettier API（而不是让人再手动跑一次 `pnpm format`），否则
 * 第一次生成的文件会与 CI 的 format 检查不一致。用 `.prettierrc` 解析出的配置，
 * 保证仓库改风格时产物自动跟随。
 */
async function formatOutput(source: string, filepath: string): Promise<string> {
  const config = await resolveConfig(filepath);
  return format(source, { ...config, filepath });
}

async function main(): Promise<void> {
  const doc = openApiDocument;

  mkdirSync(dirname(OPENAPI_JSON_PATH), { recursive: true });
  mkdirSync(dirname(CLIENT_PATH), { recursive: true });

  const json = await formatOutput(`${JSON.stringify(doc, null, 2)}\n`, OPENAPI_JSON_PATH);
  writeFileSync(OPENAPI_JSON_PATH, json, 'utf8');

  const client = await formatOutput(renderClient(doc), CLIENT_PATH);
  writeFileSync(CLIENT_PATH, client, 'utf8');

  const operationCount = listOperations(doc).length;
  const schemaCount = Object.keys(doc.components.schemas).length;
  console.log(`[openapi] 规范已生成：${operationCount} 个 operation，${schemaCount} 个 schema。`);
  console.log(`[openapi]   -> ${OPENAPI_JSON_PATH}`);
  console.log(`[openapi]   -> ${CLIENT_PATH}`);
}

main().catch((error: unknown) => {
  console.error('[openapi] 生成失败：', error);
  process.exit(1);
});
