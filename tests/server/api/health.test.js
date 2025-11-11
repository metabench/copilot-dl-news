'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
  statSync: jest.fn()
}));

const fs = require('fs');
const { createHealthRouter } = require('../../../src/api/routes/health');

function createApp(options = {}) {
  const app = express();
  app.use(createHealthRouter(options));
  return app;
}

describe('health router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /health returns healthy status when database file exists', async () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({ version: '9.9.9' }));
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ size: 2048 });

    const app = createApp({ dbPath: 'c:/data/news.db' });
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.version).toBe('9.9.9');
    expect(response.body.database).toEqual({
      connected: true,
      path: 'c:/data/news.db',
      size: 2048
    });
    expect(fs.existsSync).toHaveBeenCalledWith('c:/data/news.db');
    expect(fs.statSync).toHaveBeenCalledWith('c:/data/news.db');
  });

  test('GET /health reports degraded status when database file missing', async () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));
    fs.existsSync.mockReturnValue(false);

    const app = createApp({ dbPath: 'c:/data/missing.db' });
    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.database.connected).toBe(false);
    expect(response.body.database.path).toBe('c:/data/missing.db');
    expect(fs.statSync).not.toHaveBeenCalled();
  });

  test('GET /health falls back to default version when package read fails', async () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error('boom');
    });
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ size: 512 });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const app = createApp({ dbPath: 'c:/data/news.db' });
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.version).toBe('0.0.0');
    expect(response.body.database.connected).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
