/**
 * 审计日志敏感字段脱敏（FD-006）。
 *
 * ## 为什么脱敏放在**写入侧**
 *
 * FD-006 明确要求「敏感字段在写入前脱敏，不能只在 UI 隐藏」。
 * 审计写入点散落在 15 处 service，靠"每个调用点自觉不写敏感字段"是不可靠的：
 * 迟早有人写 `afterJson: JSON.stringify(input)`，而 `input` 里就有 password。
 *
 * 与其逐点 review，不如让结构上不可能泄漏：本模块被 `lib/prisma.ts` 的
 * client extension 挂在 `auditLog.create` 上，**所有**写入路径（包括事务内
 * 的 `tx.auditLog.create`）都会经过它，无需改任何调用点。
 *
 * ## 脱敏规则
 *
 * - key 匹配敏感词（大小写不敏感，覆盖 `passwordHash` / `apiSecret` 这类变体）
 *   → 整个值替换成 `[REDACTED]`，**不保留长度线索**
 * - 递归处理嵌套对象与数组
 * - 非 JSON 字符串原样返回：脱敏绝不能把数据搞丢或改变其类型
 */

/** 敏感 key 判定。放在这里而不是内联，便于单测直接验证规则。 */
const SENSITIVE_KEY_PATTERN =
  /(password|passwd|token|secret|cookie|authorization|credential|privatekey|apikey)/i;

/** 递归深度上限，防止构造出超深对象把脱敏器自己搞爆栈。 */
const MAX_REDACT_DEPTH = 32;

/** 替换值。刻意不含任何长度信息 —— 长度本身也是信息。 */
export const REDACTED_PLACEHOLDER = '[REDACTED]';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_REDACT_DEPTH) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED_PLACEHOLDER
        : redactValue(nested, depth + 1);
    }
    return output;
  }
  return value;
}

/**
 * 脱敏一段 JSON 字符串。
 *
 * - `null` → `null`
 * - 合法 JSON → 递归脱敏后重新序列化
 * - 非法 JSON → **原样返回**。审计是只增不改的追溯记录，宁可留下原始文本，
 *   也不能因为"脱敏失败"而悄悄改写或丢弃它。
 */
export function redactAuditJson(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  return JSON.stringify(redactValue(parsed, 0));
}
