'use strict';

const path = require('path');
const express = require('express');
const request = require('supertest');

describe('docsViewer mount path', () => {
  test('mounted under /docs prefixes assets and API base', async () => {
    const { createDocsViewerRouter } = require('../../src/ui/server/docsViewer/server');

    const host = express();
    const docsPath = path.join(process.cwd(), 'docs');

    const docsViewer = createDocsViewerRouter({ docsPath });
    host.use('/docs', docsViewer.router);

    const res = await request(host).get('/docs');

    expect(res.status).toBe(200);
    expect(res.type).toContain('html');

    // Asset URLs should be base-url aware.
    expect(res.text).toContain('/docs/assets/docs-viewer.css');
    expect(res.text).toContain('/docs/assets/docs-viewer.js');

    // Client-side JS uses this to construct /docs/api/* requests.
    expect(res.text).toContain('window.__DOCS_VIEWER_BASE_PATH__ = "/docs"');

    // SSR navigation links should stay within the mounted prefix.
    expect(res.text).toContain('href="/docs?doc=');
  });
});
