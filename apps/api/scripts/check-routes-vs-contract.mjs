/**
 * 开发期诊断脚本：比对「已实现的 Nest 路由」与「openapi.json 里声明的路径」。
 *
 * 为什么需要它：`openapi.spec.ts` 只断言 operation 数量下限，
 * **没有**逐一比对路径，所以「实现了但忘了写进契约」的端点不会被任何测试抓到。
 *
 * 用法：`node --experimental-strip-types scripts/check-routes-vs-contract.mjs`
 * （这里直接读源文件的装饰器文本，不启动 Nest —— 启动就意味着连数据库。）
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_ROOT = join(API_ROOT, 'src');

/** 收集所有 controller 装饰器声明的方法 + 路径。 */
function collectRoutes(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectRoutes(full));
      continue;
    }
    if (!entry.endsWith('.controller.ts')) {
      continue;
    }
    const src = readFileSync(full, 'utf8');
    const controllerBase = /@Controller\(\s*'([^']*)'\s*\)/.exec(src)?.[1] ?? '';
    const methodPattern = /@(Get|Post|Patch|Put|Delete)\(\s*'([^']*)'/g;
    let match;
    while ((match = methodPattern.exec(src)) !== null) {
      const method = match[1].toUpperCase();
      const rawPath = match[2];
      const joined = controllerBase === '' ? rawPath : `${controllerBase}/${rawPath}`;
      // Nest 的 `:id` → OpenAPI 的 `{id}`
      const normalized = joined.replace(/:([A-Za-z]+)/g, (_all, name) => `{${name}}`);
      // 空控制器（`@Controller()`）的路由本身不带前缀
      const withPrefix = normalized.startsWith('/') ? normalized : `/${normalized}`;
      found.push({
        method,
        openapiPath: withPrefix === '/' ? '/api/v1' : `/api/v1${withPrefix}`,
        file: entry,
      });
    }
  }
  return found;
}

/** 公开端点不带 `/api/v1` 前缀（技术方案 §7.2 与 main.ts 的 exclude 一致）。 */
function toContractPath(route) {
  if (route.openapiPath.startsWith('/api/v1/health')) {
    return route.openapiPath.replace('/api/v1', '');
  }
  return route.openapiPath;
}

const routes = collectRoutes(SRC_ROOT);
const contract = JSON.parse(readFileSync(join(API_ROOT, 'openapi.json'), 'utf8'));
const contractPaths = new Set(Object.keys(contract.paths ?? {}));

const missing = routes
  .map((route) => ({ ...route, contractPath: toContractPath(route) }))
  .filter((route) => !contractPaths.has(route.contractPath));

if (missing.length === 0) {
  console.log(`[routes] 全部 ${routes.length} 条已实现路由都在契约里声明。`);
  process.exit(0);
}

console.warn(`[routes] 以下 ${missing.length} 条路由已实现但未写入 openapi.json：`);
for (const route of missing) {
  console.warn(`  ${route.method.padEnd(6)} ${route.contractPath}   (${route.file})`);
}
console.warn('[routes] 这些端点没有契约类型，前端只能手写 DTO —— 请补进 src/openapi.ts。');
process.exit(1);
