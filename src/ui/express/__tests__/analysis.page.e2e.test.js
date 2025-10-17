/**
 * @fileoverview Focused E2E test for analysis pages
 * Tests module loading and error reporting on analysis list/detail pages
 */

const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');
const { createApp } = require('../server');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { createTempDb } = require('../../../../tests/test-utils');
const { inferQueryType } = require('../../../db/sqlite/instrumentation');
const schema = require('../../../db/sqlite/schema');

describe('Analysis Pages E2E', () => {
  let app;
  let server;
  let baseUrl;
  let db;

  beforeAll(async () => {
    // Use a temporary database for this test suite
    const tempDbPath = createTempDb();
    
    // Mock the database preparation to instrument it
    const originalPrepare = require('better-sqlite3')(tempDbPath).prepare;
    
    app = createApp({
      dbPath: tempDbPath,
      verbose: false,
      ensureDb: (dbPath) => {
        const dbInstance = new Database(dbPath);
        dbInstance.exec(schema);
        
        // Override prepare to track queries
        dbInstance.prepare = function(sql) {
          const stmt = originalPrepare.call(this, sql);
          const queryType = inferQueryType(sql);
          // Mock instrumentation
          return {
            ...stmt,
            run: (...args) => {
              try {
                return stmt.run.apply(stmt, args);
              } catch (e) {
                console.error(`Error running SQL: ${sql}`);
                throw e;
              }
            },
            get: (...args) => stmt.get.apply(stmt, args),
            all: (...args) => stmt.all.apply(stmt, args),
          };
        };
        
        return dbInstance;
      }
    });

    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;
    db = app.locals.getDb();
  });

  afterAll(done => {
    server.close(() => {
      if (app.locals._cleanupTempDb) {
        app.locals._cleanupTempDb();
      }
      done();
    });
  });

  it('analysis list page loads without module errors', async () => {
    // Seed the database with a dummy analysis run
    try {
      db.prepare(`
        INSERT INTO analysis_runs (id, status, started_at, ended_at, summary)
        VALUES (?, ?, ?, ?, ?)
      `).run('test-run-002', 'completed', '2023-10-08T12:00:00Z', '2023-10-08T13:00:00Z', 'Test summary 2');
    } catch (err) {
      console.error('Error seeding analysis_runs for list page test:', err.message);
    }

    const response = await fetch(`${baseUrl}/analysis`);
    const html = await response.text();

    // Verify page structure
    expect(html).toContain('Analysis Runs');
    expect(html).toContain('/assets/components/AnalysisProgressBar.js');
    
    // Should NOT contain syntax errors in the HTML
    expect(html).not.toContain('SyntaxError');
  });

  it('analysis detail page accepts run ID', async () => {
    // Seed the database with a dummy analysis run
    const runId = 'test-run-001';
    db.prepare(`
      INSERT INTO analysis_runs (id, status, started_at, ended_at, summary)
      VALUES (?, ?, ?, ?, ?)
    `).run(runId, 'completed', '2023-10-08T10:00:00Z', '2023-10-08T11:00:00Z', 'Test summary');

    const response = await fetch(`${baseUrl}/analysis/${runId}/ssr`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Analysis Run Details');
    expect(html).toContain(runId);
  });

  it('analysis components built correctly', async () => {
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

  it('SSR pages can handle missing run ID gracefully', async () => {
    const response = await fetch(`${baseUrl}/analysis/nonexistent-run/ssr`);
    
    // Should either return 404 or render empty state
    expect([200, 404]).toContain(response.status);
    
    const html = await response.text();
    
    // Should not crash with module errors
    expect(html).not.toContain('SyntaxError');
    expect(html).not.toContain('Uncaught');
  });

  it('analysis page includes telemetry for browser errors', async () => {
    const response = await fetch(`${baseUrl}/analysis/runs`);
    const html = await response.text();
    
    // Check for error handling code
    // This is a basic check, a more robust test might check for specific script content
    const hasTelemetry = html.includes('addEventListener') && html.includes('error');
    expect(hasTelemetry).toBe(true);
  });
});
