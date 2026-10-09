import { SetMetadata } from '@nestjs/common';

/**
 * RBAC 元数据键。
 *
 * 与 `RolesGuard` 配对：控制器上声明"需要哪些角色"，守卫强制校验。
 * 前端隐藏按钮只是体验优化，这里才是真正的授权边界
 * （AGENTS.md §4.1 「禁止只靠隐藏按钮」）。
 */

export const ROLES_METADATA_KEY = 'nla:required_roles' as const;

/** 声明访问该端点所需的全部角色（任一满足即可）。 */
export const RequireRoles = (...roles: readonly string[]) => SetMetadata(ROLES_METADATA_KEY, roles);

/** 公开端点标记；`AuthGuard` 遇到它直接放行。 */
export const IS_PUBLIC_KEY = 'nla:is_public' as const;
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
