import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';

import { closeTestApp, createTestApp, request, serverOf } from '../../../test/app-harness.js';
import { seedDatabase } from '../../../test/seed-fixture.js';

/**
 * seed → 登录 的端到端验证。
 *
 * 价值在于**参数一致性**：seed 写入的 Argon2id 哈希必须能被 API 的
 * `verifyPassword` 验证。两处参数（memoryCost / timeCost / parallelism）
 * 任一不同，登录就会失败 —— 这是纯函数测试抓不到的跨包契约。
 */
let app: INestApplication | undefined;

function liveApp(): INestApplication {
  if (app === undefined) {
    throw new Error('app not initialised');
  }
  return app;
}

beforeAll(async () => {
  await seedDatabase();
  app = await createTestApp();
});

afterAll(async () => {
  await closeTestApp(app);
});

describe('seeded demo accounts can log in', () => {
  const cases: { email: string; expectRoles: string[] }[] = [
    { email: 'admin@demo.local', expectRoles: ['ADMIN'] },
    { email: 'reviewer@demo.local', expectRoles: ['REVIEWER'] },
    { email: 'editor@demo.local', expectRoles: ['EDITOR'] },
  ];

  for (const item of cases) {
    it(`${item.email} logs in with the seeded Argon2id hash`, async () => {
      const res = await request(serverOf(liveApp()))
        .post('/api/v1/auth/login')
        .send({ email: item.email, password: 'nanking-atlas-demo-2026' });

      expect(res.status).toBe(200);
      const body = res.body as { data: { accessToken: string; user: { roles: string[] } } };
      expect(body.data.accessToken.split('.')).toHaveLength(3);
      expect(body.data.user.roles).toEqual(item.expectRoles);
    });
  }

  it('seeded content is DRAFT and hidden from the public list', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/contents?limit=100');
    expect(res.status).toBe(200);
    const items = (res.body as { data: { slug: string }[] }).data;
    const seeded = items.filter((item) => item.slug.startsWith('demo-'));
    expect(seeded).toHaveLength(0);
  });

  it('seeded content is visible to an authenticated editor', async () => {
    const login = await request(serverOf(liveApp()))
      .post('/api/v1/auth/login')
      .send({ email: 'editor@demo.local', password: 'nanking-atlas-demo-2026' });
    const accessToken = (login.body as { data: { accessToken: string } }).data.accessToken;

    const res = await request(serverOf(liveApp()))
      .get('/api/v1/admin/contents?limit=100')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const items = (res.body as { data: { slug: string; status: string }[] }).data;
    const seeded = items.filter((item) => item.slug.startsWith('demo-'));
    expect(seeded.length).toBeGreaterThan(0);
    // 全部 DRAFT —— 未核验内容绝不能被 seed 发布出去
    for (const item of seeded) {
      expect(item.status).toBe('DRAFT');
    }
  });
});
