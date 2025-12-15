'use strict';

const http = require('http');
const request = require('supertest');

const { createApiServer } = require('../../src/api/server');

describe('API crawl status surfaces', () => {
  test('GET /crawl-status serves a minimal status page', async () => {
    const app = createApiServer({
      getDbRW: () => null,
      verbose: false
    });

    const res = await request(app)
      .get('/crawl-status')
      .expect(200)
      .expect('Content-Type', /text\/html/);

    expect(res.text).toContain('Ongoing Crawl Status');
    expect(res.text).toContain('/api/crawl-telemetry/events');
    expect(res.text).toContain('/api/crawl-telemetry/history');
    expect(res.text).toContain('/api/crawls');
  });

  test('GET /api/crawl-telemetry/history returns a JSON payload', async () => {
    const app = createApiServer({
      getDbRW: () => null,
      verbose: false
    });

    const res = await request(app)
      .get('/api/crawl-telemetry/history')
      .expect(200)
      .expect('Content-Type', /application\/json/);

    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        items: expect.any(Array)
      })
    );
  });

  test('GET /events responds with SSE headers (without hanging)', async () => {
    const app = createApiServer({
      getDbRW: () => null,
      verbose: false
    });

    const server = app.listen(0);
    const { port } = server.address();

    try {
      await new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/events?logs=0',
            method: 'GET',
            headers: {
              Accept: 'text/event-stream'
            }
          },
          (res) => {
            try {
              expect(res.statusCode).toBe(200);
              expect(String(res.headers['content-type'] || '')).toMatch(/text\/event-stream/);
            } finally {
              res.destroy();
              resolve();
            }
          }
        );

        req.on('error', reject);
        req.end();
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('GET /events streams bridged crawl telemetry (progress)', async () => {
    const app = createApiServer({
      getDbRW: () => null,
      verbose: false
    });

    expect(app.locals.crawlTelemetry).toBeTruthy();

    const server = app.listen(0);
    const { port } = server.address();

    try {
      await new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/events?logs=0',
            method: 'GET',
            headers: {
              Accept: 'text/event-stream'
            }
          },
          (res) => {
            let buf = '';
            let done = false;

            const failTimer = setTimeout(() => {
              if (done) return;
              done = true;
              try {
                res.destroy();
              } catch (_) {}
              reject(new Error('Timed out waiting for bridged telemetry event'));
            }, 2500);
            try {
              failTimer.unref?.();
            } catch (_) {}

            res.on('data', (chunk) => {
              if (done) return;
              buf += chunk.toString('utf8');

              const marker = 'event: telemetry\n';
              const idx = buf.indexOf(marker);
              if (idx === -1) return;

              const after = buf.slice(idx + marker.length);
              const dataLinePrefix = 'data: ';
              const dataIdx = after.indexOf(dataLinePrefix);
              if (dataIdx === -1) return;
              const lineEnd = after.indexOf('\n', dataIdx);
              if (lineEnd === -1) return;

              const jsonText = after.slice(dataIdx + dataLinePrefix.length, lineEnd).trim();
              if (!jsonText) return;

              try {
                const entry = JSON.parse(jsonText);
                expect(entry).toEqual(expect.objectContaining({
                  source: expect.any(String),
                  event: expect.any(String),
                  severity: expect.any(String)
                }));
                expect(entry.taskId).toBe('job-test');
                expect(entry.event).toMatch(/(^progress$|^crawl:progress$)/);
                expect(entry.data).toEqual(expect.objectContaining({
                  type: expect.stringMatching(/progress$/),
                  jobId: 'job-test',
                  crawlType: 'standard',
                  data: expect.objectContaining({
                    visited: 1,
                    queued: 2,
                    errors: 0
                  })
                }));

                done = true;
                clearTimeout(failTimer);
                res.destroy();
                resolve();
              } catch (error) {
                done = true;
                clearTimeout(failTimer);
                try {
                  res.destroy();
                } catch (_) {}
                reject(error);
              }
            });

            // Trigger a progress event after the stream is open.
            setTimeout(() => {
              try {
                app.locals.crawlTelemetry.bridge.emitProgress(
                  { visited: 1, queued: 2, errors: 0 },
                  { jobId: 'job-test', crawlType: 'standard' }
                );
              } catch (error) {
                if (!done) {
                  done = true;
                  clearTimeout(failTimer);
                  try {
                    res.destroy();
                  } catch (_) {}
                  reject(error);
                }
              }
            }, 25);
          }
        );

        req.on('error', reject);
        req.end();
      });
    } finally {
      try {
        app.locals.destroyCrawlTelemetry?.();
      } catch (_) {}
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
