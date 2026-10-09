/**
 * OpenAPI breaking-change 检查（P1-11，技术方案 §7.3）。
 *
 * 对比 `apps/api/openapi.json`（当前规范）与 `openapi/baseline.json`（已发布基线），
 * 发现破坏性变更就 exit 1 并逐条列出。
 *
 * ## 为什么自己写而不是装 openapi-diff / spectral
 *
 * AGENTS.md §6.5：新依赖必须说明用途并检查维护性与许可。本仓库只需要 5 类规则
 * （删除、必填化、请求体收窄、响应字段变化、放宽校验不算破坏），
 * 约 150 行确定性代码即可覆盖，且不引入运行时/构建期的新供应链面。
 *
 * ## 判定语义（面向客户端，而非面向文档）
 *
 * breaking = 已发布的客户端按旧契约写的代码会**编译失败或运行时出错**。
 * 因此：
 * - 删除 path / operation / 响应码 → breaking
 * - 可选参数变必填、新增必填参数 → breaking
 * - 请求体字段变必填、字段删除、enum 删值、约束收紧 → breaking
 * - 响应字段删除、变必填、类型变更 → breaking
 * - 新增 path/operation/可选参数/响应码、约束放宽 → **不算** breaking
 *
 * 用法：
 *   pnpm --filter @nanking-atlas/api openapi:check-breaking
 *   pnpm --filter @nanking-atlas/api openapi:check-breaking --update
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const API_ROOT = process.cwd();
const REPO_ROOT = resolve(API_ROOT, '..', '..');

const CURRENT_PATH = resolve(API_ROOT, 'openapi.json');
const BASELINE_PATH = resolve(REPO_ROOT, 'openapi/baseline.json');

const UPDATE_FLAG = '--update';

// ---------------------------------------------------------------------------
// 最小 JSON 读取工具
//
// 基线与当前规范都按 `unknown` 读入，用类型守卫逐步收窄，全程不出现 `any`。
// ---------------------------------------------------------------------------

type JsonObject = Readonly<Record<string, unknown>>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** 读取 JSON 文件；损坏时抛出带路径的错误，而不是静默当成空文档。 */
function readJson(filePath: string): unknown {
  const raw = readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${filePath} 不是合法 JSON：${message}`);
  }
}

// ---------------------------------------------------------------------------
// $ref 解析
// ---------------------------------------------------------------------------

const SCHEMA_REF_PREFIX = '#/components/schemas/';

/** 引用展开跳数上限：只防御自引用 schema，不限制结构嵌套层数。 */
const MAX_REF_HOPS = 8;

/**
 * 深度展开所有 `$ref`，返回纯结构对象。
 *
 * 必须在比较前展开，否则会漏掉两类变更：
 * 1. 变更藏在被引用组件内部（`$ref -> ContentPublic`）；
 * 2. 变更藏在数组元素或 oneOf 分支里（`items` / `oneOf` 不走 properties 比较）。
 *
 * 展开后两侧都是同构的普通对象，比较逻辑只剩一套，不需要在每处判断 `$ref`。
 *
 * `refHops` 只在跟随 `$ref` 时递增 —— 文档本身的嵌套很深（paths → operation →
 * responses → content → schema），若把结构层数也算进去会在真正展开前就触顶。
 */
function deepResolve(value: unknown, document: JsonObject, refHops = 0): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => deepResolve(item, document, refHops));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const node = value as JsonObject;
  const ref = node.$ref;
  if (typeof ref === 'string' && ref.startsWith(SCHEMA_REF_PREFIX)) {
    if (refHops >= MAX_REF_HOPS) {
      return node;
    }
    const name = ref.slice(SCHEMA_REF_PREFIX.length);
    const schemas = asObject(asObject(document.components).schemas);
    const target = schemas[name];
    if (target === undefined) {
      return node;
    }
    return deepResolve(target, document, refHops + 1);
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(node)) {
    result[key] = deepResolve(child, document, refHops);
  }
  return result;
}

// ---------------------------------------------------------------------------
// 差异累积
// ---------------------------------------------------------------------------

interface Difference {
  readonly rule: string;
  readonly location: string;
  readonly message: string;
}

class DiffCollector {
  private readonly items: Difference[] = [];

  add(rule: string, location: string, message: string): void {
    this.items.push({ rule, location, message });
  }

  get list(): readonly Difference[] {
    return this.items;
  }
}

// ---------------------------------------------------------------------------
// 参数比较
// ---------------------------------------------------------------------------

interface NormalizedParameter {
  readonly name: string;
  readonly location: string;
  readonly required: boolean;
  readonly schema: JsonObject;
}

function normalizeParameters(value: unknown): NormalizedParameter[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: NormalizedParameter[] = [];
  for (const entry of value) {
    const param = asObject(entry);
    const name = param.name;
    const location = param.in;
    if (typeof name !== 'string' || typeof location !== 'string') {
      continue;
    }
    result.push({
      name,
      location,
      required: param.required === true,
      schema: asObject(param.schema),
    });
  }
  return result;
}

function compareParameters(
  baseline: readonly NormalizedParameter[],
  current: readonly NormalizedParameter[],
  location: string,
  diff: DiffCollector,
): void {
  for (const before of baseline) {
    const after = current.find(
      (item) => item.name === before.name && item.location === before.location,
    );
    if (after === undefined) {
      diff.add(
        'PARAM_REMOVED',
        location,
        `参数 ${before.location} "${before.name}" 被删除：已发布的客户端仍会发送该参数。`,
      );
      continue;
    }
    if (!before.required && after.required) {
      diff.add(
        'PARAM_NOW_REQUIRED',
        location,
        `参数 ${before.location} "${before.name}" 从可选变为必填：旧客户端不传会失败。`,
      );
    }
    compareSchema(before.schema, after.schema, `${location} 参数 ${before.name}`, diff, 'request');
  }

  for (const after of current) {
    const existed = baseline.some(
      (item) => item.name === after.name && item.location === after.location,
    );
    if (existed) {
      continue;
    }
    if (after.required) {
      diff.add(
        'PARAM_ADDED_REQUIRED',
        location,
        `新增必填参数 ${after.location} "${after.name}"：旧客户端不会发送该参数。`,
      );
    }
    // 新增可选参数不算 breaking。
  }
}

// ---------------------------------------------------------------------------
// schema 比较（请求方向 / 响应方向）
// ---------------------------------------------------------------------------

function compareSchema(
  baseline: JsonObject,
  current: JsonObject,
  location: string,
  diff: DiffCollector,
  direction: 'request' | 'response',
): void {
  const beforeTypes = asStringArray(baseline.type);
  const afterTypes = asStringArray(current.type);
  if (beforeTypes.length > 0 && afterTypes.length > 0) {
    const removedType = beforeTypes.find((item) => !afterTypes.includes(item));
    if (removedType !== undefined) {
      diff.add(
        'TYPE_CHANGED',
        location,
        direction === 'response'
          ? `响应类型从 ${beforeTypes.join('|')} 变为 ${afterTypes.join('|')}：客户端读取方式失效。`
          : `请求类型从 ${beforeTypes.join('|')} 变为 ${afterTypes.join('|')}。`,
      );
    }
  }

  compareEnum(baseline, current, location, diff, direction);
  compareBounds(baseline, current, location, diff, direction);
  comparePattern(baseline, current, location, diff);
  compareProperties(baseline, current, location, diff, direction);
  compareItems(baseline, current, location, diff, direction);
  compareVariants(baseline, current, location, diff, direction);
}

/** 数组元素 schema：列表响应里的字段变更必须能被看到。 */
function compareItems(
  baseline: JsonObject,
  current: JsonObject,
  location: string,
  diff: DiffCollector,
  direction: 'request' | 'response',
): void {
  const before = baseline.items;
  const after = current.items;
  if (before === undefined || after === undefined) {
    return;
  }
  compareSchema(asObject(before), asObject(after), `${location}[]`, diff, direction);
}

/**
 * oneOf 分支（内容扩展字段的判别联合）。
 *
 * - 分支内容变化：逐分支递归比较；
 * - 分支数量减少：请求方向算 breaking（客户端还在发已被删除的判别值），
 *   响应方向不算（服务端不再产出该形状，客户端只是见不到）。
 * - 分支数量增加：不算 breaking。
 */
function compareVariants(
  baseline: JsonObject,
  current: JsonObject,
  location: string,
  diff: DiffCollector,
  direction: 'request' | 'response',
): void {
  const before = Array.isArray(baseline.oneOf) ? (baseline.oneOf as unknown[]) : [];
  const after = Array.isArray(current.oneOf) ? (current.oneOf as unknown[]) : [];
  if (before.length === 0 || after.length === 0) {
    return;
  }

  for (const [index, beforeVariant] of before.entries()) {
    const afterVariant = after[index];
    if (afterVariant === undefined) {
      if (direction === 'request') {
        diff.add(
          'VARIANT_REMOVED',
          `${location} oneOf[${String(index)}]`,
          `oneOf 分支被删除：客户端仍会发送该判别值。`,
        );
      }
      continue;
    }
    compareSchema(
      asObject(beforeVariant),
      asObject(afterVariant),
      `${location} oneOf[${String(index)}]`,
      diff,
      direction,
    );
  }
}

function compareEnum(
  baseline: JsonObject,
  current: JsonObject,
  location: string,
  diff: DiffCollector,
  direction: 'request' | 'response',
): void {
  const before = asStringArray(baseline.enum);
  const after = asStringArray(current.enum);
  if (before.length === 0) {
    return;
  }
  // 两侧都是"取值减少 = breaking"：
  //   请求侧：客户端发送的合法值被拒绝；
  //   响应侧：客户端可能收到没处理过的值。
  // 新增取值不算 breaking。
  const removed = before.filter((item) => !after.includes(item));
  if (removed.length > 0) {
    diff.add(
      'ENUM_VALUE_REMOVED',
      location,
      direction === 'response'
        ? `响应枚举删除了取值 ${removed.join(', ')}。`
        : `请求枚举删除了取值 ${removed.join(', ')}：旧客户端仍会发送这些值。`,
    );
  }
}

/** 数值/长度边界：请求侧收紧与响应侧放宽都算 breaking。 */
function compareBounds(
  baseline: JsonObject,
  current: JsonObject,
  location: string,
  diff: DiffCollector,
  direction: 'request' | 'response',
): void {
  const numericKeys = ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems'] as const;
  const side = direction === 'request' ? '请求' : '响应';

  for (const key of numericKeys) {
    const before = baseline[key];
    const after = current[key];
    if (typeof before !== 'number' || typeof after !== 'number' || before === after) {
      continue;
    }

    if (key === 'minimum' || key === 'minLength' || key === 'minItems') {
      if (after > before) {
        diff.add(
          'CONSTRAINT_TIGHTENED',
          location,
          `${side}约束收紧：${key} 从 ${before} 提高到 ${after}。`,
        );
      }
      continue;
    }

    // maximum / maxLength 变小 = 收窄。
    if (after < before) {
      diff.add(
        'CONSTRAINT_TIGHTENED',
        location,
        `${side}约束收紧：${key} 从 ${before} 收紧到 ${after}。`,
      );
    }
  }
}

function comparePattern(
  baseline: JsonObject,
  current: JsonObject,
  location: string,
  diff: DiffCollector,
): void {
  const before = baseline.pattern;
  const after = current.pattern;
  if (typeof before !== 'string' || typeof after !== 'string' || before === after) {
    return;
  }

  // `.*` 代表"任意字符"；去掉它一定更严格，加上它一定更宽松。
  if (before.includes('.*') && !after.includes('.*')) {
    diff.add('PATTERN_TIGHTENED', location, `校验 pattern 收紧："${before}" -> "${after}"。`);
    return;
  }
  if (!before.includes('.*') && after.includes('.*')) {
    return;
  }
  diff.add('PATTERN_CHANGED', location, `校验 pattern 变更："${before}" -> "${after}"。`);
}

function compareProperties(
  baseline: JsonObject,
  current: JsonObject,
  location: string,
  diff: DiffCollector,
  direction: 'request' | 'response',
): void {
  const beforeProps = asObject(baseline.properties);
  const afterProps = asObject(current.properties);
  const beforeRequired = new Set(asStringArray(baseline.required));
  const afterRequired = new Set(asStringArray(current.required));

  for (const [name, beforeSchema] of Object.entries(beforeProps)) {
    const afterSchema = afterProps[name];
    if (afterSchema === undefined) {
      diff.add(
        'FIELD_REMOVED',
        `${location}.${name}`,
        direction === 'response'
          ? `响应字段 "${name}" 被删除：客户端读取它的代码会失效。`
          : `请求字段 "${name}" 被删除：旧客户端仍在发送该字段。`,
      );
      continue;
    }

    if (!beforeRequired.has(name) && afterRequired.has(name)) {
      diff.add(
        'FIELD_NOW_REQUIRED',
        `${location}.${name}`,
        direction === 'response'
          ? `响应字段 "${name}" 从可选变为必填：客户端需处理 undefined。`
          : `请求字段 "${name}" 从可选变为必填：旧客户端不传会校验失败。`,
      );
    }

    compareSchema(
      asObject(beforeSchema),
      asObject(afterSchema),
      `${location}.${name}`,
      diff,
      direction,
    );
  }

  for (const name of Object.keys(afterProps)) {
    if (Object.prototype.hasOwnProperty.call(beforeProps, name)) {
      continue;
    }
    if (afterRequired.has(name)) {
      diff.add(
        'FIELD_ADDED_REQUIRED',
        `${location}.${name}`,
        direction === 'response'
          ? `响应新增必填字段 "${name}"。`
          : `请求新增必填字段 "${name}"：旧客户端不会发送该字段。`,
      );
    }
    // 请求/响应新增可选字段都不算 breaking。
  }
}

// ---------------------------------------------------------------------------
// operation / path 比较
// ---------------------------------------------------------------------------

const HTTP_METHOD_KEYS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** 取出 `content["application/json"].schema`；请求体与响应体结构一致，共用一个提取器。 */
function jsonSchemaOf(container: unknown): JsonObject | null {
  const content = asObject(asObject(container).content);
  const schema = asObject(content['application/json']).schema;
  return schema === undefined ? null : asObject(schema);
}

function compareResponses(
  baselineOperation: JsonObject,
  currentOperation: JsonObject,
  location: string,
  diff: DiffCollector,
): void {
  const before = asObject(baselineOperation.responses);
  const after = asObject(currentOperation.responses);

  for (const [status, beforeResponse] of Object.entries(before)) {
    const afterResponse = after[status];
    if (afterResponse === undefined) {
      diff.add(
        'RESPONSE_REMOVED',
        `${location} ${status}`,
        `响应码 ${status} 被删除：依赖该状态码的客户端分支会失效。`,
      );
      continue;
    }

    const beforeSchema = jsonSchemaOf(beforeResponse);
    const afterSchema = jsonSchemaOf(afterResponse);
    if (beforeSchema === null || afterSchema === null) {
      continue;
    }

    compareSchema(beforeSchema, afterSchema, `${location} ${status}`, diff, 'response');
  }

  // 新增响应码不算 breaking。
}

function compareRequestBody(
  baselineOperation: JsonObject,
  currentOperation: JsonObject,
  location: string,
  diff: DiffCollector,
): void {
  const before = asObject(baselineOperation.requestBody);
  const after = asObject(currentOperation.requestBody);
  const beforeSchema = jsonSchemaOf(before);
  const afterSchema = jsonSchemaOf(after);

  if (beforeSchema === null && afterSchema === null) {
    return;
  }
  if (beforeSchema === null) {
    if (after.required === true) {
      diff.add('REQUEST_BODY_ADDED_REQUIRED', location, '新增必填请求体：旧客户端不会发送。');
    }
    return;
  }
  if (afterSchema === null) {
    diff.add('REQUEST_BODY_REMOVED', location, '请求体被删除，但基线中存在。');
    return;
  }

  compareSchema(beforeSchema, afterSchema, `${location} body`, diff, 'request');
}

function compareOperations(
  baselinePathItem: JsonObject,
  currentPathItem: JsonObject,
  path: string,
  diff: DiffCollector,
): void {
  for (const method of HTTP_METHOD_KEYS) {
    const beforeOperation = baselinePathItem[method];
    const afterOperation = currentPathItem[method];
    const location = `${method.toUpperCase()} ${path}`;

    if (beforeOperation === undefined) {
      continue; // 新增 operation：不算 breaking。
    }
    if (afterOperation === undefined) {
      diff.add('OPERATION_REMOVED', location, `operation 被删除：${location} 不再存在。`);
      continue;
    }

    const beforeObj = asObject(beforeOperation);
    const afterObj = asObject(afterOperation);

    compareParameters(
      normalizeParameters(beforeObj.parameters),
      normalizeParameters(afterObj.parameters),
      location,
      diff,
    );
    compareRequestBody(beforeObj, afterObj, location, diff);
    compareResponses(beforeObj, afterObj, location, diff);
  }
}

/**
 * 比较基线与当前规范。
 *
 * 两侧先整体展开 `$ref`，之后所有比较都在同构的普通对象上进行。
 */
function compareDocuments(baselineDoc: JsonObject, currentDoc: JsonObject): readonly Difference[] {
  const diff = new DiffCollector();
  const beforeResolved = asObject(deepResolve(baselineDoc, baselineDoc));
  const afterResolved = asObject(deepResolve(currentDoc, currentDoc));
  const beforePaths = asObject(beforeResolved.paths);
  const afterPaths = asObject(afterResolved.paths);

  for (const [path, beforePathItem] of Object.entries(beforePaths)) {
    const afterPathItem = afterPaths[path];
    if (afterPathItem === undefined) {
      diff.add('PATH_REMOVED', path, `路径被删除：${path} 不再存在。`);
      continue;
    }
    compareOperations(asObject(beforePathItem), asObject(afterPathItem), path, diff);
  }

  // 新增 path 不算 breaking。
  return diff.list;
}

// ---------------------------------------------------------------------------
// 报告
// ---------------------------------------------------------------------------

const RULE_EXPLANATIONS: Readonly<Record<string, string>> = {
  PATH_REMOVED: '删除整条路径',
  OPERATION_REMOVED: '删除 operation（方法）',
  PARAM_REMOVED: '删除已有参数',
  PARAM_ADDED_REQUIRED: '新增必填参数',
  PARAM_NOW_REQUIRED: '可选参数变必填',
  REQUEST_BODY_ADDED_REQUIRED: '新增必填请求体',
  REQUEST_BODY_REMOVED: '删除请求体',
  FIELD_REMOVED: '删除字段',
  FIELD_ADDED_REQUIRED: '新增必填字段',
  FIELD_NOW_REQUIRED: '可选字段变必填',
  ENUM_VALUE_REMOVED: '枚举删除取值',
  CONSTRAINT_TIGHTENED: '校验约束收紧',
  PATTERN_TIGHTENED: 'pattern 收紧',
  PATTERN_CHANGED: 'pattern 变更',
  TYPE_CHANGED: '类型变更',
  RESPONSE_REMOVED: '删除响应码',
  VARIANT_REMOVED: '删除 oneOf 分支',
};

function renderReport(differences: readonly Difference[]): string {
  const lines: string[] = ['', `检测到 ${String(differences.length)} 处 breaking change：`, ''];

  for (const [index, item] of differences.entries()) {
    lines.push(`${String(index + 1)}. [${item.rule}] ${item.location}`);
    lines.push(`   ${RULE_EXPLANATIONS[item.rule] ?? item.rule}`);
    lines.push(`   ${item.message}`);
  }

  lines.push('');
  lines.push('修复方式：保持向后兼容；或在确认可以破坏后执行');
  lines.push('  pnpm --filter @nanking-atlas/api openapi:check-breaking --update');
  lines.push('并把 openapi/baseline.json 的变更写进 PR 说明。');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 基线直接复制当前规范文件，而不是重新序列化一遍。
 *
 * 好处有两个：基线与 `apps/api/openapi.json` 字节一致（不会因为格式化规则
 * 不同产生无意义 diff），且基线已经过 prettier 处理，`pnpm format:check` 不会红。
 */
function writeBaseline(): void {
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  copyFileSync(CURRENT_PATH, BASELINE_PATH);
}

function main(): void {
  const shouldUpdate = process.argv.slice(2).includes(UPDATE_FLAG);

  if (!existsSync(CURRENT_PATH)) {
    console.error(`[openapi] 找不到当前规范 ${CURRENT_PATH}，请先运行 openapi:generate。`);
    process.exit(1);
  }

  const currentDoc = readJson(CURRENT_PATH);

  if (!existsSync(BASELINE_PATH)) {
    if (shouldUpdate) {
      writeBaseline();
      console.log(`[openapi] 基线已写入 ${BASELINE_PATH}`);
      return;
    }
    console.log(
      [
        `[openapi] 未找到基线 ${BASELINE_PATH}。`,
        '首次引入时属正常情况，跳过检查（exit 0）。',
        '如需建立基线，请运行：',
        '  pnpm --filter @nanking-atlas/api openapi:check-breaking --update',
      ].join('\n'),
    );
    return;
  }

  const baselineDoc = readJson(BASELINE_PATH);

  if (shouldUpdate) {
    const breaking = compareDocuments(asObject(baselineDoc), asObject(currentDoc));
    writeBaseline();
    console.log(
      [
        `[openapi] 基线已更新为当前规范：${BASELINE_PATH}`,
        // 这里只统计 breaking 级别的差异，不是全部变更数；非破坏性变更不进这个列表。
        ...(breaking.length === 0
          ? ['[openapi] 相对旧基线没有 breaking change，本次更新只是新增或放宽。']
          : [
              `[openapi] 注意：接受了 ${String(breaking.length)} 处原本的 breaking change：`,
              renderReport(breaking),
            ]),
      ].join('\n'),
    );
    return;
  }

  const differences = compareDocuments(asObject(baselineDoc), asObject(currentDoc));

  if (differences.length === 0) {
    console.log('[openapi] 未检测到 breaking change（与基线一致）。');
    return;
  }

  console.error(renderReport(differences));
  process.exit(1);
}

main();
