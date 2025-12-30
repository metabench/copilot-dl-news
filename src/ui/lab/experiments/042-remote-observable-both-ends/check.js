"use strict";

const puppeteer = require("puppeteer");

const { startServer: startJsgui3 } = require("./server.jsgui3");
const { startServer: startExpress } = require("./server.express");

const PRINT = console.log.bind(console);

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
	PRINT(`${status} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!condition) process.exitCode = 1;
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function silenceConsole() {
	const origLog = console.log;
	const origWarn = console.warn;
	// Keep console.error intact so failures still surface.
	console.log = () => {};
	console.warn = () => {};
	return () => {
		console.log = origLog;
		console.warn = origWarn;
	};
}

async function withTimeout(promise, ms, label) {
	let t;
	const timeout = new Promise((_, reject) => {
		t = setTimeout(() => reject(new Error(label || `timeout after ${ms}ms`)), ms);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		clearTimeout(t);
	}
}

async function runScenario({ name, startServer, expectJsguiSsr }) {
	PRINT(`\n=== ${name} ===`);

	const restoreConsole = silenceConsole();
	let serverHandle;
	try {
		serverHandle = await startServer();
	} catch (e) {
		restoreConsole();
		throw e;
	}

	const { baseUrl, pageUrl, stop } = serverHandle;

	let browser;
	try {
		const { status, text: html } = await fetchText(pageUrl);
		assert(`${name}: page returns 200`, status === 200, `status=${status}`);
		assert(`${name}: includes demo class`, /remote-obs-demo/.test(html));

		if (expectJsguiSsr) {
			assert(
				`${name}: SSR includes remote_observable_page`,
				/data-jsgui-type=["']remote_observable_page["']/.test(html)
			);
			assert(
				`${name}: SSR includes remote_observable_demo`,
				/data-jsgui-type=["']remote_observable_demo["']/.test(html)
			);

			const jsBundle = await fetchText(`${baseUrl}/js/js.js`);
			assert(`${name}: /js/js.js returns 200`, jsBundle.status === 200, `status=${jsBundle.status}`);
			const cssBundle = await fetchText(`${baseUrl}/css/css.css`);
			assert(`${name}: /css/css.css returns 200`, cssBundle.status === 200, `status=${cssBundle.status}`);
		}

		const sharedJs = await fetchText(`${baseUrl}/public/shared.js`);
		assert(`${name}: /public/shared.js returns 200`, sharedJs.status === 200, `status=${sharedJs.status}`);
		const clientJs = await fetchText(`${baseUrl}/public/clientRemoteObservable.js`);
		assert(`${name}: /public/clientRemoteObservable.js returns 200`, clientJs.status === 200, `status=${clientJs.status}`);

		browser = await puppeteer.launch({ headless: "new" });
		const page = await browser.newPage();
		page.setDefaultTimeout(12000);

		const logs = [];
		page.on("console", msg => {
			const t = msg.type();
			if (t === "error" || t === "warning") logs.push({ type: t, text: msg.text() });
		});
		page.on("pageerror", err => logs.push({ type: "pageerror", text: err.stack || err.message || String(err) }));

		await page.goto(pageUrl, { waitUntil: "load" });
		await page.waitForSelector(".remote-obs-demo");

		const activated = await page
			.waitForFunction(() => {
				const el = document.querySelector(".remote-obs-demo");
				return el && el.getAttribute("data-activated") === "1";
			})
			.then(() => true)
			.catch(() => false);
		assert(`${name}: data-activated=1`, activated);

		const reached = await withTimeout(
			page.waitForFunction(() => {
				const el = document.querySelector(".remote-obs-demo");
				const v = el && el.getAttribute("data-counter");
				const n = Number(v);
				return Number.isFinite(n) && n >= 3;
			}, { timeout: 10000 }),
			12000,
			`${name}: waitForFunction(counter>=3) hung`
		)
			.then(() => true)
			.catch(() => false);
		assert(`${name}: receives counter >= 3`, reached);

		const getCounter = async () => {
			return await page.$eval(".remote-obs-demo", el => Number(el.getAttribute("data-counter")));
		};
		const getStatus = async () => {
			return await page.$eval(".remote-obs-demo", el => String(el.getAttribute("data-status") || ""));
		};

		const pause = async () => {
			await page.click('button[data-action="pause"]');
		};
		const resume = async () => {
			await page.click('button[data-action="resume"]');
		};
		const cancel = async () => {
			await page.click('button[data-action="cancel"]');
		};

		const beforePause = await getCounter();
		await pause();

		const paused = await page
			.waitForFunction(() => {
				const el = document.querySelector(".remote-obs-demo");
				const s = el && el.getAttribute("data-status");
				return s === "paused";
			}, { timeout: 5000 })
			.then(() => true)
			.catch(() => false);
		assert(`${name}: pause sets status=paused`, paused);

		const pausedCounter = await getCounter();
		await sleep(450);
		const afterPause = await getCounter();
		assert(
			`${name}: counter stops while paused`,
			afterPause === pausedCounter,
			`before=${beforePause} paused=${pausedCounter} after=${afterPause}`
		);

		await resume();
		const resumed = await page
			.waitForFunction(() => {
				const el = document.querySelector(".remote-obs-demo");
				const s = el && el.getAttribute("data-status");
				return s === "running";
			}, { timeout: 5000 })
			.then(() => true)
			.catch(() => false);
		assert(`${name}: resume sets status=running`, resumed);

		const beforeResumeTick = await getCounter();
		const resumedTick = await page
			.waitForFunction((prev) => {
				const el = document.querySelector(".remote-obs-demo");
				const n = Number(el && el.getAttribute("data-counter"));
				return Number.isFinite(n) && n > prev;
			}, { timeout: 8000 }, beforeResumeTick)
			.then(() => true)
			.catch(() => false);
		assert(`${name}: counter increases after resume`, resumedTick);

		await cancel();
		const cancelledOrComplete = await page
			.waitForFunction(() => {
				const el = document.querySelector(".remote-obs-demo");
				const s = el && el.getAttribute("data-status");
				return s === "cancelled" || s === "complete";
			}, { timeout: 8000 })
			.then(() => true)
			.catch(() => false);
		assert(`${name}: cancel leads to cancelled|complete`, cancelledOrComplete, `status=${await getStatus()}`);

		const beforeCancelWait = await getCounter();
		await sleep(450);
		const afterCancelWait = await getCounter();
		assert(`${name}: counter stops after cancel`, afterCancelWait === beforeCancelWait, `before=${beforeCancelWait} after=${afterCancelWait}`);

		if (logs.length) {
			console.log("\nBrowser logs:");
			logs.forEach(l => console.log(` [${l.type}] ${l.text}`));
		}
	} finally {
		restoreConsole();
		if (browser) await browser.close().catch(() => {});
		await stop().catch(() => {});
	}
}

async function main() {
	await runScenario({ name: "jsgui3-server mount", startServer: startJsgui3, expectJsguiSsr: true });
	await runScenario({ name: "express mount", startServer: startExpress, expectJsguiSsr: false });
}

main().catch(err => {
	console.error(err);
	process.exitCode = 1;
});
