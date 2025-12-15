"use strict";

const net = require("net");
const puppeteer = require("puppeteer");

const jsguiServer = require("jsgui3-server");
const { Server: JsguiServer } = jsguiServer;
const jsgui = require("./client");

const Ctrl = jsgui.controls.mvvm_bindings_page;

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
	if (typeof fetch === "function") {
		const res = await fetch(url);
		const text = await res.text();
		return { status: res.status, text };
	}

	const http = require("http");
	return await new Promise((resolve, reject) => {
		http
			.get(url, res => {
				let buf = "";
				res.setEncoding("utf8");
				res.on("data", d => (buf += d));
				res.on("end", () => resolve({ status: res.statusCode, text: buf }));
			})
			.on("error", reject);
	});
}

function assert(label, condition, detail) {
	const status = condition ? "✅" : "❌";
	console.log(`${status} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!condition) process.exitCode = 1;
}

async function main() {
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

	let browser;
	try {
		const { status, text: html } = await fetchText(pageUrl);
		assert("SSR returns 200", status === 200, `status=${status}`);
		assert("SSR includes mvvm_bindings_page", /data-jsgui-type=["']mvvm_bindings_page["']/.test(html));
		assert("SSR includes mvvm_bindings_demo", /data-jsgui-type=["']mvvm_bindings_demo["']/.test(html));
		assert("SSR includes encoded Data_Object string", /Data_Object\(/.test(html));

		const jsBundle = await fetchText(`${baseUrl}/js/js.js`);
		assert("/js/js.js returns 200", jsBundle.status === 200, `status=${jsBundle.status}`);

		browser = await puppeteer.launch({ headless: "new" });
		const page = await browser.newPage();
		page.setDefaultTimeout(8000);

		const logs = [];
		page.on("console", msg => logs.push({ type: msg.type(), text: msg.text() }));
		page.on("pageerror", err => logs.push({ type: "pageerror", text: err.stack || err.message || String(err) }));

		await page.goto(pageUrl, { waitUntil: "load" });
		await page.waitForSelector(".mvvm-bindings");

		const activated = await page
			.waitForFunction(() => {
				const el = document.querySelector(".mvvm-bindings");
				return el && el.getAttribute("data-activated") === "1";
			})
			.then(() => true)
			.catch(() => false);
		assert("Client activation sets data-activated=1", activated);

		const initial = await page.$eval(".mvvm-bindings__status", el => el.textContent);
		assert("Initial view shows displayCount=0", /displayCount=0/.test(initial), `status=${initial}`);

		await page.click(".mvvm-bindings__btn");
		await new Promise(r => setTimeout(r, 500));

		const attrAfter = await page.$eval(".mvvm-bindings", el => el.getAttribute("data-display-count"));
		assert("Click updates data-display-count", attrAfter === "1", `data-display-count=${attrAfter}`);

		const statusAfter = await page.$eval(".mvvm-bindings__status", el => el.textContent);
		assert("Click updates text via bindings", /displayCount=1/.test(statusAfter), `status=${statusAfter}`);

		// jsgui3 may log generic-constructor warnings for plain tag controls (style/main/etc).
		// Treat it as a failure only if it involves this experiment's custom types.
		const noise = logs.filter(l => {
			const text = l && l.text ? l.text : "";
			if (!/Missing context\.map_Controls|generic Control/i.test(text)) return false;
			return /\bmvvm_bindings_(page|demo)\b/i.test(text);
		});
		assert("No activation warnings for custom controls", noise.length === 0, noise.map(n => n.text).join(" | "));
	} finally {
		if (browser) await browser.close().catch(() => {});
		await new Promise(resolve => server.close(resolve));
	}
}

main().catch(err => {
	console.error(err);
	process.exitCode = 1;
});
