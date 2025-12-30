"use strict";

const puppeteer = require("puppeteer");

const { startServer } = require("./server");

const PRINT = console.log.bind(console);

function assert(label, condition, detail) {
	const status = condition ? "✅" : "❌";
	PRINT(`${status} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!condition) process.exitCode = 1;
}

async function run() {
	let serverHandle;
	try {
		serverHandle = await startServer();
	} catch (e) {
		PRINT(String(e && e.stack || e));
		process.exitCode = 1;
		return;
	}

	const { pageUrl, stop } = serverHandle;

	let browser;
	try {
		browser = await puppeteer.launch({ headless: "new" });
		const page = await browser.newPage();
		page.setDefaultTimeout(15000);

		const logs = [];
		page.on("console", msg => {
			const t = msg.type();
			if (t === "error" || t === "warning") logs.push({ type: t, text: msg.text() });
		});
		page.on("pageerror", err => logs.push({ type: "pageerror", text: err.stack || err.message || String(err) }));

		await page.goto(pageUrl, { waitUntil: "load" });
		await page.waitForSelector(".client-obs-lab");

		const passed = await page
			.waitForFunction(() => {
				const root = document.querySelector(".client-obs-lab");
				return root && root.getAttribute("data-pass") === "1";
			}, { timeout: 15000 })
			.then(() => true)
			.catch(() => false);

		const state = await page.evaluate(() => window.__lab043 || null);

		assert("lab reached pass state", passed, state && state.error ? state.error : null);
		assert("window.__lab043 exists", !!state);
		assert("window.__lab043.pass === true", !!(state && state.pass === true));
		assert("evented adapter ok", !!(state && state.results && state.results.evented && state.results.evented.ok), state && state.results && state.results.evented && state.results.evented.detail);
		assert("rx adapter ok", !!(state && state.results && state.results.rx && state.results.rx.ok), state && state.results && state.results.rx && state.results.rx.detail);
		assert("async iterator ok", !!(state && state.results && state.results.async && state.results.async.ok), state && state.results && state.results.async && state.results.async.detail);

		if (logs.length) {
			assert("no console errors/warnings", false, JSON.stringify(logs, null, 2));
		}
	} finally {
		if (browser) await browser.close();
		await stop();
	}
}

if (require.main === module) {
	run().then(() => {
		if (!process.exitCode) process.stdout.write("Lab 043 check OK\n");
	}).catch((err) => {
		process.stderr.write(String(err && err.stack || err) + "\n");
		process.exitCode = 1;
	});
}

module.exports = {
	run
};
