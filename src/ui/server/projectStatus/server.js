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
    server.start(port, (err) => {
      if (err) { console.error('[project-status] start failed:', err); process.exit(1); }
      console.log(`[project-status] ready on http://127.0.0.1:${port}/`);
    });
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
