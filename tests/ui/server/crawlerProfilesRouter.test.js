'use strict';

const express = require('express');
const request = require('supertest');

const { createCrawlerProfilesRouter } = require('../../../src/ui/server/crawlerProfiles/server');

function createInMemoryDb() {
  const map = new Map();
  return {
    getSetting: (key, fallback = null) => {
      if (!key) return fallback;
      return map.has(key) ? map.get(key) : fallback;
    },
    setSetting: (key, value) => {
      if (!key) return false;
      map.set(key, value != null ? String(value) : null);
      return true;
    }
  };
}

describe('crawler profiles API', () => {
  test('bootstrap installs guardian presets and allows setting active', async () => {
    const db = createInMemoryDb();
    const app = express();

    app.use(
      createCrawlerProfilesRouter({
        getDbRW: () => db,
        includeRootRoute: false,
        includeApiRoutes: true
      })
    );

    const empty = await request(app).get('/api/crawler-profiles');
    expect(empty.status).toBe(200);
    expect(empty.body.status).toBe('ok');
    expect(Array.isArray(empty.body.items)).toBe(true);

    const boot = await request(app).post('/api/crawler-profiles/bootstrap');
    expect(boot.status).toBe(200);
    expect(boot.body.status).toBe('ok');

    const list = await request(app).get('/api/crawler-profiles');
    expect(list.status).toBe(200);
    expect(list.body.status).toBe('ok');
    expect(list.body.items.length).toBeGreaterThan(0);

    const firstId = list.body.items[0].id;

    const setActive = await request(app)
      .post('/api/crawler-profiles/active')
      .send({ id: firstId })
      .set('Content-Type', 'application/json');

    expect(setActive.status).toBe(200);
    expect(setActive.body.status).toBe('ok');
    expect(setActive.body.activeId).toBe(firstId);

    const active = await request(app).get('/api/crawler-profiles/active');
    expect(active.status).toBe(200);
    expect(active.body.status).toBe('ok');
    expect(active.body.activeId).toBe(firstId);
    expect(active.body.profile).toBeTruthy();
    expect(active.body.profile.id).toBe(firstId);
  });
});
