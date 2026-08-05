'use strict';

const request = require('supertest');

describe('unifiedApp basic HTTP contracts', () => {
  // c209: requiring the unified-app server measures ~3.3s on its own (it
  // mounts every sub-app router at require time), and the first GET / then
  // renders the shell. The 10s default leaves almost no headroom and flakes
  // whenever the machine is busy — same cause as the c205 registry-suite
  // fix. 30s is headroom over a measured baseline, not a hidden hang.
  jest.setTimeout(30_000);

  test('GET / returns shell HTML', async () => {
    const { app } = require('../../src/ui/server/unifiedApp/server');
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('unified-shell');
    expect(response.text).toContain('Control Center');
  });

  test('GET /api/apps returns stable schema', async () => {
    const { app, SUB_APPS } = require('../../src/ui/server/unifiedApp/server');

    const response = await request(app).get('/api/apps');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');

    expect(response.body).toHaveProperty('apps');
    expect(Array.isArray(response.body.apps)).toBe(true);
    expect(response.body.apps.length).toBe(SUB_APPS.length);

    const ids = response.body.apps.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const entry of response.body.apps) {
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.label).toBe('string');
      expect(typeof entry.icon).toBe('string');
      expect(typeof entry.category).toBe('string');
      expect(typeof entry.description).toBe('string');
    }
  });

  test('GET /api/apps/:appId/content returns content for every registered app', async () => {
    const { app, SUB_APPS } = require('../../src/ui/server/unifiedApp/server');

    for (const entry of SUB_APPS) {
      const response = await request(app).get(`/api/apps/${encodeURIComponent(entry.id)}/content`);

      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
      expect(response.body).toHaveProperty('appId', entry.id);
      expect(typeof response.body.content).toBe('string');
      expect(response.body.content.length).toBeGreaterThan(0);
      expect(response.body.content).not.toContain('undefined');
      expect(response.body.content).not.toContain('null');

      if (entry.id === 'home') {
        expect(response.body.content).toContain('home-dashboard');
      }
    }
  });

  test('GET /api/apps/:appId/content returns 404 for unknown app', async () => {
    const { app } = require('../../src/ui/server/unifiedApp/server');

    const response = await request(app).get('/api/apps/does-not-exist/content');
    expect(response.status).toBe(404);
    expect(response.type).toContain('json');
    expect(response.body).toHaveProperty('error');
  });
});
