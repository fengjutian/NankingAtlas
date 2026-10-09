import argon2 from 'argon2';

/**
 * Argon2id 密码哈希。
 *
 * 选型依据：docs/TECHNICAL_IMPLEMENTATION.md §8「密码使用 Argon2id」。
 *
 * 参数说明（OWASP 推荐基线的保守取值）：
 *   - memoryCost 19456 KiB (19 MiB)：OWASP 建议 ≥ 19 MiB，满足 Argon2id m=19 KiB 的要求
 *   - timeCost 2：OWASP 建议 ≥ 2
 *   - parallelism 1：单请求不额外占用多核，避免登录风暴时放大 CPU 消耗
 *
 * 这些值是可调的安全/性能权衡点；调整会让旧 hash 无法用新参数验证，
 * 因此必须与 `verifyPassword` 的 dummyHash 保持同步（见下方注释）。
 */

/** Argon2id 参数。改动任一项都必须同步更新 DUMMY_HASH。 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * 用于"用户不存在"时的等时验证，避免通过响应时间区分
 * 「邮箱不存在」与「密码错误」，防止账号枚举。
 *
 * 这个 hash 是用上面参数对固定随机串跑一次得到的；只要 ARGON2_OPTIONS
 * 变了就必须重新生成（可用 `generateDummyHash()` 在本地打印）。
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$jv0e8DA3P699lrRPD/DKOw$ysGvkk7GKnR2/KYFJegkAfvkQGsmIJ9E5UZOXhm9H10';

/** 最长密码字节数（不是字符数）——Argon2 本身对超长输入有 DoS 风险。 */
const MAX_PASSWORD_BYTES = 1024;
/** 最短密码字符数。 */
const MIN_PASSWORD_LENGTH = 12;

/**
 * 密码复杂度校验。
 *
 * 明确不强制"必须混合大小写+数字+符号"这类组合规则（现代指南倾向长度优先），
 * 但要求最低长度并拒绝纯空白。
 */
export function assertPasswordAcceptable(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`密码至少需要 ${String(MIN_PASSWORD_LENGTH)} 个字符`);
  }
  if (password.trim().length === 0) {
    throw new Error('密码不能为空白');
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new Error(`密码不能超过 ${String(MAX_PASSWORD_BYTES)} 字节`);
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordAcceptable(password);
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * 校验密码。
 *
 * - hash 不存在时也执行一次 verify（用 DUMMY_HASH）以拉平响应时间。
 * - argon2.verify 抛错一律当作"密码错误"返回 false，不泄露内部细节。
 */
export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  if (hash === null) {
    try {
      await argon2.verify(DUMMY_HASH, password, ARGON2_OPTIONS);
    } catch {
      // dummy hash 与 password 不匹配是预期结果；吞掉只是为了走完等时路径。
    }
    return false;
  }

  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** 生成本地 DUMMY_HASH 用（ADMIN 手动跑；不要在生产调用）。 */
export async function generateDummyHash(): Promise<string> {
  return argon2.hash(`dummy-${Date.now().toString(36)}`, ARGON2_OPTIONS);
}