import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { ZodError } from 'zod';

import { TiptapDocumentError } from '@nanking-atlas/validation';

import { AuthError } from '../../modules/auth/auth.service.js';
import { IfMatchRequiredError } from '../../modules/contents/content.controller.js';
import {
  ContentNotFoundError,
  ContentVersionConflictError,
  PublicationNotReadyError,
} from '../../modules/contents/content.service.js';
import { PublicContentNotFoundError } from '../../modules/homepage/public-content.controller.js';
import {
  QueryValidationError,
  RouteNotFoundError,
} from '../../modules/places/places-search.controller.js';
import { UserNotFoundError, InvalidRoleError } from '../../modules/users/users.service.js';
import { PasswordPolicyError } from '../../lib/password.js';
import { UnauthorizedError } from '../auth/auth.guard.js';
import { ForbiddenError } from '../auth/roles.guard.js';

/**
 * 全局异常过滤器 —— 统一错误契约。
 *
 * 技术方案 §7.1：「错误使用 `{ error: { code, message, details?, requestId } }`，
 * 生产环境不暴露堆栈」。
 *
 * 关键点：
 *   - 未知异常一律 500 + 通用文案，**绝不把 message / stack 透给客户端**。
 *     内部错误信息只进日志（含 requestId 便于关联）。
 *   - requestId 从 request 上取（RequestIdMiddleware 写入），让用户报障时
 *     能用同一个 id 在日志里定位。
 */

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = req.requestId ?? 'unknown';

    const { status, body } = this.toErrorBody(exception, requestId);

    if (status >= 500) {
      // 5xx 记完整错误到服务端日志；4xx 只记简要（避免日志被刷爆）。
      this.logger.error(
        `[${requestId}] ${req.method} ${req.url} -> ${String(status)}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json(body);
  }

  private toErrorBody(exception: unknown, requestId: string): { status: number; body: ErrorBody } {
    // ---- 认证 / 授权 ----
    if (exception instanceof UnauthorizedError) {
      return {
        status: HttpStatus.UNAUTHORIZED,
        body: wrap('UNAUTHORIZED', exception.message, requestId),
      };
    }
    if (exception instanceof ForbiddenError) {
      return {
        status: HttpStatus.FORBIDDEN,
        body: wrap('FORBIDDEN', exception.message, requestId),
      };
    }
    if (exception instanceof AuthError) {
      return this.mapAuthError(exception, requestId);
    }

    // ---- 资源 ----
    if (exception instanceof UserNotFoundError) {
      return { status: HttpStatus.NOT_FOUND, body: wrap('NOT_FOUND', '用户不存在', requestId) };
    }
    if (exception instanceof ContentNotFoundError) {
      return { status: HttpStatus.NOT_FOUND, body: wrap('NOT_FOUND', '内容不存在', requestId) };
    }
    // 公开读接口：未发布 / 已归档 / 不存在 → 统一 404。
    // 区分它们会泄露"这个 slug 存在但没发布"，属于信息泄露。
    if (exception instanceof PublicContentNotFoundError) {
      return { status: HttpStatus.NOT_FOUND, body: wrap('NOT_FOUND', '内容不存在', requestId) };
    }
    if (exception instanceof InvalidRoleError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: wrap('VALIDATION_FAILED', `无效角色：${exception.role}`, requestId),
      };
    }
    if (exception instanceof IfMatchRequiredError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: wrap('VALIDATION_FAILED', exception.message, requestId),
      };
    }
    // ---- 地图 / 搜索查询（P3）----
    if (exception instanceof QueryValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: wrap('VALIDATION_FAILED', '查询参数校验失败', requestId, {
          issues: exception.issues,
        }),
      };
    }
    if (exception instanceof RouteNotFoundError) {
      return { status: HttpStatus.NOT_FOUND, body: wrap('NOT_FOUND', '路线不存在', requestId) };
    }

    // ---- 乐观锁冲突（AGENTS.md §5.5：版本冲突返回 409，禁止静默覆盖）----
    if (exception instanceof ContentVersionConflictError) {
      return {
        status: HttpStatus.CONFLICT,
        body: wrap('CONTENT_VERSION_CONFLICT', '内容已被他人修改，请重新加载后再保存', requestId, {
          currentVersion: exception.currentVersion,
          expectedVersion: exception.expectedVersion,
        }),
      };
    }

    // ---- 发布前校验未通过（技术方案 §6：结构化 422）----
    if (exception instanceof PublicationNotReadyError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: wrap('PUBLICATION_NOT_READY', '内容未满足发布条件', requestId, {
          issues: exception.issues,
        }),
      };
    }

    // ---- 参数校验 ----
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: wrap('VALIDATION_FAILED', '请求参数校验失败', requestId, {
          issues: exception.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        }),
      };
    }

    // ---- 密码强度（P1-02）----
    // 密码太短是**用户输入问题**（400），不是服务端故障（500）。
    // 不映射的话会被记成 5xx，污染告警并让前端无法区分原因。
    if (exception instanceof PasswordPolicyError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: wrap('VALIDATION_FAILED', exception.message, requestId),
      };
    }

    // ---- Tiptap 文档白名单（P1-06）----
    // 客户端提交了 script / javascript: 等被禁内容 —— 这是**用户的输入错误**
    // 不是服务端故障，所以映射成 400 并回传具体路径，便于编辑器高亮问题节点。
    if (exception instanceof TiptapDocumentError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: wrap('VALIDATION_FAILED', exception.message, requestId, {
          issues: exception.issues,
        }),
      };
    }

    // ---- Nest 内建 HTTP 异常 ----
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (typeof raw === 'string') {
        return { status, body: wrap(httpStatusToCode(status), raw, requestId) };
      }
      const message =
        typeof raw === 'object' && raw !== null && 'message' in raw
          ? String(raw.message)
          : exception.message;
      return { status, body: wrap(httpStatusToCode(status), message, requestId) };
    }

    // ---- body-parser 的 PayloadTooLargeError ----
    // 它来自 http-errors 而不是 @nestjs/common，`instanceof HttpException` 抓不到，
    // 会一路掉进下面的兜底分支变成 500 —— 客户端发了个超大 body 却被记成服务端
    // 故障，污染 5xx 告警与错误率。按 http-errors 的契约字段识别并归到 413。
    if (isPayloadTooLarge(exception)) {
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        body: wrap('PAYLOAD_TOO_LARGE', '请求体过大，请减小提交内容后重试', requestId),
      };
    }

    // ---- 未知异常：不泄露细节 ----
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: wrap('INTERNAL_ERROR', '服务器内部错误，请稍后重试', requestId),
    };
  }

  private mapAuthError(error: AuthError, requestId: string): { status: number; body: ErrorBody } {
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
        return {
          status: HttpStatus.UNAUTHORIZED,
          body: wrap('INVALID_CREDENTIALS', error.message, requestId),
        };
      case 'TOKEN_EXPIRED':
        return {
          status: HttpStatus.UNAUTHORIZED,
          body: wrap('TOKEN_EXPIRED', error.message, requestId),
        };
      case 'TOKEN_REVOKED':
        return {
          status: HttpStatus.UNAUTHORIZED,
          body: wrap('TOKEN_REVOKED', error.message, requestId),
        };
      case 'ACCOUNT_DISABLED':
        return {
          status: HttpStatus.FORBIDDEN,
          body: wrap('ACCOUNT_DISABLED', error.message, requestId),
        };
      default:
        return {
          status: HttpStatus.UNAUTHORIZED,
          body: wrap('UNAUTHORIZED', error.message, requestId),
        };
    }
  }
}

function wrap(
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): ErrorBody {
  const error: ErrorBody['error'] = { code, message, requestId };
  if (details !== undefined) {
    error.details = details;
  }
  return { error };
}

function httpStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    case 429:
      return 'RATE_LIMITED';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
  }
}

/**
 * 是否是 body-parser 抛出的"请求体过大"。
 *
 * 两种判据都指向同一件事：
 *   - `type === 'entity.too.large'`：http-errors 的标准类型标识
 *   - `status` / `statusCode === 413`：语义等价，兜住 http-errors 字段变动
 *
 * 不用 `instanceof`：body-parser 与 @nestjs/common 各带一份 http-errors 实例，
 * instanceof 跨包不可靠。
 */
function isPayloadTooLarge(exception: unknown): boolean {
  if (typeof exception !== 'object' || exception === null) {
    return false;
  }
  const record = exception as { type?: unknown; status?: unknown; statusCode?: unknown };
  if (record.type === 'entity.too.large') {
    return true;
  }
  return record.status === 413 || record.statusCode === 413;
}
