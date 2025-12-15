"use strict";

const net = require("net");
const express = require("express");

const jsguiServer = require("jsgui3-server");
const { Server: JsguiServer } = jsguiServer;

const { TelemetryIntegration } = require("../../../../crawler/telemetry");

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

async function startSseServer({ tickMs = 90 } = {}) {
	const app = express();
	const integration = new TelemetryIntegration({
		historyLimit: 100,
		heartbeatInterval: 30000,
		allowOrigin: "*",
		bridgeOptions: {
			progressBatchInterval: 25,
			broadcastUrlEvents: false
		}
	});

	integration.mountSSE(app, "/events");

	const server = await new Promise(resolve => {
		const s = app.listen(0, "127.0.0.1", () => resolve(s));
	});

	const port = server.address().port;
	const url = `http://127.0.0.1:${port}/events`;

	// Deterministic simulation: indeterminate → determinate.
	const jobId = "lab-027";
	const crawlType = "lab";

	integration.bridge.emitStarted({ jobId, crawlType, startUrl: "https://example.com" }, { jobId, crawlType });
	integration.bridge.emitPhaseChange("crawling", { jobId, crawlType });

	let tick = 0;
	const interval = setInterval(() => {
		tick += 1;
		const visited = tick * 5;
		const queued = Math.max(0, 50 - tick * 2);
		// Keep percentComplete null initially to exercise indeterminate UI.
		const percentComplete = tick < 8 ? null : Math.min(100, (tick - 7) * 10);

		integration.bridge.emitProgress(
			{ visited, queued, errors: 0, downloaded: visited, percentComplete },
			{ jobId, crawlType }
		);

		if (tick >= 10) {
			clearInterval(interval);
			integration.bridge.emitPhaseChange("finalizing", { jobId, crawlType });
			integration.bridge.emitStopped({ reason: "lab-complete" }, { jobId, crawlType });
		}
	}, tickMs);
	interval.unref();

	return {
		url,
		stop: async () => {
			clearInterval(interval);
			integration.destroy();
			await new Promise(resolve => server.close(resolve));
		}
	};
}

async function startServer({ tickMs = 90 } = {}) {
	const sse = await startSseServer({ tickMs });
	process.env.JSGUI_LAB_CRAWL_SSE_URL = sse.url;

	const server = new JsguiServer({
		Ctrl,
		debug: true,
		disk_path_client_js: require.resolve("./client.js")
	});

	server.allowed_addresses = ["127.0.0.1"];
	await new Promise(resolve => server.on("ready", resolve));

	const port = await getFreePort();
	await new Promise((resolve, reject) => {
		server.start(port, err => (err ? reject(err) : resolve()));
	});

	const baseUrl = `http://127.0.0.1:${port}`;
	const pageUrl = `${baseUrl}/`;

	return {
		baseUrl,
		pageUrl,
		sseUrl: sse.url,
		stop: async () => {
			await new Promise(resolve => server.close(resolve));
			await sse.stop();
		}
	};
}

module.exports = {
	startServer
};
