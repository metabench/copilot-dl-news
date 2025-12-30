"use strict";

const net = require("net");

const jsguiServer = require("jsgui3-server");
const { Server: JsguiServer } = jsguiServer;

const jsgui = require("./client");
const Ctrl = jsgui.controls.perf_graph_page;

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

class PerfGraphSseResponder {
	constructor({ initialPayloadsProvider, onClientConnected }) {
		this._clients = new Set();
		this._initialPayloadsProvider = initialPayloadsProvider;
		this._onClientConnected = onClientConnected;
	}

	broadcast(payload) {
		const line = `data: ${JSON.stringify(payload)}\n\n`;
		for (const res of this._clients) {
			try {
				res.write(line);
			} catch {
				// ignore
			}
		}
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
		if (this._onClientConnected) {
			try {
				this._onClientConnected(req);
			} catch {
				// ignore
			}
		}

		try {
			const initial = this._initialPayloadsProvider ? this._initialPayloadsProvider(req) : [];
			for (const payload of initial) {
				res.write(`data: ${JSON.stringify(payload)}\n\n`);
			}
		} catch {
			// ignore
		}

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

function parseQuery(url) {
	try {
		const u = new URL(url, "http://127.0.0.1");
		return u.searchParams;
	} catch {
		return new URLSearchParams();
	}
}

function coerceInt(value, fallback) {
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(0, Math.floor(n));
}

function coerceEnum(value, allowed, fallback) {
	const v = typeof value === "string" ? value.trim().toLowerCase() : "";
	return allowed.includes(v) ? v : fallback;
}

function createNodePayloads({ totalNodes, durationMs, tickMs, mode, batchSize = 0, payloadBytes = 0 }) {
	const startedAt = Date.now();
	// Emit based on elapsed time rather than assuming tick cadence.
	// This prevents under-emission when the event loop is busy (setInterval slippage).
	const nominalRatePerMs = durationMs > 0 ? totalNodes / durationMs : totalNodes;

	const payloadLabel = payloadBytes > 0 ? "x".repeat(payloadBytes) : null;

	let seq = 0;
	let nextId = 0;
	let interval = null;

	const stop = () => {
		if (interval) clearInterval(interval);
		interval = null;
	};

	const start = (emit) => {
		stop();

		emit({ type: "stage", seq: ++seq, timestampMs: Date.now(), data: { stage: "discover", status: "started" } });
		emit({
			type: "config",
			seq: ++seq,
			timestampMs: Date.now(),
			data: { totalNodes, durationMs, tickMs, mode, batchSize, payloadBytes, nominalRatePerMs }
		});

		interval = setInterval(() => {
			const now = Date.now();
			const elapsed = now - startedAt;
			const targetCount = Math.min(totalNodes, Math.floor(elapsed * nominalRatePerMs));
			const shouldFinish = elapsed >= durationMs;
			const finalTarget = shouldFinish ? totalNodes : targetCount;

			const batch = [];
			while (nextId < finalTarget) {
				const id = nextId;
				nextId += 1;
				const node = { id };
				if (payloadLabel) node.label = payloadLabel;
				batch.push(node);
			}

			if (mode === "single") {
				for (const node of batch) {
					emit({ type: "node", seq: ++seq, timestampMs: now, data: node });
				}
			} else {
				if (batch.length) {
					const maxChunk = Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : 0;
					if (!maxChunk) {
						emit({ type: "nodes", seq: ++seq, timestampMs: now, data: { nodes: batch } });
					} else {
						for (let i = 0; i < batch.length; i += maxChunk) {
							emit({ type: "nodes", seq: ++seq, timestampMs: now, data: { nodes: batch.slice(i, i + maxChunk) } });
						}
					}
				}
			}

			// Emit coarse progress occasionally.
			if (seq % 10 === 0) {
				emit({
					type: "stage",
					seq: ++seq,
					timestampMs: now,
					data: { stage: "discover", status: "progress", discovered: nextId, totalNodes }
				});
			}

			if (nextId >= totalNodes || elapsed >= durationMs) {
				stop();
				emit({ type: "stage", seq: ++seq, timestampMs: Date.now(), data: { stage: "discover", status: "finished", discovered: nextId, totalNodes } });
				emit({ type: "done", seq: ++seq, timestampMs: Date.now(), data: { discovered: nextId, totalNodes } });
			}
		}, tickMs);
		interval.unref();

		return stop;
	};

	return { start, stop };
}

async function startServer({ totalNodes = 1000, durationMs = 1000, tickMs = 20, mode = "batch", batchSize = 0, payloadBytes = 0 } = {}) {
	let latest = null;
	const history = [];
	const pushHistory = (payload) => {
		history.push(payload);
		if (history.length > 5) history.shift();
		latest = payload;
	};

	let emitter = null;
	let emitterStarted = false;

	const sseResponder = new PerfGraphSseResponder({
		initialPayloadsProvider: () => (latest ? [latest] : history.slice()),
		onClientConnected: (req) => {
			if (emitterStarted) return;
			emitterStarted = true;
			console.log(`[lab-041] SSE client connected: ${req && req.url ? req.url : "(unknown url)"}`);
			emitter = createNodePayloads({ totalNodes, durationMs, tickMs, mode, batchSize, payloadBytes });
			emitter.start((payload) => {
				pushHistory(payload);
				if (payload && payload.type === "done") {
					console.log(
						`[lab-041] done emitted (seq=${payload.seq}) mode=${mode} discovered=${payload.data && payload.data.discovered}`
					);
				}
				sseResponder.broadcast(payload);
			});
		}
	});

	const server = new JsguiServer({
		Ctrl,
		debug: true,
		disk_path_client_js: require.resolve("./client.js")
	});

	server.allowed_addresses = ["127.0.0.1"];
	await new Promise((resolve) => server.on("ready", resolve));

	server.router.set_route("/events", sseResponder, sseResponder.handle_http);

	// Provide a config endpoint so the browser can confirm parameters when needed.
	server.router.set_route("/api/config", {
		handle_http: (req, res) => {
			const params = parseQuery(req && req.url ? req.url : "");
			const qNodes = coerceInt(params.get("nodes"), totalNodes);
			const qMs = coerceInt(params.get("ms"), durationMs);
			const qTick = coerceInt(params.get("tick"), tickMs);
			const qMode = coerceEnum(params.get("mode"), ["single", "batch"], mode);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ nodes: qNodes, ms: qMs, tick: qTick, mode: qMode }));
		}
	});

	const port = await getFreePort();
	await new Promise((resolve, reject) => {
		server.start(port, (err) => (err ? reject(err) : resolve()));
	});

	const baseUrl = `http://127.0.0.1:${port}`;
	// Note: jsgui3-server routing matches req.url literally, so '/?x=1' will not hit '/'.
	// Keep the page URL query-free; the server-side emitter configuration is still applied.
	const pageUrl = `${baseUrl}/`;

	return {
		baseUrl,
		pageUrl,
		stop: async () => {
			if (emitter) emitter.stop();
			sseResponder.closeAll();
			await new Promise((resolve) => server.close(resolve));
		}
	};
}

module.exports = {
	startServer
};
