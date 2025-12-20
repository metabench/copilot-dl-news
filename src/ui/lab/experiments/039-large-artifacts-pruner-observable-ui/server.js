"use strict";

const net = require("net");
const path = require("path");

const jsguiServer = require("jsgui3-server");
const { Server: JsguiServer } = jsguiServer;

const jsgui = require("./client");
const Ctrl = jsgui.controls.large_artifacts_pruner_page;

const { compileSassFileToCss } = require("../../../server/utils/sassCompiler");

const { createLargeArtifactsPruneObservable } = require("../../../../tools/largeArtifactsPruner");

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

function readQueryString(url) {
	if (typeof url !== "string") return {};
	const idx = url.indexOf("?");
	if (idx === -1) return {};
	const qs = url.slice(idx + 1);
	const out = {};
	qs.split("&")
		.map(s => s.trim())
		.filter(Boolean)
		.forEach(pair => {
			const eq = pair.indexOf("=");
			if (eq === -1) {
				out[decodeURIComponent(pair)] = "";
				return;
			}
			const k = decodeURIComponent(pair.slice(0, eq));
			const v = decodeURIComponent(pair.slice(eq + 1));
			out[k] = v;
		});
	return out;
}

class PruneSseResponder {
	constructor() {
		this._clients = new Set();
		this._history = [];
		this._runInProgress = false;
	}

	_broadcast(payload) {
		const line = `data: ${JSON.stringify(payload)}\n\n`;
		for (const res of this._clients) {
			try {
				res.write(line);
			} catch {
				// ignore
			}
		}
	}

	_pushHistory(payload) {
		this._history.push(payload);
		if (this._history.length > 50) this._history.shift();
	}

	_startRun({ apply, maxExportMb }) {
		if (this._runInProgress) return;
		this._runInProgress = true;

		const obs = createLargeArtifactsPruneObservable({
			apply,
			maxExportMb: Number.isFinite(maxExportMb) ? maxExportMb : undefined
		});

		obs.on("next", ev => {
			const payload = { type: "prune:event", data: ev, timestampMs: Date.now() };
			this._pushHistory(payload);
			this._broadcast(payload);
		});

		obs.on("error", err => {
			const payload = {
				type: "prune:event",
				data: { type: "error", message: String((err && err.message) || err) },
				timestampMs: Date.now()
			};
			this._pushHistory(payload);
			this._broadcast(payload);
			this._runInProgress = false;
		});

		obs.on("complete", () => {
			const payload = { type: "prune:complete", timestampMs: Date.now() };
			this._pushHistory(payload);
			this._broadcast(payload);
			this._runInProgress = false;
		});
	}

	handle_http(req, res) {
		if (!req || !res) return;

		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"Access-Control-Allow-Origin": "*",
			"X-Accel-Buffering": "no"
		});

		this._clients.add(res);

		// Send recent history to late joiners.
		try {
			for (const payload of this._history) {
				res.write(`data: ${JSON.stringify(payload)}\n\n`);
			}
		} catch {
			// ignore
		}

		const q = readQueryString(req.url || "");
		const wantApply = q.apply === "1" || q.apply === "true";
		const allowApply = process.env.LAB_039_ALLOW_APPLY === "1";

		const apply = Boolean(wantApply && allowApply);
		const maxExportMb = q.maxExportMb ? Number(q.maxExportMb) : undefined;

		// Always start in dry-run unless explicitly enabled.
		this._startRun({ apply, maxExportMb });

		req.on("close", () => {
			this._clients.delete(res);
		});
	}

	closeAll() {
		for (const res of this._clients) {
			try {
				res.end();
			} catch {
				// ignore
			}
		}
		this._clients.clear();
	}
}

async function startServer() {
	const sseResponder = new PruneSseResponder();

	const compiledCss = compileSassFileToCss(
		path.join(__dirname, "styles", "main.scss"),
		{ loadPaths: [path.join(__dirname, "styles")] }
	);

	const PageCtrl = class extends Ctrl {
		constructor(spec = {}, context) {
			super({ ...spec, compiledCss }, context);
		}
	};

	const server = new JsguiServer({
		Ctrl: PageCtrl,
		debug: true,
		disk_path_client_js: require.resolve("./client.js")
	});

	server.allowed_addresses = ["127.0.0.1"]; // lab
	await new Promise(resolve => server.on("ready", resolve));

	server.router.set_route("/events", sseResponder, sseResponder.handle_http);

	const port = await getFreePort();
	await new Promise((resolve, reject) => {
		server.start(port, err => (err ? reject(err) : resolve()));
	});

	const baseUrl = `http://127.0.0.1:${port}`;
	const pageUrl = `${baseUrl}/`;

	return {
		baseUrl,
		pageUrl,
		stop: async () => {
			sseResponder.closeAll();
			await new Promise(resolve => server.close(resolve));
		}
	};
}

module.exports = {
	startServer
};
