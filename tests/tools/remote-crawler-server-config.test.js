'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildServerConfig,
  normalizeDomainConfigs,
  parseServerArgv,
} = require('../../deploy/remote-crawler-v2/lib/server-config');

describe('remote crawler v2 server config', () => {
  test('parses cli flags in split and equals forms', () => {
    expect(parseServerArgv(['--config', 'domains.json', '--port=3201', '--coordinator-mode'])).toEqual({
      config: 'domains.json',
      port: '3201',
      'coordinator-mode': true,
    });
  });

  test('normalizes string and object domain entries', () => {
    expect(normalizeDomainConfigs([
      'bbc.com',
      { host: 'reuters.com', maxPages: 25, seedUrls: 'https://www.reuters.com/world/, https://www.reuters.com/business/' },
      'bbc.com',
    ], 5)).toEqual([
      { domain: 'bbc.com', maxPages: 5 },
      {
        domain: 'reuters.com',
        maxPages: 25,
        seedUrls: ['https://www.reuters.com/world/', 'https://www.reuters.com/business/'],
      },
    ]);
  });

  test('loads top-level config and lets cli flags override it', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-server-config-'));
    const configPath = path.join(tempDir, 'crawl-domains.json');
    fs.writeFileSync(configPath, JSON.stringify({
      port: 3200,
      db: 'data/from-config.db',
      maxPages: 5,
      maxConcurrent: 1,
      idleTimeoutMin: 10,
      coordinatorMode: true,
      autoStart: false,
      domains: ['bbc.com'],
    }));

    try {
      const config = buildServerConfig({
        config: configPath,
        port: '3205',
        'max-concurrent': '3',
      });

      expect(config.port).toBe(3205);
      expect(config.dbFile).toBe('data/from-config.db');
      expect(config.maxPagesDefault).toBe(5);
      expect(config.maxConcurrent).toBe(3);
      expect(config.idleTimeoutMin).toBe(10);
      expect(config.coordinatorMode).toBe(true);
      expect(config.autoStart).toBe(false);
      expect(config.domainConfigs).toEqual([{ domain: 'bbc.com', maxPages: 5 }]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('supports cli no-auto-start override', () => {
    const config = buildServerConfig({ domains: 'bbc.com', 'no-auto-start': true });
    expect(config.autoStart).toBe(false);
  });
});
