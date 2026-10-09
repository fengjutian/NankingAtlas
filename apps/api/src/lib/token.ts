import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { env } from './env.js';

/**
 * Token 基础设施：短期 access token（HMAC-SHA256 自签 JWT）+ 旋转式 refresh token。
 *
 * 设计依据：docs/TECHNICAL_IMPLEMENTATION.md §8
 *   「管理后台优先使用服务端签发的短期 access token 加旋转 refresh token；
 *     refresh token 只放 HttpOnly + Secure + SameSite Cookie，
 *     并存储哈希与撤销状态。」
 *
 * 这里不引入第三方 JWT 库：access token 只有服务端校验，claims 极少，
 * 手写 HS256 可避免依赖面扩大，且能精确控制 payload 字段。
 */

// ---------------------------------------------------------------------------
// Access token（HS256 JWT）
// ---------------------------------------------------------------------------

export interface AccessTokenClaims {
  /** 用户 id */
  sub: string;
  /** 角色列表 */
  roles: readonly string[];
  /** 签发时间（epoch 秒） */
  iat: number;
  /** 过期时间（epoch 秒） */
  exp: number;
  /** JWT ID，用于将来做 access token 撤销列表 */
  jti: string;
}

const JWT_HEADER = { alg: 'HS256', typ: 'JWT' } as const;

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string): Buffer {
  return createHash('sha256').update(env.AUTH_ACCESS_SECRET).update(data).digest();
}

/** HMAC-SHA256 签名；返回 base64url 片段。 */
function hmac(data: string): string {
  return sign(data).toString('base64url');
}

export function issueAccessToken(params: {
  userId: string;
  roles: readonly string[];
  now?: Date;
}): { token: string; claims: AccessTokenClaims } {
  const nowSec = Math.floor((params.now ?? new Date()).getTime() / 1000);
  const claims: AccessTokenClaims = {
    sub: params.userId,
    roles: params.roles,
    iat: nowSec,
    exp: nowSec + env.AUTH_ACCESS_TTL_SECONDS,
    jti: randomBytes(12).toString('base64url'),
  };
  const headerPart = base64UrlEncode(JSON.stringify(JWT_HEADER));
  const payloadPart = base64UrlEncode(JSON.stringify(claims));
  const signature = hmac(`${headerPart}.${payloadPart}`);
  return { token: `${headerPart}.${payloadPart}.${signature}`, claims };
}

export type VerifyAccessTokenResult =
  | { ok: true; claims: AccessTokenClaims }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

/**
 * 校验 access token。
 *
 * 顺序刻意是：先结构 → 再签名（timingSafeEqual）→ 最后过期。
 * 签名不过就直接失败，不做任何 claims 解释。
 */
export function verifyAccessToken(token: string, now: Date = new Date()): VerifyAccessTokenResult {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, reason: 'malformed' };
  }
  const [headerPart, payloadPart, signaturePart] = parts;
  if (
    headerPart === undefined ||
    payloadPart === undefined ||
    signaturePart === undefined ||
    headerPart.length === 0 ||
    payloadPart.length === 0 ||
    signaturePart.length === 0
  ) {
    return { ok: false, reason: 'malformed' };
  }

  const expected = Buffer.from(hmac(`${headerPart}.${payloadPart}`), 'base64url');
  const actual = Buffer.from(signaturePart, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let claims: AccessTokenClaims;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    claims = parseClaims(decoded);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const nowSec = Math.floor(now.getTime() / 1000);
  if (claims.exp <= nowSec) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, claims };
}

function parseClaims(value: unknown): AccessTokenClaims {
  if (typeof value !== 'object' || value === null) {
    throw new Error('claims must be object');
  }
  const rec = value as Record<string, unknown>;
  const sub = rec.sub;
  const roles = rec.roles;
  const iat = rec.iat;
  const exp = rec.exp;
  const jti = rec.jti;
  if (
    typeof sub !== 'string' ||
    !Array.isArray(roles) ||
    roles.some((role) => typeof role !== 'string') ||
    typeof iat !== 'number' ||
    typeof exp !== 'number' ||
    typeof jti !== 'string'
  ) {
    throw new Error('claims shape invalid');
  }
  return { sub, roles: roles as string[], iat, exp, jti };
}

// ---------------------------------------------------------------------------
// Refresh token（opaque，仅存哈希）
// ---------------------------------------------------------------------------

/** refresh token 字节数；32 字节 = 256 bit，足够随机。 */
const REFRESH_TOKEN_BYTES = 32;

/** refresh token 长度上限（base64url 编码后），用于输入校验。 */
export const REFRESH_TOKEN_MAX_LENGTH = 128;

/**
 * 生成新的 refresh token 明文。
 *
 * 返回的明文只在这一刻存在：立刻写入 HttpOnly Cookie，数据库里只存 sha256 哈希。
 * 明文泄露（DB 被拖走）也无法反推出可用 token。
 */
export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

/** refresh token → sha256 hex；入库值。 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** 常量时间比较两个 hex 哈希，避免哈希比对引入时序侧信道。 */
export function constantTimeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// IP 匿名化（审计日志用）
// ---------------------------------------------------------------------------

/**
 * IP 哈希（审计日志 `ip_hash`）。
 *
 * 用 AUTH_ACCESS_SECRET 做 HMAC 而不是裸 sha256：裸哈希对 IPv4 只有 2^32
 * 种取值，直接哈希可被彩虹表反查；HMAC 需要 secret 才能反推。
 * 审计只需"同一 IP 是否相同"的等价性，不需要可逆。
 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(env.AUTH_ACCESS_SECRET).update('ip:').update(ip).digest('hex');
}
