"use strict";

const net = require("net");
const path = require("path");
const fs = require("fs");

const jsguiServer = require("jsgui3-server");
const { Server: JsguiServer } = jsguiServer;

const jsgui = require("./client");
const Ctrl = jsgui.controls.remote_observable_page;

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

function serveJsFile(absPath) {
	return (req, res) => {
		try {
			const buf = fs.readFileSync(absPath);
			res.statusCode = 200;
			res.setHeader("Content-Type", "application/javascript; charset=utf-8");
			res.setHeader("Cache-Control", "no-cache");
			res.end(buf);
		} catch (e) {
			res.statusCode = 404;
			res.end(String((e && e.message) || e));
		}
	};
}

async function startServer() {
	const server = new JsguiServer({
		Ctrl,
		debug: false,
		disk_path_client_js: require.resolve("./client.js")
	});

	server.allowed_addresses = ["127.0.0.1"];
	await new Promise(resolve => server.on("ready", resolve));

	const remote = createRemoteObservableServer();
	remote.mountJsgui3(server, "/api/remote-obs");

	// Serve lab framework scripts without bundling.
	const publicDir = path.join(__dirname, "public");
	server.router.set_route("/public/shared.js", null, serveJsFile(path.join(publicDir, "shared.js")));
	server.router.set_route(
		"/public/clientRemoteObservable.js",
		null,
		serveJsFile(path.join(publicDir, "clientRemoteObservable.js"))
	);

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
			remote.stop();
			await new Promise(resolve => server.close(resolve));
		}
	};
}

module.exports = {
	startServer
};
