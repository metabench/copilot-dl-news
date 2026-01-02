'use strict';

const express = require('express');

const { CrawlerProfilesStore } = require('../../../crawler/profiles/CrawlerProfilesStore');

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function mapError(error) {
  if (error && typeof error.statusCode === 'number') {
    return {
      status: error.statusCode,
      code: error.code || 'BAD_REQUEST',
      message: error.message || 'Invalid request.'
    };
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: error && error.message ? error.message : 'Unexpected error.'
  };
}

function renderHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Crawler Profiles</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 16px; color: #111; }
    header { display:flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    h1 { font-size: 18px; margin: 0; }
    .muted { color: #666; }
    .row { display:flex; gap: 10px; flex-wrap: wrap; align-items: end; margin-top: 12px; }
    .field { display:flex; flex-direction: column; gap: 4px; }
    label { font-size: 11px; color: #444; }
    input, select, textarea { font-size: 12px; padding: 7px 10px; border: 1px solid #ddd; border-radius: 8px; }
    textarea { min-width: 520px; min-height: 220px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
    button { font-size: 12px; padding: 8px 12px; }
    .status { margin-top: 10px; font-size: 12px; }
    .status.ok { color: #1b6e2d; }
    .status.error { color: #b3261e; }
    .card { margin-top: 12px; padding: 12px; border: 1px solid #eee; border-radius: 10px; background: #fafafa; }
    .help { font-size: 12px; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>🗃️ Crawler Profiles</h1>
      <div class="muted">Stored in DB settings (crawlerProfiles.*)</div>
    </div>
    <div class="muted">
      <a href="/crawl-status" target="_blank" rel="noopener noreferrer">Open Crawl Status</a>
    </div>
  </header>

  <div class="card">
    <div class="row">
      <div class="field">
        <label for="profile-select">Profile</label>
        <select id="profile-select"></select>
      </div>
      <div>
        <button id="btn-set-active" type="button">Set active</button>
        <button id="btn-delete" type="button">Delete</button>
        <button id="btn-bootstrap" type="button">Install Guardian presets</button>
        <button id="btn-reload" type="button">Reload</button>
      </div>
    </div>

    <div class="row" style="margin-top: 14px;">
      <div class="field" style="flex:1; min-width: 560px;">
        <label for="profile-json">Selected profile (JSON)</label>
        <textarea id="profile-json" spellcheck="false"></textarea>
      </div>
      <div>
        <button id="btn-save" type="button">Save (upsert)</button>
      </div>
    </div>

    <div id="status" class="status muted">Loading…</div>

    <div class="help muted" style="margin-top: 10px;">
      <div>Profile schema:</div>
      <div><code>{ id, label, startUrl, operationName, overrides }</code></div>
      <div>These map directly onto <code>/api/v1/crawl/operations/:operationName/start</code>.</div>
    </div>
  </div>

  <script>
  (function () {
    const apiBase = '/api/crawler-profiles';

    const elSelect = document.getElementById('profile-select');
    const elJson = document.getElementById('profile-json');
    const elStatus = document.getElementById('status');

    const btnReload = document.getElementById('btn-reload');
    const btnSave = document.getElementById('btn-save');
    const btnSetActive = document.getElementById('btn-set-active');
    const btnDelete = document.getElementById('btn-delete');
    const btnBootstrap = document.getElementById('btn-bootstrap');

    let state = { items: [], activeId: null };

    function setStatus(message, kind) {
      elStatus.textContent = message || '';
      elStatus.className = 'status' + (kind ? (' ' + kind) : ' muted');
    }

    function safeStringify(value) {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return '';
      }
    }

    function loadSelectedProfileIntoEditor() {
      const id = String(elSelect.value || '');
      const profile = state.items.find((p) => p && p.id === id) || null;
      elJson.value = profile ? safeStringify(profile) : '';
    }

    function renderSelect() {
      elSelect.innerHTML = '';

      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = state.items.length ? 'Select a profile…' : 'No profiles saved';
      elSelect.appendChild(opt0);

      for (const p of state.items) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = (p.id === state.activeId ? '★ ' : '') + p.label;
        elSelect.appendChild(opt);
      }

      if (state.activeId) {
        elSelect.value = state.activeId;
      } else if (state.items[0]) {
        elSelect.value = state.items[0].id;
      }

      loadSelectedProfileIntoEditor();
    }

    async function fetchJson(url, options) {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', ...(options && options.headers ? options.headers : {}) },
        ...options
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || String(res.status));
      }
      return res.json();
    }

    async function reload() {
      setStatus('Loading…', null);
      try {
        const payload = await fetchJson(apiBase);
        state.items = Array.isArray(payload.items) ? payload.items : [];
        state.activeId = payload.activeId || null;
        renderSelect();
        setStatus('Loaded ' + state.items.length + ' profile(s).', 'ok');
      } catch (err) {
        setStatus('Failed to load profiles: ' + (err && err.message ? err.message : String(err)), 'error');
      }
    }

    elSelect.addEventListener('change', () => loadSelectedProfileIntoEditor());

    btnReload.addEventListener('click', () => reload());

    btnSave.addEventListener('click', async () => {
      const raw = String(elJson.value || '').trim();
      if (!raw) {
        setStatus('Paste a profile JSON object first.', 'error');
        return;
      }
      let profile;
      try {
        profile = JSON.parse(raw);
      } catch (err) {
        setStatus('Invalid JSON: ' + (err && err.message ? err.message : String(err)), 'error');
        return;
      }

      setStatus('Saving…', null);
      try {
        await fetchJson(apiBase, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile })
        });
        await reload();
        if (profile && profile.id) {
          elSelect.value = String(profile.id);
          loadSelectedProfileIntoEditor();
        }
        setStatus('Saved.', 'ok');
      } catch (err) {
        setStatus('Save failed: ' + (err && err.message ? err.message : String(err)), 'error');
      }
    });

    btnSetActive.addEventListener('click', async () => {
      const id = String(elSelect.value || '').trim();
      if (!id) {
        setStatus('Select a profile first.', 'error');
        return;
      }
      setStatus('Setting active…', null);
      try {
        await fetchJson(apiBase + '/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        await reload();
        setStatus('Active profile set.', 'ok');
      } catch (err) {
        setStatus('Failed to set active: ' + (err && err.message ? err.message : String(err)), 'error');
      }
    });

    btnDelete.addEventListener('click', async () => {
      const id = String(elSelect.value || '').trim();
      if (!id) {
        setStatus('Select a profile first.', 'error');
        return;
      }
      if (!confirm('Delete profile "' + id + '"?')) return;

      setStatus('Deleting…', null);
      try {
        await fetchJson(apiBase + '/' + encodeURIComponent(id), { method: 'DELETE' });
        await reload();
        setStatus('Deleted.', 'ok');
      } catch (err) {
        setStatus('Delete failed: ' + (err && err.message ? err.message : String(err)), 'error');
      }
    });

    btnBootstrap.addEventListener('click', async () => {
      setStatus('Installing presets…', null);
      try {
        const payload = await fetchJson(apiBase + '/bootstrap', { method: 'POST' });
        await reload();
        setStatus('Installed ' + (payload && payload.installed ? payload.installed.length : 0) + ' preset(s).', 'ok');
      } catch (err) {
        setStatus('Bootstrap failed: ' + (err && err.message ? err.message : String(err)), 'error');
      }
    });

    reload();
  })();
  </script>
</body>
</html>`;
}

function createCrawlerProfilesRouter({
  getDbRW,
  includeRootRoute = true,
  includeApiRoutes = true
} = {}) {
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  function requireDb(req, res) {
    const db = typeof getDbRW === 'function' ? getDbRW() : null;
    if (!db) {
      res.status(503).json({
        status: 'error',
        error: {
          code: 'DB_UNAVAILABLE',
          message: 'Database is not available.'
        }
      });
      return null;
    }
    return db;
  }

  function getStore(db) {
    return new CrawlerProfilesStore({ db });
  }

  if (includeApiRoutes) {
    router.get(
      '/api/crawler-profiles',
      asyncHandler(async (req, res) => {
        const db = requireDb(req, res);
        if (!db) return;
        const store = getStore(db);
        const { items, activeId } = store.list();
        res.json({ status: 'ok', items, activeId });
      })
    );

    router.get(
      '/api/crawler-profiles/active',
      asyncHandler(async (req, res) => {
        const db = requireDb(req, res);
        if (!db) return;
        const store = getStore(db);
        const { activeId, activeProfile } = store.list();
        res.json({ status: 'ok', activeId, profile: activeProfile });
      })
    );

    router.post(
      '/api/crawler-profiles/active',
      asyncHandler(async (req, res) => {
        const db = requireDb(req, res);
        if (!db) return;
        const { id } = req.body || {};
        const store = getStore(db);
        const profile = store.setActive(id);
        res.json({ status: 'ok', activeId: profile.id, profile });
      })
    );

    router.post(
      '/api/crawler-profiles',
      asyncHandler(async (req, res) => {
        const db = requireDb(req, res);
        if (!db) return;
        const input = req.body || {};
        const profile = input.profile || input;
        const store = getStore(db);
        const saved = store.upsert(profile);
        res.json({ status: 'ok', profile: saved });
      })
    );

    router.delete(
      '/api/crawler-profiles/:id',
      asyncHandler(async (req, res) => {
        const db = requireDb(req, res);
        if (!db) return;
        const store = getStore(db);
        const ok = store.delete(req.params.id);
        if (!ok) {
          res.status(404).json({
            status: 'error',
            error: { code: 'NOT_FOUND', message: 'Profile not found.' }
          });
          return;
        }
        res.json({ status: 'ok' });
      })
    );

    router.post(
      '/api/crawler-profiles/bootstrap',
      asyncHandler(async (req, res) => {
        const db = requireDb(req, res);
        if (!db) return;
        const store = getStore(db);
        const result = store.bootstrapGuardianPresets();
        res.json({ status: 'ok', ...result });
      })
    );

    // Error handler for API routes.
    router.use((err, req, res, next) => {
      if (!req || !req.path || !String(req.path).startsWith('/api/crawler-profiles')) {
        next(err);
        return;
      }
      const mapped = mapError(err);
      res.status(mapped.status).json({
        status: 'error',
        error: {
          code: mapped.code,
          message: mapped.message
        }
      });
    });
  }

  if (includeRootRoute) {
    router.get('/', (req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(renderHtml());
    });
  }

  return router;
}

module.exports = {
  createCrawlerProfilesRouter
};
