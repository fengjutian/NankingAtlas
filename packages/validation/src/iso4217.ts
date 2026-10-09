import { z } from 'zod';

/**
 * 请求 ID / 审计 ID 等通用字符串的最小约束。
 * 与 TECHNICAL_IMPLEMENTATION §7.1 的 requestId 约定一致。
 */
export const requestIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/u, {
    message: 'requestId 只能包含 ASCII 字母、数字、连字符与下划线',
  });

export type RequestId = z.infer<typeof requestIdSchema>;
