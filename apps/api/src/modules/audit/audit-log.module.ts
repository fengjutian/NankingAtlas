import { Module } from '@nestjs/common';

import { AuditLogController } from './audit-log.controller.js';
import { AuditLogService } from './audit-log.service.js';

/**
 * 审计日志模块（FD-006）。
 *
 * 依赖 `UsersAuthModule` 提供的全局守卫（AuthGuard → RolesGuard），
 * 这里不需要自己注册 —— 权限判定完全由控制器上的 `@RequireRoles('ADMIN')`
 * 决定，服务层不做也不需要做角色判断。
 */
@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService],
})
export class AuditLogModule {}
