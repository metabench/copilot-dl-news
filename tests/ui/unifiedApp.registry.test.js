'use strict';

describe('unifiedApp sub-app registry', () => {
  const { createSubAppRegistry, CATEGORIES } = require('../../src/ui/server/unifiedApp/subApps/registry');
  const request = require('supertest');

  test('has stable ids, categories, and embedded mount paths', async () => {
    const apps = createSubAppRegistry();

    expect(Array.isArray(apps)).toBe(true);
    expect(apps.length).toBeGreaterThanOrEqual(10);

    const ids = apps.map((app) => app.id);
    expect(new Set(ids).size).toBe(ids.length);

    const required = [
      'home',
      'rate-limits',
      'webhooks',
      'plugins',
      'quality',
      'analytics',
      'query-telemetry',
      'docs'
    ];

    for (const id of required) {
      expect(ids).toContain(id);
    }

    for (const app of apps) {
      expect(typeof app.id).toBe('string');
      expect(app.id.length).toBeGreaterThan(0);

      expect(typeof app.label).toBe('string');
      expect(typeof app.icon).toBe('string');
      expect(typeof app.category).toBe('string');
      expect(typeof app.description).toBe('string');
      expect(typeof app.renderContent).toBe('function');

      // Category keys must be declared.
      expect(CATEGORIES).toHaveProperty(app.category);

      const html = await app.renderContent({});
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    }

    const byId = new Map(apps.map((app) => [app.id, app]));

    await expect(byId.get('rate-limits').renderContent({})).resolves.toContain('src="/rate-limit"');
    await expect(byId.get('webhooks').renderContent({})).resolves.toContain('src="/webhooks"');
    await expect(byId.get('plugins').renderContent({})).resolves.toContain('src="/plugins"');
    await expect(byId.get('quality').renderContent({})).resolves.toContain('src="/quality"');
    await expect(byId.get('analytics').renderContent({})).resolves.toContain('src="/analytics"');
    await expect(byId.get('query-telemetry').renderContent({})).resolves.toContain('src="/telemetry"');
    await expect(byId.get('docs').renderContent({})).resolves.toContain('src="/docs"');
  });

  test('GET /api/apps returns stable schema', async () => {
    const { app: unifiedAppServer, SUB_APPS } = require('../../src/ui/server/unifiedApp/server');

    const response = await request(unifiedAppServer).get('/api/apps');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');

    expect(response.body).toHaveProperty('apps');
    expect(Array.isArray(response.body.apps)).toBe(true);
    expect(response.body.apps.length).toBe(SUB_APPS.length);

    const ids = response.body.apps.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const entry of response.body.apps) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('label');
      expect(entry).toHaveProperty('icon');
      expect(entry).toHaveProperty('category');
      expect(entry).toHaveProperty('description');
      expect(Object.prototype.hasOwnProperty.call(CATEGORIES, entry.category)).toBe(true);
    }

    // IDs should match the registry the shell actually uses.
    expect(ids).toEqual(SUB_APPS.map((subApp) => subApp.id));
  });
});
