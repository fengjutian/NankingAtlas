import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppController } from './app.controller';

describe('AppController (P0 smoke)', () => {
  let controller: AppController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();
    controller = moduleRef.get(AppController);
  });

  it('returns ok status with the configured app env', () => {
    const result = controller.health();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('api');
    expect(typeof result.appEnv).toBe('string');
  });
});