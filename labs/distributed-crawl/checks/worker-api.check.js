#!/usr/bin/env node
"use strict";

const http = require('http');
const assert = require('assert');

const { createWorkerServer, WORKER_API_VERSION } = require('../worker-server');

function startOriginServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/html') {
      const body = '<!doctype html><html><body><h1>Hello</h1><a href="/x">x</a></body></html>';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'GET', headers: { accept: 'application/json' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(text) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function httpPostJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const u = new URL(url);

    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        'accept': 'application/json',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(text) });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const origin = await startOriginServer();

  const worker = createWorkerServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => {
    if (worker.listening) return resolve();
    worker.once('listening', resolve);
  });
  const workerAddr = worker.address();
  const workerBase = `http://127.0.0.1:${workerAddr.port}`;

  try {
    const meta = await httpGetJson(`${workerBase}/meta`);
    assert.strictEqual(meta.status, 200);
    assert.strictEqual(meta.json.apiVersion, WORKER_API_VERSION);
    assert.strictEqual(meta.json.capabilities.includeBodyBase64, true);

    const openapi = await httpGetJson(`${workerBase}/openapi.json`);
    assert.strictEqual(openapi.status, 200);
    assert.strictEqual(openapi.json.info.version, WORKER_API_VERSION);

    const batch = await httpPostJson(`${workerBase}/batch`, {
      requests: [{ url: `${origin.baseUrl}/html`, method: 'GET', includeBody: true }],
      maxConcurrency: 2,
      batchSize: 5,
      timeoutMs: 5000,
      includeBody: true,
      compress: 'none',
    });

    assert.strictEqual(batch.status, 200);
    assert.strictEqual(batch.json.summary.apiVersion, WORKER_API_VERSION);
    assert.strictEqual(batch.json.results.length, 1);
    assert.strictEqual(batch.json.results[0].ok, true);
    assert.ok(batch.json.results[0].bodyBytes > 10);
    assert.ok(typeof batch.json.results[0].bodyBase64 === 'string' && batch.json.results[0].bodyBase64.length > 10);

    console.log('OK worker-api.check.js');
  } finally {
    await new Promise((resolve) => origin.server.close(resolve));
    await new Promise((resolve) => worker.close(resolve));
  }
}

main().catch((err) => {
  console.error('FAIL worker-api.check.js');
  console.error(err);
  process.exit(1);
});
