'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const SCHEMA_VERSION = 1;

const FIXTURE_PRESETS = Object.freeze({
  small: {
    crawlClass: 'small-local',
    defaultPort: 41891,
    hosts: ['127.0.0.1'],
    pages: [
      {
        path: '/news/fixture-article.html',
        slug: 'small-fixture-article',
        title: 'Small Fixture Article',
      },
    ],
  },
  medium: {
    crawlClass: 'medium-local',
    defaultPort: 41892,
    hosts: ['127.0.0.1', '127.0.0.2', '127.0.0.3'],
    pages: [
      {
        path: '/news/medium-a.html',
        slug: 'medium-fixture-a',
        title: 'Medium Fixture A',
      },
      {
        path: '/news/medium-b.html',
        slug: 'medium-fixture-b',
        title: 'Medium Fixture B',
      },
      {
        path: '/news/medium-c.html',
        slug: 'medium-fixture-c',
        title: 'Medium Fixture C',
      },
    ],
  },
});

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=,@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function commandObject(args) {
  return {
    executable: 'node',
    env: {},
    args,
    display: ['node', ...args].map(shellQuote).join(' '),
  };
}

function normalizePreset(value) {
  const preset = String(value || 'small').trim().toLowerCase();
  if (!FIXTURE_PRESETS[preset]) {
    throw new Error(`unknown local fixture preset: ${preset}`);
  }
  return preset;
}

function normalizePort(value, fallback, { allowZero = false } = {}) {
  const parsed = Number.parseInt(value, 10);
  const port = Number.isFinite(parsed) ? parsed : fallback;
  const min = allowZero ? 0 : 1024;
  if (port < min || port > 65535) {
    throw new Error(`fixture port must be between ${min} and 65535`);
  }
  return port;
}

function normalizeLifetimeMs(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, 30 * 60 * 1000);
}

function normalizeTargetToken(value) {
  const token = String(value || '').trim();
  if (!token) return null;
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(token)) {
    throw new Error('fixture target token must be 1-80 characters of A-Z, a-z, 0-9, dot, underscore, or dash');
  }
  return token;
}

function tokenizedPath(pagePath, targetToken) {
  if (!targetToken) return pagePath;
  return pagePath.replace(/(\.[A-Za-z0-9]+)?$/, `-${targetToken}$1`);
}

function defaultReadyFile(preset) {
  return `tmp/${preset}-local-fixture-ready.json`;
}

function defaultPidFile(preset) {
  return `tmp/${preset}-local-fixture.pid`;
}

function renderArticleHtml({ preset, host, page, requestedPath }) {
  const title = `${page.title} on ${host}`;
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    `<meta name="description" content="Deterministic ${preset} loopback fixture article for crawler reliability proof.">`,
    '<meta name="robots" content="index,follow">',
    '</head>',
    '<body>',
    '<main>',
    '<article>',
    `<h1>${title}</h1>`,
    '<p class="byline">Fixture Desk</p>',
    '<time datetime="2026-05-29T12:00:00Z">May 29, 2026</time>',
    `<p>Requested path ${requestedPath} is served from loopback host ${host}.</p>`,
    `<p>This ${preset} fixture gives the crawler deterministic response bytes, article-like markup, and stable URLs.</p>`,
    '<p>The body is intentionally non-empty so DB proof can distinguish response evidence from weak or robots-only evidence.</p>',
    `<p>Fixture slug ${page.slug} is unique within this preset.</p>`,
    '</article>',
    '</main>',
    '</body>',
    '</html>',
  ].join('');
}

function buildFixturePlan(options = {}) {
  const preset = normalizePreset(options.preset);
  const spec = FIXTURE_PRESETS[preset];
  const port = normalizePort(options.port, spec.defaultPort);
  const targetToken = normalizeTargetToken(options.targetToken || options['target-token']);
  const readyFile = options.readyFile || options['ready-file'] || defaultReadyFile(preset);
  const pidFile = options.pidFile || options['pid-file'] || defaultPidFile(preset);
  const targets = spec.hosts.map((host, index) => {
    const page = spec.pages[index] || spec.pages[0];
    const targetPath = tokenizedPath(page.path, targetToken);
    return {
      host,
      port,
      path: targetPath,
      slug: page.slug,
      title: page.title,
      targetToken,
      url: `http://${host}:${port}${targetPath}`,
    };
  });

  const startArgs = [
    'tools/crawl/local-fixture-server.js',
    '--preset', preset,
    '--port', String(port),
    '--ready-file', readyFile,
    '--pid-file', pidFile,
    '--json',
  ];
  if (targetToken) startArgs.splice(startArgs.length - 1, 0, '--target-token', targetToken);
  const planArgs = [
    'tools/crawl/local-fixture-server.js',
    '--preset', preset,
    '--port', String(port),
    '--plan',
    '--json',
  ];
  if (targetToken) planArgs.splice(planArgs.length - 1, 0, '--target-token', targetToken);

  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'local-crawl-fixture-plan',
    generatedAt: new Date().toISOString(),
    preset,
    targetToken,
    crawlClass: spec.crawlClass,
    hosts: targets.map(target => target.host),
    urls: targets.map(target => target.url),
    targets,
    server: {
      port,
      readyFile,
      pidFile,
      bindHosts: spec.hosts.slice(),
    },
    commands: {
      start: commandObject(startArgs),
      plan: commandObject(planArgs),
    },
    actionPolicy: {
      startsServer: false,
      startsServerWhenExecuted: true,
      contactsInternetTargets: false,
      contactsRemoteCrawler: false,
      writesLocalDb: false,
      writesLocalDbWhenCrawled: true,
      mutatesRemoteQueue: false,
    },
  };
}

