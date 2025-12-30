"use strict";

const net = require("net");
const path = require("path");

const express = require("express");

const { createRemoteObservableServer } = require("./framework/server");

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
  <title>Lab 042 Remote Observable (Express)</title>
  <link rel="icon" href="data:," />
  <style>
    body { background: #0f0f0f; color: #e7e7e7; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 16px; }
    .remote-obs-demo { display: inline-flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid #2a2a2a; border-radius: 10px; background: #121212; min-width: 420px; }
    .remote-obs-demo__title { font-weight: 600; }
    .remote-obs-demo__summary { font-variant-numeric: tabular-nums; opacity: 0.9; }
    .remote-obs-demo__buttons { display: flex; gap: 8px; }
    .remote-obs-demo__btn { background: #1b1b1b; border: 1px solid #333; border-radius: 8px; color: #e7e7e7; padding: 6px 10px; cursor: pointer; }
    .remote-obs-demo__btn:hover { border-color: #555; }
    .remote-obs-demo__log { background: #0c0c0c; border: 1px solid #222; border-radius: 10px; padding: 10px; max-height: 140px; overflow: auto; font-size: 12px; }
  </style>
  <script src="/public/shared.js"></script>
  <script src="/public/clientRemoteObservable.js"></script>
</head>
<body>
  <section class="remote-obs-demo" data-activated="1" data-status="connecting" data-counter="0">
    <div class="remote-obs-demo__title">Remote Observable: server fnl.observable → SSE → client observable</div>
    <div class="remote-obs-demo__summary">counter=0 status=connecting (express)</div>
    <div class="remote-obs-demo__buttons">
      <button class="remote-obs-demo__btn" data-action="pause">Pause</button>
      <button class="remote-obs-demo__btn" data-action="resume">Resume</button>
      <button class="remote-obs-demo__btn" data-action="cancel">Cancel</button>
    </div>
    <pre class="remote-obs-demo__log">(log)\n</pre>
  </section>

  <script>
    (function () {
      const root = document.querySelector('.remote-obs-demo');
      const summaryEl = document.querySelector('.remote-obs-demo__summary');
      const logEl = document.querySelector('.remote-obs-demo__log');
      const pauseEl = document.querySelector('button[data-action="pause"]');
      const resumeEl = document.querySelector('button[data-action="resume"]');
      const cancelEl = document.querySelector('button[data-action="cancel"]');

      const basePath = '/api/remote-obs';
      const sseUrl = basePath + '/events';
      const cmdUrl = basePath + '/command';

      function append(line) {
        if (!logEl) return;
        logEl.textContent += line + "\\n";
      }

      function render(counter, status) {
        root.setAttribute('data-counter', String(counter));
        root.setAttribute('data-status', String(status));
        if (summaryEl) summaryEl.textContent = 'counter=' + counter + ' status=' + status + ' (express)';
      }

      const client = window.createRemoteObservableClient({ url: sseUrl });
      let lastCounter = 0;
      let lastStatus = 'connecting';

      client.obs.on('info', (msg) => append('info ' + ((msg && msg.type) || '')));
      client.obs.on('next', (value) => {
        if (value && typeof value.counter === 'number') lastCounter = value.counter;
        if (value && typeof value.status === 'string') lastStatus = value.status;
        render(lastCounter, lastStatus);
      });
      client.obs.on('error', () => { lastStatus = 'error'; render(lastCounter, lastStatus); });
      client.obs.on('complete', () => { lastStatus = 'complete'; render(lastCounter, lastStatus); });

      client.connect();

      async function cmd(name, payload) {
        try {
          await client.command(cmdUrl, name, payload);
          append('cmd ' + name);
        } catch (e) {
          append('cmd ' + name + ' failed: ' + String((e && e.message) || e));
        }
      }

      if (pauseEl) pauseEl.addEventListener('click', () => cmd('pause'));
      if (resumeEl) resumeEl.addEventListener('click', () => cmd('resume'));
      if (cancelEl) cancelEl.addEventListener('click', () => cmd('cancel'));
    })();
  </script>
</body>
</html>`;
}

async function startServer() {
	const app = express();
	const remote = createRemoteObservableServer();
	remote.mountExpress(app, "/api/remote-obs");

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
