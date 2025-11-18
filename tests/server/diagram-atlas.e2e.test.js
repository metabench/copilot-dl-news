const fs = require('fs');
const os = require('os');
const path = require('path');
const supertest = require('supertest');

const { createDiagramAtlasServer } = require('../../src/ui/server/diagramAtlasServer');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildFixturePayload() {
  return {
    generatedAt: new Date().toISOString(),
    source: 'diagram-atlas-e2e-fixture',
    code: {
      summary: {
        totalLines: 42,
        fileCount: 2
      },
      files: [
        {
          file: 'src/example.js',
          root: 'src',
          lines: 30,
          functions: 2,
          classes: 0,
          entryPoint: true,
          dependencies: { './dep': 1 },
          score: 0.9
        },
        {
          file: 'tools/dev/helper.js',
          root: 'tools',
          lines: 12,
          functions: 1,
          classes: 0,
          entryPoint: false,
          dependencies: {},
          score: 0.2
        }
      ],
      directories: [
        { directory: 'src', lines: 30, files: 1 },
        { directory: 'tools/dev', lines: 12, files: 1 }
      ],
      topFiles: []
    },
    db: {
      totalTables: 1,
      tables: [
        {
          name: 'articles',
          columnCount: 3,
          columns: ['id', 'title', 'body'],
          foreignKeys: []
        }
      ]
    },
    features: {
      featureCount: 1,
      features: [
        {
          id: 'feature:diagram:e2e',
          name: 'Diagram Atlas Fixture',
          description: 'Minimal payload used by the diagram atlas e2e test.',
          color: '#4287f5',
          tags: ['test'],
          entry: 'src/example.js',
          depth: 1,
          totalLines: 30,
          files: [
            { file: 'src/example.js', lines: 30, hop: 0, via: 'entry' },
            { file: 'tools/dev/helper.js', lines: 12, hop: 1, via: './helper' }
          ],
          segments: [
            {
              file: 'src/example.js',
              type: 'primary',
              functions: [
                { name: 'renderDiagram', hash: 'abc1234def567890', byteLength: 200, line: 10 }
              ]
            }
          ]
        }
      ]
    }
  };
}

describe('diagramAtlasServer (e2e)', () => {
  let tempDir;
  let cachePath;
  let cliFixturePath;
  let cliScriptPath;
  let request;
  let payload;
  let diagramService;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagram-atlas-e2e-'));
    cachePath = path.join(tempDir, 'diagram-data-cache.json');
    payload = buildFixturePayload();
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2));

    cliFixturePath = path.join(tempDir, 'diagram-data-cli-output.json');
    fs.writeFileSync(cliFixturePath, JSON.stringify(payload, null, 2));

    cliScriptPath = path.join(tempDir, 'diagram-data-cli-stub.js');
    const cliSource = [
      "#!/usr/bin/env node",
      "const fs = require('fs');",
      `const fixturePath = ${JSON.stringify(cliFixturePath)};`,
      "const contents = fs.readFileSync(fixturePath, 'utf8');",
      "const delay = Number(process.env.DIAGRAM_ATLAS_CLI_DELAY_MS || 0);",
      "const emit = () => { process.stdout.write(contents); };",
      "if (delay > 0) {",
      "  setTimeout(emit, delay);",
      "} else {",
      "  emit();",
      "}"
    ].join('\n');
    fs.writeFileSync(cliScriptPath, `${cliSource}\n`, { encoding: 'utf8' });

    const { app, dataService } = createDiagramAtlasServer({
      title: 'Diagram Atlas E2E',
      dataService: {
        cachePath,
        ttlMs: 60 * 60 * 1000,
        cliPath: cliScriptPath,
        refreshDelayMs: 250
      }
    });

    request = supertest(app);
    diagramService = dataService;
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('serves the diagram atlas shell with loader + config', async () => {
    const response = await request.get('/diagram-atlas');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/html/);
    expect(response.text).toContain('Diagram Atlas E2E');
    expect(response.text).toContain('data-role="diagram-progress"');
    expect(response.text).toContain('data-role="diagram-atlas-sections"');
    expect(response.text).toContain('window.__DIAGRAM_ATLAS__ = ');
    expect(response.text).not.toContain('Diagram Atlas Fixture');
  });

  it('renders a server-side snapshot when ?ssr=1 is provided', async () => {
    const response = await request.get('/diagram-atlas?ssr=1');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Diagram Atlas Fixture');
    expect(response.text).toContain('initialData');
  });

  it('exposes the cached diagram data via the API', async () => {
    const response = await request.get('/api/diagram-data');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
  });

  it('allows refreshing the cached payload', async () => {
    const nextPayload = {
      ...payload,
      generatedAt: new Date(Date.now() + 1000).toISOString(),
      code: {
        ...payload.code,
        summary: {
          totalLines: 84,
          fileCount: 3
        }
      }
    };
    fs.writeFileSync(cliFixturePath, JSON.stringify(nextPayload, null, 2));

    const response = await request.post('/api/diagram-data/refresh');
    expect(response.status).toBe(200);
    expect(response.body.code.summary.totalLines).toBe(84);
    expect(response.body.generatedAt).toBe(nextPayload.generatedAt);
  });

  it('reports refresh status via /api/diagram-data/status', async () => {
    const baseline = await request.get('/api/diagram-data/status');
    expect(baseline.status).toBe(200);
    expect(['idle', 'ready']).toContain(baseline.body.state);
    expect(diagramService.refreshDelayMs).toBe(250);

    const refreshPromise = diagramService.refresh();
    let during;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await request.get('/api/diagram-data/status');
      if (response.body.state === 'refreshing') {
        during = response;
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(25);
    }
    expect(during).toBeTruthy();
    expect(during.status).toBe(200);
    expect(during.body.state).toBe('refreshing');
    expect(during.body.startedAt).toBeTruthy();
    expect(during.body.detail).toBeTruthy();

    await refreshPromise;

    const after = await request.get('/api/diagram-data/status');
    expect(after.status).toBe(200);
    expect(after.body.state).toBe('ready');
    expect(typeof after.body.lastSuccess).toBe('string');
    expect(after.body.lastError).toBeNull();
  });
});
