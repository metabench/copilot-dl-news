"use strict";

const net = require("net");
const puppeteer = require("puppeteer");

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
	if (typeof fetch === "function") {
		const res = await fetch(url);
		const text = await res.text();
		return { status: res.status, text };
	}

	// Fallback for older Node versions.
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

function summarizeMissingTypesFromHtml(html) {
	const missing = [];
	const withType = [];
	const re = /<([a-zA-Z0-9:-]+)([^>]*\bdata-jsgui-id=("[^"]+"|'[^']+')[^>]*)>/g;
	let m;
	while ((m = re.exec(html))) {
		const tagName = (m[1] || "").toLowerCase();
		const attrs = m[2] || "";
		const hasType = /\bdata-jsgui-type=/.test(attrs);
		(hasType ? withType : missing).push(tagName);
	}

	const countBy = (arr) => {
		const map = new Map();
		for (const key of arr) map.set(key, (map.get(key) || 0) + 1);
		return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
	};

	return {
		totalControls: missing.length + withType.length,
		missingTypeCount: missing.length,
		missingTypeTopTags: countBy(missing).slice(0, 8),
		withTypeTopTags: countBy(withType).slice(0, 8)
	};
}

async function main() {
	const server = new JsguiServer({
		Ctrl,
		debug: true,
		disk_path_client_js: require.resolve("./client.js")
	});

	server.allowed_addresses = ["127.0.0.1"];

	const readyForStart = new Promise(resolve => server.on("ready", resolve));
	await readyForStart;

	const port = await getFreePort();

	await new Promise((resolve, reject) => {
		server.start(port, err => {
			if (err) reject(err);
			else resolve();
		});
	});

	const baseUrl = `http://127.0.0.1:${port}`;
	const pageUrl = `${baseUrl}/`;

	let browser;
	try {
		const { status, text: html } = await fetchText(pageUrl);
		assert("SSR returns 200", status === 200, `status=${status}`);
		assert(
			"SSR includes activation_lab_page",
			/data-jsgui-type=["']activation_lab_page["']/.test(html)
		);
		assert(
			"SSR includes ctrl_fields_demo",
			/data-jsgui-type=["']ctrl_fields_demo["']/.test(html)
		);
		assert(
			"SSR includes data-jsgui-fields",
			html.includes("data-jsgui-fields") && html.includes("count")
		);
		assert(
			"SSR includes data-jsgui-ctrl-fields",
			html.includes("data-jsgui-ctrl-fields") && html.includes("status") && html.includes("btn")
		);

		const typeSummary = summarizeMissingTypesFromHtml(html);
		if (typeSummary.missingTypeCount > 0) {
			console.log("\nSSR diagnostics: elements with data-jsgui-id but missing data-jsgui-type");
			console.log(JSON.stringify(typeSummary, null, 2));
		}

		const jsBundle = await fetchText(`${baseUrl}/js/js.js`);
		assert("/js/js.js returns 200", jsBundle.status === 200, `status=${jsBundle.status}`);
		if (jsBundle.status === 200 && /Tautologistics/.test(jsBundle.text)) {
			console.log("\nNote: /js/js.js contains 'Tautologistics' (cookiejar-related); may break browser execution.");
		}

		const cssBundle = await fetchText(`${baseUrl}/css/css.css`);
		assert("/css/css.css returns 200", cssBundle.status === 200, `status=${cssBundle.status}`);

		browser = await puppeteer.launch({ headless: "new" });
		const page = await browser.newPage();
		page.setDefaultTimeout(8000);

		const logs = [];
		page.on("console", msg => logs.push({ type: msg.type(), text: msg.text() }));
		page.on("pageerror", err => logs.push({ type: "pageerror", text: err.stack || err.message || String(err) }));

		await page.goto(pageUrl, { waitUntil: "load" });

		await page.waitForSelector(".ctrl-fields-demo");

		const activated = await page
			.waitForFunction(
				() => {
					const el = document.querySelector(".ctrl-fields-demo");
					return el && el.getAttribute("data-activated") === "1";
				},
				{ timeout: 12000 }
			)
			.then(() => true)
			.catch(() => false);
		assert("Client activation sets data-activated=1", activated);

		if (!activated) {
			const sample = await page.content();
			console.log("\nActivation did not complete; HTML sample:");
			console.log(sample.slice(0, 900) + "...");
			console.log("\nFirst 900 chars of /js/js.js:");
			console.log(jsBundle.text.slice(0, 900) + "...");

			if (logs.length) {
				console.log("\nBrowser logs:");
				logs.forEach(l => console.log(` [${l.type}] ${l.text}`));
			}
			throw new Error("Activation did not set data-activated=1");
		}

		await page.click(".ctrl-fields-demo__btn");
		await page.waitForFunction(() => {
			const el = document.querySelector(".ctrl-fields-demo");
			return el && el.getAttribute("data-count") === "1";
		});

		const statusText = await page.$eval(".ctrl-fields-demo__status", el => el.textContent);
		assert("Click increments data-count", true);
		assert("Click updates status text (ctrl_fields)", /count=1/.test(statusText), `status=${statusText}`);

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
