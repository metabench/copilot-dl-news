'use strict';

/**
 * server.js — the gamified project-status mini page (owner ask 2026-07-27),
 * served with the full jsgui3 stack per the proven audit recipe:
 * Server({Ctrl, src_path_client_js}) → SSR + esbuild client bundle + activation.
 *
 *   node src/ui/server/projectStatus/server.js        (PORT env overrides 3184)
 *
 * Data is injected server-side via Project_Status_Page.get_status so the
 * browser bundle never contains statusData.js (fs/execSync).
 */

const path = require('path');
const fs = require('fs');
// Sibling-path require; jsgui3-server is consume-only per owner ruling 2026-07-27.
const jsgui_server = require(path.resolve(__dirname, '..', '..', '..', '..', '..', 'jsgui3-server'));
const { Server } = jsgui_server;
const { Project_Status_Page } = require('./controls');
const { buildStatus } = require('./statusData');

Project_Status_Page.get_status = () => {
  try { return buildStatus(); } catch (e) {
    console.error('[project-status] buildStatus failed:', e.message);
    return null;
  }
};

async function main() {
  const env_port = Number(process.env.PORT);
  const port = Number.isFinite(env_port) && env_port > 0 ? env_port : 3184;

  const server = new Server({
    Ctrl: Project_Status_Page,
    src_path_client_js: require.resolve('./controls.js'),
    name: 'project-status'
  });

  // Never start immediately — wait for 'ready' (audit lifecycle rule).
  server.on('ready', () => {
    // Custom routes via the server router (same API the framework uses internally:
    // set_route(route, responder|null, (req, res) => ...)).
    const router = server.server_router;

    // Live game-state JSON for the page's in-place refresh (no reload).
    router.set_route('/api/status', null, (req, res) => {
      try {
        const body = JSON.stringify(buildStatus());
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(body);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });

    // The committed progress SVG, embedded by the page's HISTORY panel. Served from
    // disk each request so a regenerated picture shows on the next refresh.
    const svg_path = path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'agi', 'progress', 'progress.svg');
    router.set_route('/progress.svg', null, (req, res) => {
      fs.readFile(svg_path, (err, buf) => {
        if (err) { res.writeHead(404); res.end('no progress.svg yet — run tools/agi/progress-svg.js'); return; }
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
        res.end(buf);
      });
    });

    server.start(port, (err) => {
      if (err) { console.error('[project-status] start failed:', err); process.exit(1); }
      console.log(`[project-status] ready on http://127.0.0.1:${port}/`);
    });
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
