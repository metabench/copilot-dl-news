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
const { buildStatus, techStateFingerprint } = require('./statusData');

// Stamped once at boot: a page that polls can tell "the data changed" from
// "the server was restarted under me" (a restart means new CODE — the one thing
// a live data reload cannot deliver).
const SERVER_STARTED_AT = new Date().toISOString();

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

    // The big-lightbulb signal (owner 2026-07-27): a click on a signal-bearing
    // tech node POSTs here; the record lands in data/agi-signals.jsonl and reaches
    // the agent through the orient probe + the generated next-prompt.
    const signals = require('./signals');
    router.set_route('/api/research-signal', null, (req, res) => {
      if (req.method !== 'POST') { res.writeHead(405); res.end('POST only'); return; }
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
      req.on('end', () => {
        try {
          const { tech, requested } = JSON.parse(body || '{}');
          if (!tech) { res.writeHead(400); res.end('tech required'); return; }
          const rec = signals.raise(String(tech).slice(0, 60), requested);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ ok: true, id: rec.id, at: rec.at }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    });

    // ── LIVE PROGRESS (owner directive 2026-07-30, cycle 155) ───────────────
    // The pages were already rendered per request from live files; what was
    // missing is that nothing ever ASKED again, so finished work sat unseen on
    // an open page. /api/tech-state is the cheap poll target: stat()-only
    // fingerprint + the handful of numbers a strip shows, so a page can check
    // every 45s forever without costing anything.
    const activity = require('./activity');
    router.set_route('/api/tech-state', null, (req, res) => {
      try {
        const st = buildStatus();
        const counts = (st.techTree.branches || []).reduce((acc, b) => ({
          grown: acc.grown + b.grown.length,
          available: acc.available + b.available.length,
          gated: acc.gated + b.gated.length
        }), { grown: 0, available: 0, gated: 0 });
        const body = JSON.stringify({
          fingerprints: techStateFingerprint(), // { cards, activity } — see statusData
          counts,
          pendingSignals: (st.pendingSignals || []).length,
          cycles: st.cycles || null,
          activity: activity.current(),
          serverStartedAt: SERVER_STARTED_AT
        });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(body);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });

    // The agent's write channel: one small POST at a phase boundary. Throttled
    // in the store (not here) so every caller shares one flow-protection rule,
    // and a throttled report is a 200 with throttled:true — reporting progress
    // must never look like a failure the agent has to handle.
    router.set_route('/api/agent-activity', null, (req, res) => {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ current: activity.current(), recent: activity.readAll().slice(-10).reverse() }));
        return;
      }
      if (req.method !== 'POST') { res.writeHead(405); res.end('GET or POST'); return; }
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
      req.on('end', () => {
        try {
          const { phase, note, cycle } = JSON.parse(body || '{}');
          const out = activity.report({ phase, note, cycle });
          res.writeHead(out.ok || out.throttled ? 200 : 400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(out));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    });

    // SMAC-style branch pages (owner 2026-07-27): /tech/agi, /tech/tree,
    // /tech/crawler. RENDERED PER REQUEST inside the handler — unlike the main
    // page's publish-once SSR, these can never serve a boot-time snapshot.
    const { renderTechPage, renderNodePage } = require('./techPages');
    const { ledgerMentions } = require('./statusData');

    // Datalinks page per node (cycle 148, owner-signalled TECH-DATALINKS): a query
    // param rather than a path segment because the router matches exact paths — and
    // this way NEW nodes get pages with no route registration and no restart.
    router.set_route('/tech/node', null, (req, res) => {
      try {
        const id = new URL(req.url, 'http://localhost').searchParams.get('id') || '';
        const html = renderNodePage(id, buildStatus().techTree, {
          ledgerTrail: ledgerMentions(id),
          signalHistory: signals.effective()
        });
        if (!html) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('unknown node: ' + id); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('datalinks page failed: ' + e.message);
      }
    });

    for (const branchKey of ['agi', 'tree', 'crawler', 'factory']) {
      router.set_route(`/tech/${branchKey}`, null, (req, res) => {
        try {
          const st = buildStatus();
          const html = renderTechPage(branchKey, st.techTree, { pendingSignals: st.pendingSignals, toolInventory: st.toolInventory, signalHistory: signals.effective() });
          if (!html) { res.writeHead(404); res.end('unknown branch'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(html);
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`tech page failed: ${e.message}`);
        }
      });
    }

    // Favicon (cycle 143 finishing touch): the app's tab identity, and the end of
    // the browser's /favicon.ico 404 that the live check had to filter around.
    const { faviconSvg } = require('./techArt');
    for (const fav of ['/favicon.svg', '/favicon.ico']) {
      router.set_route(fav, null, (req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
        res.end(faviconSvg());
      });
    }

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
