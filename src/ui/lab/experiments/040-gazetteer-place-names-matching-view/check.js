"use strict";

const net = require("net");

const jsguiServer = require("jsgui3-server");
const { Server: JsguiServer } = jsguiServer;

const jsgui = require("./client");
const Ctrl = jsgui.controls.activation_lab_page;

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

async function fetchText(url) {
	const res = await fetch(url);
	return { status: res.status, text: await res.text() };
}

function assert(label, condition, detail) {
	const status = condition ? "✅" : "❌";
	console.log(`${status} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!condition) process.exitCode = 1;
}

async function main() {
	const server = new JsguiServer({
		Ctrl,
		debug: false,
		disk_path_client_js: require.resolve("./client.js")
	});

	server.allowed_addresses = ["127.0.0.1"];

	await new Promise(resolve => server.on("ready", resolve));
	const port = await getFreePort();

	await new Promise((resolve, reject) => {
		server.start(port, err => (err ? reject(err) : resolve()));
	});

	const baseUrl = `http://127.0.0.1:${port}`;

	try {
		const { status, text: html } = await fetchText(`${baseUrl}/`);
		assert("SSR returns 200", status === 200, `status=${status}`);
		assert(
			"SSR includes place_names_match_view_page",
			/data-jsgui-type=["']place_names_match_view_page["']/.test(html)
		);
		assert("SSR includes Match inspector", /Match inspector/.test(html));
		assert("SSR includes Names by language", /Names by language/.test(html));
	} finally {
		await new Promise(resolve => server.close(resolve));
	}
}

main().catch(err => {
	console.error(err);
	process.exitCode = 1;
});
