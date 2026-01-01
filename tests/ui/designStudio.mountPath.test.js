'use strict';

const path = require('path');
const express = require('express');
const request = require('supertest');

describe('designStudio mount path', () => {
  test('mounted under /design prefixes assets and links', async () => {
    const { createDesignStudioRouter } = require('../../src/ui/server/designStudio/server');

    const host = express();
    const designPath = path.join(process.cwd(), 'design');

    const designStudio = createDesignStudioRouter({ designPath });
    host.use('/design', designStudio.router);

    const res = await request(host).get('/design');

    expect(res.status).toBe(200);
    expect(res.type).toContain('html');

    // Asset URLs should be base-url aware.
    expect(res.text).toContain('/design/assets/design-studio.css');
    expect(res.text).toContain('/design/assets/design-studio.js');

    // SSR navigation links should stay within the mounted prefix.
    expect(res.text).toContain('href="/design?asset=');
  });
});
