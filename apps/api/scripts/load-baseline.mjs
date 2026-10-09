/**
 * API 压测基线（P4-03）。
 *
 * 技术方案 §16：「性能 | Lighthouse；公开 API 和 bbox 搜索压测；
 * 指标以 staging 实测定基线」
 *
 * 不引入 k6/autocannon：技术方案没要求，且 AGENTS.md §6.5 要求新依赖说明理由。
 * Node 内置 fetch + 一个简单的并发驱动器足够拿到 P50/P95/P99 基线。
 *
 * 用法（服务需已在运行）：
 *   node scripts/load-baseline.mjs http://localhost:4000
 *
 * 输出为 JSON，便于 CI 归档与后续对比（性能回归靠趋势，不靠单次绝对值）。
 */

/**
 * @typedef {Object} LoadResult
 * @property {string} name
 * @property {number} count
 * @property {number} concurrency
 * @property {number} totalMs
 * @property {number} rps
 * @property {{min:number,p50:number,p95:number,p99:number,max:number,avg:number}} latencyMs
 * @property {number} errors
 */

/** @type {number} */
const WARMUP = Number(process.env['LOAD_WARMUP'] ?? 5);
/** @type {number} */
const REQUESTS = Number(process.env['LOAD_REQUESTS'] ?? 100);
/** @type {number} */
const CONCURRENCY = Number(process.env['LOAD_CONCURRENCY'] ?? 10);

/**
 * 全局限流对压测的干扰。
 *
 * `@nestjs/throttler` 默认 120 次/分钟/IP。压测 5 个端点 × 100 次
 * = 500 请求，**必然**打满限流桶，于是所有请求变成 429 ——
 * 测出来的是"限流生效速度"，不是 API 性能。
 *
 * 正确做法：压测前把限流放到 staging 配置里临时调高，
 * 或用 `LOAD_SKIP_THROTTLE=1` 显式声明"本次测的是无压测限流的基线"。
 * 这里**不自动关闭限流**（那会让基线掩盖真实的生产行为），
 * 只在输出里标注。
 */
const ANTI_RATE_LIMIT_NOTE =
  '全局限流 120/min/IP 会主导结果；正式基线应在 staging 临时调高限流阈值后重跑。';

const base = process.argv[2] ?? 'http://localhost:4000';

/**
 * 跑一轮固定次数的请求，记录每次耗时。
 *
 * @param {string} name
 * @param {() => Promise<number>} requestFn 返回 HTTP 状态码
 * @param {number} total
 * @param {number} concurrency
 * @returns {Promise<LoadResult>}
 */
async function runLoad(name, requestFn, total, concurrency) {
  /** @type {number[]} */
  const latencies = [];
  let errors = 0;
  let throttled = 0;
  let cursor = 0;
  const started = Date.now();

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= total) return;
      const t0 = performance.now();
      try {
        const status = await requestFn();
        if (status === 'throttled') {
          // 限流：单独计数，不计入延迟统计
          throttled += 1;
        } else if (status >= 400) {
          errors += 1;
        }
      } catch {
        errors += 1;
      }
      latencies.push(performance.now() - t0);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
  const totalMs = Date.now() - started;

  latencies.sort((a, b) => a - b);
  const pick = (/** @type {number} */ p) =>
    latencies.length === 0
      ? 0
      : (latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0);

  return {
    name,
    count: total,
    concurrency,
    totalMs,
    rps: totalMs === 0 ? total : Math.round((total / totalMs) * 1000),
    latencyMs: {
      min: Math.round(latencies[0] ?? 0),
      p50: Math.round(pick(0.5)),
      p95: Math.round(pick(0.95)),
      p99: Math.round(pick(0.99)),
      max: Math.round(latencies[latencies.length - 1] ?? 0),
      avg:
        latencies.length === 0
          ? 0
          : Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    },
    errors,
    throttled,
  };
}

/** @param {string} path */
async function get(path) {
  const res = await fetch(`${base}${path}`);
  // 429 是限流，不是被测端点的性能问题 —— 单独计数并从延迟统计里剔除。
  // 否则 P99 会被"等待限流窗口"的请求主导。
  if (res.status === 429) return 'throttled';
  return res.status;
}

async function main() {
  // 先确认服务可达，避免把"连接失败"当成性能数据
  try {
    const health = await fetch(`${base}/health/live`);
    if (!health.ok) {
      console.error(`health check failed: HTTP ${String(health.status)}`);
      process.exitCode = 1;
      return;
    }
  } catch (error) {
    console.error(`cannot reach ${base}:`, error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  /** @type {LoadResult[]} */
  const results = [];

  // 1. 公开内容列表 —— 最热的读路径
  const listPath = '/api/v1/contents?limit=20';
  for (let i = 0; i < WARMUP; i += 1) await get(listPath);
  results.push(await runLoad('GET /api/v1/contents', () => get(listPath), REQUESTS, CONCURRENCY));

  // 2. bbox 查询 —— 地图拖动时的读路径，走 R*Tree
  const bboxPath = '/api/v1/places?bbox=118.60,31.90,119.00,32.20&limit=50';
  for (let i = 0; i < WARMUP; i += 1) await get(bboxPath);
  results.push(
    await runLoad('GET /api/v1/places?bbox=', () => get(bboxPath), REQUESTS, CONCURRENCY),
  );

  // 3. 搜索
  const searchPath = '/api/v1/search?q=' + encodeURIComponent('秦淮');
  for (let i = 0; i < WARMUP; i += 1) await get(searchPath);
  results.push(await runLoad('GET /api/v1/search', () => get(searchPath), REQUESTS, CONCURRENCY));

  // 4. 详情
  const detailPath = '/api/v1/contents/demo-topic-mv0zwxp2';
  for (let i = 0; i < WARMUP; i += 1) await get(detailPath);
  results.push(
    await runLoad('GET /api/v1/contents/{slug}', () => get(detailPath), REQUESTS, CONCURRENCY),
  );

  // 5. 健康检查 —— 探针路径必须足够轻
  for (let i = 0; i < WARMUP; i += 1) await get('/health/live');
  results.push(await runLoad('GET /health/live', () => get('/health/live'), REQUESTS, CONCURRENCY));

  const report = {
    base,
    at: new Date().toISOString(),
    node: process.version,
    config: { requests: REQUESTS, concurrency: CONCURRENCY, warmup: WARMUP },
    note: ANTI_RATE_LIMIT_NOTE,
    results,
  };
  console.log(JSON.stringify(report, null, 2));

  const throttledTotal = results.reduce((sum, r) => sum + r.throttled, 0);
  if (throttledTotal > 0) {
    console.error(
      `\n注意：${String(throttledTotal)} 次请求被全局限流拦截（429）。\n` +
        `这些请求的延迟不反映 API 性能。正式基线请在 staging 调高限流阈值后重跑。`,
    );
  }
  // 5xx 才算压测失败；429 是限流正常工作
  if (results.some((r) => r.errors > 0)) {
    console.error('\n存在 4xx/5xx 失败请求，压测基线不可信');
    process.exitCode = 1;
  }
}

await main();
