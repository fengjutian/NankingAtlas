import { Injectable } from '@nestjs/common';
import { Type } from '@nestjs/common';

import { ForbiddenError } from './roles.guard.js';

/**
 * 资源状态守卫。
 *
 * AGENTS.md §4.1 要求「所有后台写接口必须服务端鉴权并检查角色、
 * 资源状态和动作权限」。角色由 RolesGuard 负责，**资源当前状态**由这里负责。
 *
 * 典型用法：
 *   ```ts
 *   @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
 *   @ResourceStateGuard({
 *     loader: (id) => contents.findById(id),
 *     // 只允许在这些状态下继续操作
 *   })
 *   @Patch(':id')
 *   update(...) {}
 *   ```
 *
 * 默认 `allowedStatuses` 为空 → 任何状态都拒绝；调用方必须显式声明。
 */

export interface ResourceStateGuardOptions<TResource> {
  /** 按路由参数 id 载入资源；返回 null 表示资源不存在。 */
  loader: (id: string, request: unknown) => Promise<TResource | null>;
  /** 从资源里取状态字段。 */
  getStatus: (resource: TResource) => string;
  /** 允许操作的状态集合（fail-closed：未声明即全拒）。 */
  allowedStatuses: readonly string[];
  /** 不存在时抛 404 而不是 403 —— 避免通过错误码探测资源存在性时可区分。 */
  notFoundMessage?: string;
}

interface ResourceStateMetadata {
  loader: (id: string, request: unknown) => Promise<unknown>;
  getStatus: (resource: never) => string;
  allowedStatuses: readonly string[];
  notFoundMessage: string;
}

export const RESOURCE_STATE_METADATA_KEY = 'nla:resource_state' as const;

export function ResourceStateGuard<TResource>(
  options: ResourceStateGuardOptions<TResource>,
): MethodDecorator & ClassDecorator {
  const metadata: ResourceStateMetadata = {
    loader: options.loader as (id: string, request: unknown) => Promise<unknown>,
    getStatus: options.getStatus as (resource: never) => string,
    allowedStatuses: options.allowedStatuses,
    notFoundMessage: options.notFoundMessage ?? '资源不存在',
  };
  return ((
    target: object,
    propertyKey?: string | symbol,
    descriptor?: TypedPropertyDescriptor<unknown>,
  ) => {
    if (descriptor !== undefined && propertyKey !== undefined) {
      Reflect.defineMetadata(
        `${RESOURCE_STATE_METADATA_KEY}:${String(propertyKey)}`,
        metadata,
        target,
      );
      return descriptor;
    }
    Reflect.defineMetadata(RESOURCE_STATE_METADATA_KEY, metadata, target as object);
    return target as never;
  }) as MethodDecorator & ClassDecorator;
}

/** 从 metadata 读取方法级或类级配置。 */
export function readResourceStateMetadata(
  reflectorHost: { get: (key: string, target: unknown) => unknown },
  target: object,
  propertyKey: string,
): ResourceStateMetadata | null {
  const methodLevel = reflectorHost.get(
    `${RESOURCE_STATE_METADATA_KEY}:${propertyKey}`,
    target,
  );
  if (methodLevel !== undefined && methodLevel !== null) {
    return methodLevel as ResourceStateMetadata;
  }
  const classLevel = reflectorHost.get(RESOURCE_STATE_METADATA_KEY, target);
  if (classLevel !== undefined && classLevel !== null) {
    return classLevel as ResourceStateMetadata;
  }
  return null;
}

/** 供 service 层复用：断言资源状态允许操作。 */
export function assertResourceStatus(
  actual: string,
  allowed: readonly string[],
): void {
  if (!allowed.includes(actual)) {
    throw new ForbiddenError(
      `资源当前状态 ${actual} 不允许该操作（允许：${allowed.join(' / ') || '无'}）`,
    );
  }
}

/** 让 `Type` 导入有用途（Nest 装饰器类型标注）。 */
export type ControllerClass = Type<unknown>;
@Injectable()
export class ResourceStateMarker {}