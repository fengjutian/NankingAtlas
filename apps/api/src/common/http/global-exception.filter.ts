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

import { UnauthorizedError } from '../auth/auth.guard.js';
import { ForbiddenError } from '../auth/roles.guard.js';
import {
  ContentNotFoundError,
  ContentVersionConflictError,
  PublicationNotReadyError,
} from '../../modules/contents/content.service.js';
import { IfMatchRequiredError } from '../../modules/contents/content.controller.js';
import { UserNotFoundError, InvalidRoleError } from '../../modules/users/users.service.js';
import { AuthError } from '../../modules/auth/auth.service.js';

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
        `[${requestId}] ${req.method} ${req.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json(body);
  }

  private toErrorBody(
    exception: unknown,
    requestId: string,
  ): { status: number; body: ErrorBody } {
    // ---- 认证 / 授权 ----
    if (exception instanceof UnauthorizedError) {
      return { status: HttpStatus.UNAUTHORIZED, body: wrap('UNAUTHORIZED', exception.message, requestId) };
    }
    if (exception instanceof ForbiddenError) {
      return { status: HttpStatus.FORBIDDEN, body: wrap('FORBIDDEN', exception.message, requestId) };
    }
    if (exception instanceof AuthError) {
      return this.mapAuthError(exception, requestId);
    }

    // ---- 资源 ----
    if (exception instanceof UserNotFoundError) {
      return { status: HttpStatus.NOT_FOUND, body: wrap('NOT_FOUND', '用户不存在', requestId) };
    }
    if (exception instanceof InvalidRoleError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: wrap('VALIDATION_FAILED', `无效角色：${exception.role}`, requestId),
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

    // ---- Nest 内建 HTTP 异常 ----
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (typeof raw === 'string') {
        return { status, body: wrap(httpStatusToCode(status), raw, requestId) };
      }
      const message =
        typeof raw === 'object' && raw !== null && 'message' in raw
          ? String((raw as { message: unknown }).message)
          : exception.message;
      return { status, body: wrap(httpStatusToCode(status), message, requestId) };
    }

    // ---- 未知异常：不泄露细节 ----
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: wrap('INTERNAL_ERROR', '服务器内部错误，请稍后重试', requestId),
    };
  }

  private mapAuthError(
    error: AuthError,
    requestId: string,
  ): { status: number; body: ErrorBody } {
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
        return { status: HttpStatus.UNAUTHORIZED, body: wrap('INVALID_CREDENTIALS', error.message, requestId) };
      case 'TOKEN_EXPIRED':
        return { status: HttpStatus.UNAUTHORIZED, body: wrap('TOKEN_EXPIRED', error.message, requestId) };
      case 'TOKEN_REVOKED':
        return { status: HttpStatus.UNAUTHORIZED, body: wrap('TOKEN_REVOKED', error.message, requestId) };
      case 'ACCOUNT_DISABLED':
        return { status: HttpStatus.FORBIDDEN, body: wrap('ACCOUNT_DISABLED', error.message, requestId) };
      default:
        return { status: HttpStatus.UNAUTHORIZED, body: wrap('UNAUTHORIZED', error.message, requestId) };
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