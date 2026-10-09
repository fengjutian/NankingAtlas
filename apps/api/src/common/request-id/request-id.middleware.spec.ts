import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it } from 'vitest';

import { REQUEST_ID_KEY, RequestIdMiddleware } from './request-id.middleware.js';

function makeReq(headerValue: string | undefined, headerName = 'x-request-id'): Request {
  const headers: Record<string, string> = {};
  if (headerValue !== undefined) headers[headerName] = headerValue;
  return {
    header(name: string): string | undefined {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

function makeRes(): { res: Response; setHeaders: Record<string, string> } {
  const setHeaders: Record<string, string> = {};
  const res = {
    setHeader(name: string, value: string): void {
      setHeaders[name.toLowerCase()] = value;
    },
  } as unknown as Response;
  return { res, setHeaders };
}

describe('RequestIdMiddleware', () => {
  beforeEach(() => {
    // 走默认值 x-request-id
    process.env.REQUEST_ID_HEADER = '';
  });

  it('reuses a valid incoming request id', () => {
    const middleware = new RequestIdMiddleware();
    const req = makeReq('req_abc123_-XYZ');
    const { res, setHeaders } = makeRes();
    const next: NextFunction = () => undefined;

    middleware.use(req, res, next);

    expect(req[REQUEST_ID_KEY]).toBe('req_abc123_-XYZ');
    expect(setHeaders['x-request-id']).toBe('req_abc123_-XYZ');
  });

  it('generates a new id when the incoming one is missing', () => {
    const middleware = new RequestIdMiddleware();
    const req = makeReq(undefined);
    const { res, setHeaders } = makeRes();

    middleware.use(req, res, () => undefined);

    const generated = req[REQUEST_ID_KEY];
    expect(generated).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(setHeaders['x-request-id']).toBe(generated);
  });

  it('generates a new id when the incoming one is malformed', () => {
    const middleware = new RequestIdMiddleware();
    const req = makeReq('has space and !@#');
    const { res, setHeaders } = makeRes();

    middleware.use(req, res, () => undefined);

    expect(req[REQUEST_ID_KEY]).not.toBe('has space and !@#');
    expect(req[REQUEST_ID_KEY]).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(setHeaders['x-request-id']).toBe(req[REQUEST_ID_KEY]);
  });
});
