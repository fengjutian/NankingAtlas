import { beforeEach, describe, expect, it } from 'vitest';

import { REQUEST_ID_KEY, RequestIdMiddleware } from './request-id.middleware.js';

import type { NextFunction, Request, Response } from 'express';

interface FakeRes {
  res: Response;
  setHeaders: Record<string, string>;
  locals: Record<string, unknown>;
}

function makeReq(headerValue: string | undefined, headerName = 'x-request-id'): Request {
  const headers: Record<string, string> = {};
  if (headerValue !== undefined) headers[headerName] = headerValue;
  return {
    header(name: string): string | undefined {
      return headers[name.toLowerCase()];
    },
    locals: {} as Record<string, unknown>,
  } as unknown as Request;
}

function makeRes(): FakeRes {
  const setHeaders: Record<string, string> = {};
  const locals: Record<string, unknown> = {};
  const res = {
    setHeader(name: string, value: string): void {
      setHeaders[name.toLowerCase()] = value;
    },
    locals,
  } as unknown as Response;
  return { res, setHeaders, locals };
}

describe('RequestIdMiddleware', () => {
  beforeEach(() => {
    // 走默认值 x-request-id
    process.env.REQUEST_ID_HEADER = '';
  });

  it('reuses a valid incoming request id', () => {
    const middleware = new RequestIdMiddleware();
    const req = makeReq('req_abc123_-XYZ');
    const fake = makeRes();
    const next: NextFunction = () => undefined;

    middleware.use(req, fake.res, next);

    expect(fake.locals[REQUEST_ID_KEY]).toBe('req_abc123_-XYZ');
    expect(fake.setHeaders['x-request-id']).toBe('req_abc123_-XYZ');
  });

  it('generates a new id when the incoming one is missing', () => {
    const middleware = new RequestIdMiddleware();
    const req = makeReq(undefined);
    const fake = makeRes();

    middleware.use(req, fake.res, () => undefined);

    const generated = fake.locals[REQUEST_ID_KEY];
    expect(generated).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(fake.setHeaders['x-request-id']).toBe(generated);
  });

  it('generates a new id when the incoming one is malformed', () => {
    const middleware = new RequestIdMiddleware();
    const req = makeReq('has space and !@#');
    const fake = makeRes();

    middleware.use(req, fake.res, () => undefined);

    const generated = fake.locals[REQUEST_ID_KEY];
    expect(generated).not.toBe('has space and !@#');
    expect(generated).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fake.setHeaders['x-request-id']).toBe(generated);
  });
});
