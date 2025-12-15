"use strict";

const net = require("net");

const { observable } = require("fnl");

const jsguiServer = require("jsgui3-server");
const { Server: JsguiServer } = jsguiServer;

const jsgui = require("./client");
const Ctrl = jsgui.controls.crawl_progress_page;

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

function createTelemetryObservable({ tickMs }) {
	const jobId = "lab-028";
	const crawlType = "lab";

	let interval = null;
	let tick = 0;

	const obs = observable((next, complete, error) => {
		try {
			// Prime: started + phase.
			next({
				type: "crawl:started",
				jobId,
				crawlType,
				data: { jobId, crawlType, startUrl: "https://example.com" },
				timestampMs: Date.now()
			});
			next({
				type: "crawl:phase:changed",
				jobId,
				crawlType,
				data: { phase: "crawling" },
				timestampMs: Date.now()
			});

			interval = setInterval(() => {
				try {
					tick += 1;
					const visited = tick * 5;
					const queued = Math.max(0, 50 - tick * 2);
					const percentComplete = tick < 8 ? null : Math.min(100, (tick - 7) * 10);

					next({
						type: "crawl:progress",
						jobId,
						crawlType,
						data: { visited, queued, errors: 0, downloaded: visited, percentComplete },
						timestampMs: Date.now()
					});

					if (tick >= 10) {
						clearInterval(interval);
						interval = null;
						next({
							type: "crawl:phase:changed",
							jobId,
							crawlType,
							data: { phase: "finalizing" },
							timestampMs: Date.now()
						});
						next({
							type: "crawl:stopped",
							jobId,
							crawlType,
							data: { reason: "lab-complete" },
							timestampMs: Date.now()
						});
						complete();
					}
				} catch (e) {
					error(e);
				}
			}, tickMs);
			interval.unref();
		} catch (e) {
			error(e);
		}

		return () => {
			if (interval) clearInterval(interval);
			interval = null;
			complete();
		};
	});

	return {
		obs,
		stop: () => {
			if (interval) clearInterval(interval);
			interval = null;
		}
	};
}

class CrawlTelemetrySseResponder {
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
				// ignore (client likely disconnected)
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
				this._onClientConnected();
			} catch {
				// ignore
			}
		}

		try {
			const initial = this._initialPayloadsProvider ? this._initialPayloadsProvider() : [];
			for (const payload of initial) {
				res.write(`data: ${JSON.stringify(payload)}\n\n`);
			}
		} catch {
			// ignore initial send failures
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

async function startServer({ tickMs = 90 } = {}) {
	let latest = null;
	const history = [];
	const pushHistory = (payload) => {
		history.push(payload);
		if (history.length > 3) history.shift();
		latest = payload;
	};

	let telemetry = null;
	let telemetryStarted = false;
	const startTelemetryIfNeeded = () => {
		if (telemetryStarted) return;
		telemetryStarted = true;
		telemetry = createTelemetryObservable({ tickMs });
		telemetry.obs.on("next", ev => {
			const payload = { type: "crawl:telemetry", data: ev, timestampMs: Date.now() };
			pushHistory(payload);
			sseResponder.broadcast(payload);
		});

		telemetry.obs.on("error", err => {
			const payload = {
				type: "crawl:telemetry",
				data: { type: "crawl:error", jobId: "lab-028", data: { message: String((err && err.message) || err) } },
				timestampMs: Date.now()
			};
			pushHistory(payload);
			sseResponder.broadcast(payload);
		});
	};

	const sseResponder = new CrawlTelemetrySseResponder({
		initialPayloadsProvider: () => (latest ? [latest] : history.slice()),
		onClientConnected: startTelemetryIfNeeded
	});

	const server = new JsguiServer({
		Ctrl,
		debug: true,
		disk_path_client_js: require.resolve("./client.js")
	});

	server.allowed_addresses = ["127.0.0.1"];
	await new Promise(resolve => server.on("ready", resolve));

	// Mount SSE route on the jsgui3-server router (no Express).
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
			if (telemetry) telemetry.stop();
			sseResponder.closeAll();
			await new Promise(resolve => server.close(resolve));
		}
	};
}

module.exports = {
	startServer
};
