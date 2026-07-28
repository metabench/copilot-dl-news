'use strict';

/**
 * dashboard-client-entry.js — the browser boot for the REMOTE crawl dashboard
 * (D4 slice 2b, cycle 149, owner-signalled TECH-DASH2B). esbuild bundles this to an
 * IIFE (scripts/build-dashboard-bundle.js, mirroring build-ui-client.js) which the
 * engine's multi-domain-server serves at /dashboard-client.js.
 *
 * REFRESH MODEL — re-render, not activation: the panel HTML is recomposed from a
 * fresh model every REFRESH_MS and swapped in whole. This deliberately sidesteps
 * jsgui client re-attachment on a page with no jsgui3-client boot (the projectStatus
 * page proved that wiring is its own project), and it can never serve the c128.5
 * stale-DOM class because there is no SSR to diverge from — the page starts empty
 * and every paint comes from the live /api/status. jsgui3-html still renders the
 * control markup (bundled; never installed on the box — the registry tarballs are
 * case-broken on Linux, so the artifact is built on Windows and shipped).
 *
 * Same-origin by design: fetchStatus hits /api/status on whichever host serves the
 * page, so the one bundle works on any worker node.
 */

const { RemoteDataAdapter } = require('./DashboardDataAdapter');
// NB the sibling controls export NAMED objects; ActivityHeadlines exports the class
// directly. Getting this wrong minifies into "TW is not a constructor" — caught by
// the local browser proof before the first deploy.
const { ThroughputStripControl } = require('./ThroughputStripControl');
const { HostHealthBadgesControl } = require('./HostHealthBadgesControl');
const ActivityHeadlinesControl = require('./ActivityHeadlinesControl');

const REFRESH_MS = 5000;

function fetchStatus() {
  return fetch('/api/status', { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error('status ' + r.status);
    return r.json();
  });
}

function renderPanels(model) {
  // jsgui SSR-composes each control to markup; the swap is wholesale (see header).
  const jsgui = require('jsgui3-html');
  const ctx = new jsgui.Page_Context();
  const strip = new ThroughputStripControl({ context: ctx, throughput: model.throughput });
  const badges = new HostHealthBadgesControl({ context: ctx, hostHealth: model.hostHealth });
  return {
    throughput: strip.all_html_render(),
    hosts: badges.all_html_render(),
    activity: ActivityHeadlinesControl.renderHtml(model)
  };
}

function boot() {
  const mounts = {
    throughput: document.getElementById('dash-throughput'),
    hosts: document.getElementById('dash-hosts'),
    activity: document.getElementById('dash-activity')
  };
  const stamp = document.getElementById('dash-stamp');
  const adapter = new RemoteDataAdapter({ source: { fetchStatus } });

  async function tick() {
    try {
      const model = await adapter.getModel();
      const html = renderPanels(model);
      for (const key of Object.keys(mounts)) {
        if (mounts[key]) mounts[key].innerHTML = html[key];
      }
      if (stamp) stamp.textContent = 'updated ' + new Date().toLocaleTimeString() + ' · refreshes every ' + (REFRESH_MS / 1000) + 's';
    } catch (e) {
      if (stamp) stamp.textContent = 'refresh failed: ' + e.message;
    }
  }

  tick();
  setInterval(tick, REFRESH_MS);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
