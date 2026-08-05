'use strict';

describe('unifiedApp sub-app registry', () => {
  const { createSubAppRegistry, CATEGORIES } = require('../../src/ui/server/unifiedApp/subApps/registry');
  const request = require('supertest');

  function normalizeRenderResult(result) {
    if (typeof result === 'string') return { content: result };
    if (!result || typeof result !== 'object') return { content: '' };
    if (typeof result.content === 'string') return result;
    return { content: '' };
  }

  test('has stable ids, categories, and embedded mount paths', async () => {
    const apps = createSubAppRegistry();

    expect(Array.isArray(apps)).toBe(true);
    expect(apps.length).toBeGreaterThanOrEqual(10);

    const ids = apps.map((app) => app.id);
    expect(new Set(ids).size).toBe(ids.length);

    const required = [
      'home',
      'rate-limits',
      'crawl-observer',
      'webhooks',
      'quality',
      'analytics',
      'query-telemetry',
      'docs'
      // c205: crawl-status, plugins, and design removed from required — their
      // mounts were retired in cycle 171 and the dangling registry entries
      // (sidebar links into 404 iframes) were removed this cycle.
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

      const result = normalizeRenderResult(await app.renderContent({}));
      expect(typeof result.content).toBe('string');
      expect(result.content.length).toBeGreaterThan(0);
    }

    const byId = new Map(apps.map((app) => [app.id, app]));

    // c205: crawl-status, plugins, and design assertions removed with their
    // dangling registry entries (mounts retired cycle 171 — the sidebar was
    // iframing 404s).
    await expect(normalizeRenderResult(await byId.get('rate-limits').renderContent({})).content).toContain('src="/rate-limit"');
    await expect(normalizeRenderResult(await byId.get('crawl-observer').renderContent({})).content).toContain('src="/crawl-observer"');
    await expect(normalizeRenderResult(await byId.get('webhooks').renderContent({})).content).toContain('src="/webhooks"');
    await expect(normalizeRenderResult(await byId.get('quality').renderContent({})).content).toContain('src="/quality"');
    await expect(normalizeRenderResult(await byId.get('analytics').renderContent({})).content).toContain('src="/analytics"');
    await expect(normalizeRenderResult(await byId.get('query-telemetry').renderContent({})).content).toContain('src="/telemetry"');
    await expect(normalizeRenderResult(await byId.get('docs').renderContent({})).content).toContain('src="/docs"');

    // Regression guard: the embedded panel demo must request activation.
    const panelDemo = normalizeRenderResult(await byId.get('panel-demo').renderContent({}));
    expect(panelDemo.embed).toBe('panel');
    expect(panelDemo.activationKey).toBe('panel-demo');
    expect(panelDemo.content).toContain('data-unified-activate="panel-demo"');
  });

  // c205: the server.js require alone measures ~5s cold (heavy module
  // init); under parallel-session CPU load the default 10s budget flakes.
  // 30s is headroom over the measured baseline, not a hidden hang.
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
  }, 30000);

  test('home page renders the crawl-ecosystem dashboard', async () => {
    // c205: the old pin ("Available Apps" stat equals registry length) died
    // in the panel-hero redesign — the home page is a crawl-ecosystem
    // dashboard now, and no app-count stat exists anywhere in its markup.
    // Pin the redesigned contract instead: the hero plus the five live
    // stat cards (values load client-side, so labels are the stable part).
    const apps = createSubAppRegistry();
    const home = apps.find((app) => app.id === 'home');
    expect(home).toBeDefined();

    const result = normalizeRenderResult(await home.renderContent({}));
    const html = result.content;

    expect(html).toContain('panel-hero__title');
    const labels = [...html.matchAll(/panel-stat-card__label">([^<]+)</g)].map((m) => m[1]);
    expect(labels).toEqual([
      'Articles Indexed',
      'Known Hub Pages',
      'Tracked Domains',
      'Active Crawls',
      'Recent Errors (10m)'
    ]);
  });
});
