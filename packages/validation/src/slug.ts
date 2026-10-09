import { z } from 'zod';

/**
 * 共享 slug 规则。AGENTS.md §5.3 + TECHNICAL_IMPLEMENTATION §5.3：
 * slug 必须小写 ASCII、数字与连字符，全局唯一；发布后变更须建 redirect 记录。
 *
 * 此处只校验"形式"（不查重），查重是 API 责任。
 */
export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, {
    message: 'slug 必须由小写 ASCII 字母、数字和单连字符组成，不能以连字符开头或结尾',
  });

export type Slug = z.infer<typeof slugSchema>;
