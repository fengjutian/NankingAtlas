import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController (P0)', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('live returns ok without dependencies', () => {
    expect(controller.live()).toEqual({ status: 'ok', service: 'api' });
  });

  it('ready returns ok with the current app env', () => {
    const result = controller.ready();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('api');
    expect(typeof result.appEnv).toBe('string');
    expect(result.checks).toEqual({ process: 'ok' });
  });
});