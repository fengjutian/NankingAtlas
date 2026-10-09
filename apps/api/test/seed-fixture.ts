import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * 集成测试用的 seed 执行器。
 *
 * 刻意**跑真实的 `pnpm seed` 子进程**而不是复制一份 seed 逻辑：
 *   - 避免测试与实际 seed 行为漂移（复制品只测了复制品）
 *   - 真正验证 packages/database 的 Argon2id 参数与 apps/api 的
 *     `verifyPassword` 一致 —— 两处不一致时登录会失败，而这是跨包契约，
 *     纯函数测试抓不到
 *
 * DATABASE_URL 由 vitest.integration.config.ts 注入，会原样传给子进程，
 * 所以 seed 写的就是集成测试用的那个库。
 */

const REPO_ROOT = join(process.cwd(), '..', '..');

export function seedDatabase(): void {
  execFileSync('pnpm', ['--filter', '@nanking-atlas/database', 'seed'], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    shell: true,
    env: {
      ...process.env,
      // seed 内部用相对 schema.prisma 解析路径，这里给绝对路径最稳
      DATABASE_URL: process.env['DATABASE_URL'] ?? '',
    },
  });
}
