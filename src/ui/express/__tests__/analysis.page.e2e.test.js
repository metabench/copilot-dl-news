/**
 * @fileoverview Focused E2E test for analysis pages
 * Tests module loading and error reporting on analysis list/detail pages
 */

const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');
const { createApp } = require('../server.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

function createTempDb() {
  const tmpDir = path.join(os.tmpdir(), 'analysis-e2e-test');
  fs.mkdirSync(tmpDir, { recursive: true });
  const unique = `${process.pid}-${Date.now()}-${Math.random()}`;
  return path.join(tmpDir, `test-${unique}.db`);
}

describe('Analysis Pages E2E', () => {
  let app, server, baseUrl;
  const dbPath = createTempDb();

  beforeAll(async () => {
    app = createApp({ dbPath, verbose: false });
    
    await new Promise((resolve, reject) => {
      server = app.listen(0, 'localhost', (err) => {
        if (err) return reject(err);
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('analysis list page loads without module errors', async () => {
    const response = await fetch(`${baseUrl}/analysis/runs`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    
    const html = await response.text();
    
    // Verify page structure
    expect(html).toContain('Analysis Runs');
    expect(html).toContain('/assets/components/AnalysisProgressBar.js');
    
    // Should NOT contain syntax errors in the HTML
    expect(html).not.toContain('SyntaxError');
    expect(html).not.toContain('does not provide an export');
    
    // Verify module script tag uses type="module"
    expect(html).toMatch(/<script type="module"[^>]*>/);
    
    // Verify import statement is present
    expect(html).toContain("import { createAnalysisProgressBar }");
  });

  test('analysis detail page accepts run ID', async () => {
    // Create a mock analysis run first
    const db = app.locals.backgroundTaskManager.db;
    const result = db.prepare(`
      INSERT INTO analysis_runs (run_id, status, started_at, completed_at, article_count, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'test-run-001',
      'completed',
      Date.now(),
      Date.now(),
      100,
      JSON.stringify({ test: true })
    );

    const response = await fetch(`${baseUrl}/analysis/test-run-001/ssr`);
    expect(response.status).toBe(200);
    
    const html = await response.text();
    expect(html).toContain('Analysis Run:');
    expect(html).toContain('test-run-001');
    expect(html).toContain('/assets/components/AnalysisProgressBar.js');
  });

  test('analysis components built correctly', async () => {
    // Check if the built component exists and is accessible
    const response = await fetch(`${baseUrl}/assets/components/AnalysisProgressBar.js`);
    expect(response.status).toBe(200);
    
    const content = await response.text();
    
    // Should be valid JavaScript
    expect(content.length).toBeGreaterThan(100);
    
    // Check for export (either CommonJS or ES6)
    const hasCommonJsExport = content.includes('module.exports') || content.includes('exports.');
    const hasES6Export = content.includes('export {') || content.includes('export default');
    
    expect(hasCommonJsExport || hasES6Export).toBe(true);
  });

  test('SSR pages can handle missing run ID gracefully', async () => {
    const response = await fetch(`${baseUrl}/analysis/nonexistent-run/ssr`);
    
    // Should either return 404 or render empty state
    expect([200, 404]).toContain(response.status);
    
    const html = await response.text();
    
    // Should not crash with module errors
    expect(html).not.toContain('SyntaxError');
    expect(html).not.toContain('Uncaught');
  });

  test('analysis page includes telemetry for browser errors', async () => {
    const response = await fetch(`${baseUrl}/analysis/runs`);
    const html = await response.text();
    
    // Check for error handling code
    expect(html).toContain('window.addEventListener');
    
    // Should have some error reporting mechanism
    const hasErrorHandler = 
      html.includes('window.onerror') || 
      html.includes("addEventListener('error'") ||
      html.includes('try {') ||
      html.includes('catch');
    
    expect(hasErrorHandler).toBe(true);
  });
});
