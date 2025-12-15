"use strict";

const net = require("net");
const puppeteer = require("puppeteer");

const jsguiServer = require("jsgui3-server");
const { Server: JsguiServer } = jsguiServer;
const jsgui = require("./client");

const Ctrl = jsgui.controls.data_model_mvvm_page;

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
		assert(
			"SSR includes data_model_mvvm_page",
			/data-jsgui-type=["']data_model_mvvm_page["']/.test(html)
		);
		assert(
			"SSR includes data_model_mvvm_demo",
			/data-jsgui-type=["']data_model_mvvm_demo["']/.test(html)
		);
		assert(
			"SSR includes encoded Data_Object string",
			/Data_Object\(/.test(html)
		);

		const jsBundle = await fetchText(`${baseUrl}/js/js.js`);
		assert("/js/js.js returns 200", jsBundle.status === 200, `status=${jsBundle.status}`);
		const cssBundle = await fetchText(`${baseUrl}/css/css.css`);
		assert("/css/css.css returns 200", cssBundle.status === 200, `status=${cssBundle.status}`);

		browser = await puppeteer.launch({ headless: "new" });
		const page = await browser.newPage();
		page.setDefaultTimeout(8000);

		const logs = [];
		page.on("console", msg => logs.push({ type: msg.type(), text: msg.text() }));
		page.on("pageerror", err => logs.push({ type: "pageerror", text: err.stack || err.message || String(err) }));

		await page.goto(pageUrl, { waitUntil: "load" });
		await page.waitForSelector(".data-model-mvvm");

		const activated = await page
			.waitForFunction(() => {
				const el = document.querySelector(".data-model-mvvm");
				return el && el.getAttribute("data-activated") === "1";
			})
			.then(() => true)
			.catch(() => false);
		assert("Client activation sets data-activated=1", activated);

		const initialText = await page.$eval(".data-model-mvvm__status", el => el.textContent);
		assert("Initial view shows displayCount=0", /displayCount=0/.test(initialText), `status=${initialText}`);

		await page.click(".data-model-mvvm__btn");

		// Check attribute after a short wait instead of waitForFunction to get debug info
		await new Promise(r => setTimeout(r, 500));
		const attrAfterClick = await page.$eval(".data-model-mvvm", el => el.getAttribute("data-display-count"));
		console.log(`After click, data-display-count = "${attrAfterClick}"`);

		const clickPassed = attrAfterClick === "1";
		assert("Click propagates through MVVM binding", clickPassed, `data-display-count=${attrAfterClick}`);

		const statusText = await page.$eval(".data-model-mvvm__status", el => el.textContent);
		assert("Status text shows displayCount=1", /displayCount=1/.test(statusText), `status=${statusText}`);

		if (logs.length) {
			const interesting = logs.filter(l => l.type !== "debug");
			if (interesting.length) {
				console.log("\nBrowser logs:");
				interesting.forEach(l => console.log(` [${l.type}] ${l.text}`));
			}
		}
	} finally {
		if (browser) await browser.close().catch(() => {});
		await new Promise(resolve => server.close(resolve));
	}
}

main().catch(err => {
	console.error(err);
	process.exitCode = 1;
});