function createFixtureRequestHandler(plan, host) {
  const target = plan.targets.find(item => item.host === host) || plan.targets[0];
  const page = {
    path: target.path,
    slug: target.slug,
    title: target.title,
  };
  return (req, res) => {
    const reqUrl = req.url || '/';
    res.setHeader('Cache-Control', 'no-store');
    if (reqUrl === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('User-agent: *\nAllow: /\n');
      return;
    }
    if (reqUrl === '/' || reqUrl === page.path) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderArticleHtml({
        preset: plan.preset,
        host,
        page,
        requestedPath: reqUrl,
      }));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found\n');
  };
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

async function closeServers(servers) {
  await Promise.all(servers.map(server => new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch (_error) {
      resolve();
    }
  })));
}

function writeJsonFile(filePath, payload) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(payload, null, 2)}\n`);
}

async function startFixtureServers(plan, options = {}) {
  const servers = [];
  try {
    for (const host of plan.server.bindHosts) {
      const server = http.createServer(createFixtureRequestHandler(plan, host));
      await listen(server, host, plan.server.port);
      servers.push(server);
    }
  } catch (error) {
    await closeServers(servers);
    throw error;
  }

  const ready = {
    schemaVersion: SCHEMA_VERSION,
    mode: 'local-crawl-fixture-ready',
    generatedAt: new Date().toISOString(),
    pid: process.pid,
    preset: plan.preset,
    crawlClass: plan.crawlClass,
    hosts: plan.hosts,
    urls: plan.urls,
    targets: plan.targets,
    port: plan.server.port,
  };
  writeJsonFile(options.readyFile || plan.server.readyFile, ready);
  if (options.pidFile || plan.server.pidFile) {
    const pidPath = path.resolve(options.pidFile || plan.server.pidFile);
    fs.mkdirSync(path.dirname(pidPath), { recursive: true });
    fs.writeFileSync(pidPath, `${process.pid}\n`);
  }

  let lifetimeTimer = null;
  const lifetimeMs = normalizeLifetimeMs(options.lifetimeMs || options['lifetime-ms']);
  if (lifetimeMs > 0) {
    lifetimeTimer = setTimeout(() => {
      closeServers(servers).catch(() => {});
    }, lifetimeMs);
    if (typeof lifetimeTimer.unref === 'function') lifetimeTimer.unref();
  }

  return {
    ready,
    servers,
    close: async () => {
      if (lifetimeTimer) clearTimeout(lifetimeTimer);
      await closeServers(servers);
    },
  };
}

function parseArgs(argv = []) {
  const args = {
    preset: 'small',
    plan: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--plan') {
      args.plan = true;
      continue;
    }
    if (token === '--json') {
      args.json = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (!token.startsWith('--')) {
      throw new Error(`unexpected positional argument: ${token}`);
    }
    const eqIndex = token.indexOf('=');
    const key = eqIndex === -1 ? token.slice(2) : token.slice(2, eqIndex);
    const inlineValue = eqIndex === -1 ? null : token.slice(eqIndex + 1);
    const next = argv[index + 1];
    const value = inlineValue !== null
      ? inlineValue
      : (next && !next.startsWith('--') ? next : true);
    if (inlineValue === null && value !== true) index += 1;
    args[key] = value;
  }
  args.preset = normalizePreset(args.preset);
  args.port = normalizePort(args.port, FIXTURE_PRESETS[args.preset].defaultPort);
  args.targetToken = normalizeTargetToken(args.targetToken || args['target-token']);
  args.readyFile = args.readyFile || args['ready-file'] || defaultReadyFile(args.preset);
  args.pidFile = args.pidFile || args['pid-file'] || defaultPidFile(args.preset);
  args.lifetimeMs = normalizeLifetimeMs(args.lifetimeMs || args['lifetime-ms']);
  return args;
}

module.exports = {
  FIXTURE_PRESETS,
  buildFixturePlan,
  closeServers,
  createFixtureRequestHandler,
  normalizePort,
  normalizePreset,
  normalizeTargetToken,
  parseArgs,
  startFixtureServers,
};
