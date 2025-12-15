"use strict";

const net = require("net");
const puppeteer = require("puppeteer");

const jsguiServer = require("jsgui3-server");
const { Server: JsguiServer } = jsguiServer;
const jsgui = require("./client");

const Ctrl = jsgui.controls.mixed_activation_page;

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

	return {
		totalControls: missing.length + withType.length,
		missingTypeCount: missing.length,
		missingTags: missing,
		missingTypeTopTags: missing.slice(0, 10)
	};
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
			"SSR includes mixed_activation_page",
			/data-jsgui-type=["']mixed_activation_page["']/.test(html)
		);
		assert(
			"SSR includes mixed_activation_panel",
			/data-jsgui-type=["']mixed_activation_panel["']/.test(html)
		);
		assert(
			"SSR includes mixed_activation_leaf",
			/data-jsgui-type=["']mixed_activation_leaf["']/.test(html)
		);
		assert("SSR includes ctrl_fields", html.includes("data-jsgui-ctrl-fields"));

		const typeSummary = summarizeMissingTypesFromHtml(html);
		const allowedMissingTypeTags = new Set(["head", "body"]);
		const disallowedMissingTags = (typeSummary.missingTags || []).filter(
			tag => !allowedMissingTypeTags.has(tag)
		);
		assert(
			"SSR has no unexpected controls missing data-jsgui-type",
			disallowedMissingTags.length === 0,
			JSON.stringify({
				...typeSummary,
				disallowedMissingTopTags: disallowedMissingTags.slice(0, 10)
			})
		);

		const jsBundle = await fetchText(`${baseUrl}/js/js.js`);
		assert("/js/js.js returns 200", jsBundle.status === 200, `status=${jsBundle.status}`);

		browser = await puppeteer.launch({ headless: "new" });
		const page = await browser.newPage();
		page.setDefaultTimeout(8000);

		const logs = [];
		page.on("console", msg => logs.push({ type: msg.type(), text: msg.text() }));
		page.on("pageerror", err =>
			logs.push({ type: "pageerror", text: err.stack || err.message || String(err) })
		);

		await page.goto(pageUrl, { waitUntil: "load" });
		await page.waitForSelector(".mixed-activation__panel");

		const activated = await page
			.waitForFunction(() => {
				const el = document.querySelector(".mixed-activation__panel");
				return el && el.getAttribute("data-activated") === "1";
			})
			.then(() => true)
			.catch(() => false);
		assert("Client activation sets data-activated=1", activated);

		const contract = await page.$eval(
			".mixed-activation__panel",
			el => el.getAttribute("data-activation-contract")
		);
		assert("Activation contract reports ok", contract === "ok", `contract=${contract}`);

		const report = await page.evaluate(() => window.__mixed_activation_report || null);
		assert("Mixed activation report exists", !!report, report ? JSON.stringify(report) : "missing");
		if (report) {
			assert("No missingTypes", (report.missingTypes || []).length === 0, JSON.stringify(report));
			assert(
				"No missingConstructors",
				(report.missingConstructors || []).length === 0,
				JSON.stringify(report)
			);
			assert(
				"No missingContextConstructors",
				(report.missingContextConstructors || []).length === 0,
				JSON.stringify(report)
			);
			assert(
				"No missingInstances",
				(report.missingInstances || []).length === 0,
				JSON.stringify(report)
			);
			assert(
				"All leaves activated",
				report.nonActivatedLeaves === 0,
				JSON.stringify(report)
			);
			assert(
				"Color_Grid is available",
				report.builtins && report.builtins.colorGridAvailable === true,
				JSON.stringify(report)
			);
		}

		await page.click(".mixed-activation__leaf .mixed-activation__btn");
		await page.waitForFunction(() => {
			const leaf = document.querySelector(".mixed-activation__leaf");
			return leaf && leaf.getAttribute("data-clicks") === "1";
		});

		const statusText = await page.$eval(
			".mixed-activation__leaf .mixed-activation__status",
			el => el.textContent
		);
		assert("Click updates status text", /clicks=1/.test(statusText), `status=${statusText}`);

		const noise = logs.filter(l => {
			const text = l && l.text ? l.text : "";
			if (!/Missing context\.map_Controls|generic Control/i.test(text)) return false;
			return /\bmixed_activation_(page|panel|leaf)\b/i.test(text);
		});
		assert(
			"No activation warnings for custom controls",
			noise.length === 0,
			noise.map(n => n.text).join(" | ")
		);
	} finally {
		if (browser) await browser.close().catch(() => {});
		await new Promise(resolve => server.close(resolve));
	}
}

main().catch(err => {
	console.error(err);
	process.exitCode = 1;
});
