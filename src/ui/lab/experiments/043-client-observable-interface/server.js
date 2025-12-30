"use strict";

const net = require("net");
const path = require("path");

const express = require("express");

// Reuse the battle-tested remote observable server from Lab 042.
const { createRemoteObservableServer } = require("../042-remote-observable-both-ends/framework/server");

async function getFreePort() {
	return await new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.unref();
		srv.on("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			const address = srv.address();
			srv.close(() => resolve(address.port));
		});
	});
}

function renderPageHtml() {
	return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lab 043 Client Observable Interface</title>
  <link rel="icon" href="data:," />
  <style>
    body { background: #0f0f0f; color: #e7e7e7; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 16px; }
    .card { border: 1px solid #2a2a2a; background: #121212; border-radius: 12px; padding: 12px; max-width: 860px; }
    .title { font-weight: 650; margin-bottom: 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .panel { border: 1px solid #242424; border-radius: 10px; padding: 10px; background: #101010; }
    .panel h3 { margin: 0 0 6px 0; font-size: 13px; font-weight: 650; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 12px; }
    .ok { color: #6cc070; }
    .bad { color: #ff7a7a; }
    .muted { color: #aaa; }
    .kv { display: flex; gap: 10px; flex-wrap: wrap; }
    .kv span { display: inline-flex; gap: 6px; align-items: baseline; }
  </style>
  <script src="/shared-remote-obs/RemoteObservableShared.js"></script>
  <script src="/shared-remote-obs/RemoteObservableClient.js"></script>
  <script src="/shared-remote-obs/RemoteObservableClientAdapters.js"></script>
</head>
<body>
  <div class="card client-obs-lab" data-activated="1" data-pass="0">
    <div class="title">Lab 043 — Client-side Observable Interfaces over SSE</div>

    <div class="kv mono">
      <span>basePath=<span class="muted" data-k="base">/api/remote-obs</span></span>
      <span>status=<span class="muted" data-k="status">running tests…</span></span>
    </div>

    <div class="grid" style="margin-top: 12px;">
      <div class="panel">
        <h3>Evented-Class style (.on/.off/.raise)</h3>
        <div class="mono" data-k="evented">pending…</div>
      </div>
      <div class="panel">
        <h3>Rx style (subscribe/unsubscribe)</h3>
        <div class="mono" data-k="rx">pending…</div>
      </div>
      <div class="panel">
        <h3>Async iterator (for await)</h3>
        <div class="mono" data-k="async">pending…</div>
      </div>
      <div class="panel">
        <h3>Notes</h3>
        <div class="mono muted">Goal: present observable-like interfaces client-side without forcing a heavyweight dependency; align with jsgui3 event patterns.</div>
      </div>
    </div>

    <pre class="mono" data-k="log" style="margin-top: 12px; background:#0c0c0c; border:1px solid #222; border-radius:10px; padding:10px; max-height: 220px; overflow:auto;">(log)\n</pre>
  </div>

  <script>
    (function () {
      const root = document.querySelector('.client-obs-lab');
      const elStatus = document.querySelector('[data-k="status"]');
      const elLog = document.querySelector('[data-k="log"]');
      const elEvented = document.querySelector('[data-k="evented"]');
      const elRx = document.querySelector('[data-k="rx"]');
      const elAsync = document.querySelector('[data-k="async"]');

      const basePath = '/api/remote-obs';

      function log(line) {
        if (elLog) elLog.textContent += String(line) + "\\n";
      }

      function setResult(el, ok, text) {
        if (!el) return;
        el.textContent = (ok ? 'PASS: ' : 'FAIL: ') + text;
        el.className = 'mono ' + (ok ? 'ok' : 'bad');
      }

      async function testEvented() {
        const c = window.RemoteObservableClientAdapters.createRemoteObservableConnection({ basePath });
        const ev = window.RemoteObservableClientAdapters.toEvented(c);

        let seen = 0;
        ev.on('next', () => { seen += 1; });

        const ok = await window.RemoteObservableClientAdapters.waitFor(() => seen >= 2, { timeoutMs: 8000 });
        ev.close();
        return { ok, detail: 'seen next=' + seen };
      }

      async function testRx() {
        const c = window.RemoteObservableClientAdapters.createRemoteObservableConnection({ basePath });
        const rx = window.RemoteObservableClientAdapters.toRx(c);

        let seen = 0;
        const sub = rx.subscribe({ next: () => { seen += 1; } });

        const ok1 = await window.RemoteObservableClientAdapters.waitFor(() => seen >= 3, { timeoutMs: 8000 });
        const before = seen;
        sub.unsubscribe();

        await new Promise(r => setTimeout(r, 350));
        const after = seen;
        const ok2 = after === before;

        return { ok: ok1 && ok2, detail: 'before=' + before + ' after=' + after };
      }

      async function testAsyncIter() {
        const c = window.RemoteObservableClientAdapters.createRemoteObservableConnection({ basePath });
        const iter = window.RemoteObservableClientAdapters.toAsyncIterator(c);

        let got = 0;
        try {
          for await (const value of iter) {
            if (value && typeof value.counter === 'number') {
              got += 1;
            }
            if (got >= 3) break;
          }
        } finally {
          try { await iter.return(); } catch (_) {}
        }

        return { ok: got >= 3, detail: 'got next values=' + got };
      }

      async function run() {
        const results = { evented: null, rx: null, async: null };

        try {
          log('starting tests…');

          results.evented = await testEvented();
          setResult(elEvented, results.evented.ok, results.evented.detail);
          log('evented: ' + (results.evented.ok ? 'ok' : 'fail') + ' ' + results.evented.detail);

          results.rx = await testRx();
          setResult(elRx, results.rx.ok, results.rx.detail);
          log('rx: ' + (results.rx.ok ? 'ok' : 'fail') + ' ' + results.rx.detail);

          results.async = await testAsyncIter();
          setResult(elAsync, results.async.ok, results.async.detail);
          log('async: ' + (results.async.ok ? 'ok' : 'fail') + ' ' + results.async.detail);

          const pass = !!(results.evented.ok && results.rx.ok && results.async.ok);
          root.setAttribute('data-pass', pass ? '1' : '0');
          if (elStatus) elStatus.textContent = pass ? 'PASS' : 'FAIL';
          window.__lab043 = { pass, results };
        } catch (e) {
          root.setAttribute('data-pass', '0');
          if (elStatus) elStatus.textContent = 'FAIL (exception)';
          window.__lab043 = { pass: false, error: String((e && e.message) || e) };
          log('exception: ' + String((e && e.stack) || (e && e.message) || e));
        }
      }

      run();
    })();
  </script>
</body>
</html>`;
}

async function startServer() {
	const app = express();

	const remote = createRemoteObservableServer();
	remote.mountExpress(app, "/api/remote-obs");

  app.use(
    "/shared-remote-obs",
    express.static(path.join(__dirname, "..", "..", "..", "client", "remoteObservable", "browser"))
  );

	app.use("/public", express.static(path.join(__dirname, "public")));

	app.get("/", (req, res) => {
		res.status(200).set("Content-Type", "text/html; charset=utf-8").send(renderPageHtml());
	});

	const port = await getFreePort();
	const server = await new Promise((resolve, reject) => {
		const s = app.listen(port, "127.0.0.1", err => (err ? reject(err) : resolve(s)));
	});

	const baseUrl = `http://127.0.0.1:${port}`;
	const pageUrl = `${baseUrl}/`;

	return {
		baseUrl,
		pageUrl,
		stop: async () => {
			remote.stop();
			await new Promise(resolve => server.close(resolve));
		}
	};
}

module.exports = {
	startServer
};
