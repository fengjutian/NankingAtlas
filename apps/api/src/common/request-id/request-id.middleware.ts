import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';

import { env } from '../../lib/env.js';

const REQUEST_ID_REGEX = /^[A-Za-z0-9_-]{8,128}$/u;

export const REQUEST_ID_HEADER_NAME = 'x-request-id' as const;
export const REQUEST_ID_KEY = 'requestId' as const;

declare module 'express-serve-static-core' {
  interface Request {
    [REQUEST_ID_KEY]?: string;
  }
}

/**
 * 读取请求头（默认 `x-request-id`）作为 request id；
 * - 缺省或格式非法时由 crypto.randomBytes 生成 16 字节 base64url。
 * - 透传同名的响应头，便于客户端排错。
 * - 写入 req.requestId 供 logger / controller / error filter 读取。
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(env.REQUEST_ID_HEADER);
    const incomingName = env.REQUEST_ID_HEADER;

    let id: string;
    if (incoming && REQUEST_ID_REGEX.test(incoming)) {
      id = incoming;
    } else {
      id = randomBytes(16).toString('base64url');
    }

    req[REQUEST_ID_KEY] = id;
    res.setHeader(REQUEST_ID_HEADER_NAME, id);
    // 兼容用户自定义 header 名（透传相同值）
    if (incomingName !== REQUEST_ID_HEADER_NAME) {
      res.setHeader(incomingName, id);
    }

    next();
  }
}
