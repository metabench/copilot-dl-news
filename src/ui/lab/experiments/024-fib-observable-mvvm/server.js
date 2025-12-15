"use strict";

const http = require("http");
const net = require("net");

const { observable } = require("fnl");

const jsguiServer = require("jsgui3-server");
const { Server: JsguiServer } = jsguiServer;
const jsgui = require("./client");

const Ctrl = jsgui.controls.fib_mvvm_page;

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

function fibGenerator() {
	let index = 0;
	let a = 0n;
	let b = 1n;
	return () => {
		const current = { index, value: a };
		index += 1;
		const next = a + b;
		a = b;
		b = next;
		return current;
	};
}

function createFibObservable({ tickMs }) {
	const nextFib = fibGenerator();
	let interval = null;

	const obs = observable((next, complete, error) => {
		try {
			interval = setInterval(() => {
				try {
					next(nextFib());
				} catch (e) {
					error(e);
				}
			}, tickMs);
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

async function startSseServer({ tickMs = 330 }) {
	const clients = new Set();
	let latest = { index: 0, value: "0" };

	const { obs, stop: stopObs } = createFibObservable({ tickMs });
	obs.on("next", data => {
		latest = { index: data.index, value: String(data.value) };
		const payload = JSON.stringify(latest);
		for (const res of clients) {
			res.write(`data: ${payload}\n\n`);
		}
	});

	const server = http.createServer((req, res) => {
		if (!req.url) {
			res.statusCode = 400;
			res.end("Missing url");
			return;
		}

		if (req.url === "/events") {
			res.writeHead(200, {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache, no-transform",
				Connection: "keep-alive",
				"Access-Control-Allow-Origin": "*",
				"X-Accel-Buffering": "no"
			});

			clients.add(res);
			res.write(`data: ${JSON.stringify(latest)}\n\n`);

			req.on("close", () => {
				clients.delete(res);
			});
			return;
		}

		res.statusCode = 404;
		res.setHeader("Content-Type", "text/plain; charset=utf-8");
		res.end("Not found");
	});

	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	const port = server.address().port;
	const url = `http://127.0.0.1:${port}/events`;

	return {
		url,
		stop: async () => {
			for (const res of clients) {
				try {
					res.end();
				} catch {
					// ignore
				}
			}
			clients.clear();
			stopObs();
			await new Promise(resolve => server.close(resolve));
		}
	};
}

async function startServer({ tickMs = 330 } = {}) {
	const sse = await startSseServer({ tickMs });
	process.env.JSGUI_LAB_FIB_SSE_URL = sse.url;

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
