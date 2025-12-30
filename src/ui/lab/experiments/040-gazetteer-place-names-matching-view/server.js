"use strict";

const jsguiServer = require("jsgui3-server");
const { Server: JsguiServer } = jsguiServer;

const jsgui = require("./client");
const Ctrl = jsgui.controls.activation_lab_page;

function startServer({ port = 3410 } = {}) {
	const server = new JsguiServer({
		Ctrl,
		debug: true,
		disk_path_client_js: require.resolve("./client.js")
	});

	server.allowed_addresses = ["127.0.0.1"];

	server.on("ready", () => {
		server.start(port, err => {
			if (err) {
				console.error(err);
				process.exitCode = 1;
				return;
			}
			console.log(`Lab 040 running: http://127.0.0.1:${port}`);
		});
	});

	return server;
}

if (require.main === module) {
	const port = Number(process.env.PORT || 3410);
	startServer({ port });
}

module.exports = { startServer };
