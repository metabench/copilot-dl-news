"use strict";

const puppeteer = require("puppeteer");

const { startServer } = require("./server");

async function fetchText(url) {
	if (typeof fetch === "function") {
		const res = await fetch(url);
		const text = await res.text();
		return { status: res.status, text };
	}

	const http = require("http");
	return await new Promise((resolve, reject) => {
		http
			.get(url, (res) => {
				let buf = "";
				res.setEncoding("utf8");
				res.on("data", (d) => (buf += d));
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

function parsePerfSummary(logs) {
	for (const l of logs) {
		if (!l || l.type !== "log") continue;
		if (typeof l.text !== "string") continue;
		if (!l.text.startsWith("PERF_SUMMARY")) continue;
		const idx = l.text.indexOf("{");
		if (idx < 0) continue;
		try {
			return JSON.parse(l.text.slice(idx));
		} catch {
			return null;
		}
	}
	return null;
}

function readArg(argv, key) {
	const idx = argv.indexOf(key);
	if (idx < 0) return null;
	const value = argv[idx + 1];
	if (typeof value !== "string" || value.startsWith("--")) return "";
	return value;
}

function readIntArg(argv, key, fallback) {
	const value = readArg(argv, key);
	if (value == null || value === "") return fallback;
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(0, Math.floor(n));
}

function readEnumArg(argv, key, allowed, fallback) {
	const value = readArg(argv, key);
	if (value == null || value === "") return fallback;
	const v = String(value).trim().toLowerCase();
	return allowed.includes(v) ? v : fallback;
}

async function main() {
	const argv = process.argv.slice(2);
	const nodes = readIntArg(argv, "--nodes", 1000);
	const ms = readIntArg(argv, "--ms", 1000);
	const tick = readIntArg(argv, "--tick", 20);
	const mode = readEnumArg(argv, "--mode", ["batch", "single"], "batch");
	const batchSize = readIntArg(argv, "--batch-size", 0);
	const payloadBytes = readIntArg(argv, "--payload-bytes", 0);

	const { baseUrl, pageUrl, stop } = await startServer({
		totalNodes: nodes,
		durationMs: ms,
		tickMs: tick,
		mode,
		batchSize,
		payloadBytes
	});

	let browser;
	try {
		const { status, text: html } = await fetchText(pageUrl);
		assert(`SSR returns 200 (${mode})`, status === 200, `status=${status}`);
		assert("SSR includes perf_graph_page", /data-jsgui-type=["']perf_graph_page["']/.test(html));
		assert("SSR includes perf_graph_demo", /data-jsgui-type=["']perf_graph_demo["']/.test(html));

		const jsBundle = await fetchText(`${baseUrl}/js/js.js`);
		assert("/js/js.js returns 200", jsBundle.status === 200, `status=${jsBundle.status}`);
		const cssBundle = await fetchText(`${baseUrl}/css/css.css`);
		assert("/css/css.css returns 200", cssBundle.status === 200, `status=${cssBundle.status}`);

		browser = await puppeteer.launch({ headless: "new" });
		const page = await browser.newPage();
		page.setDefaultTimeout(20000);

		const logs = [];
		page.on("console", (msg) => logs.push({ type: msg.type(), text: msg.text() }));
		page.on("pageerror", (err) => logs.push({ type: "pageerror", text: err.stack || err.message || String(err) }));

		await page.goto(pageUrl, { waitUntil: "load" });
		await page.waitForSelector(".perf-graph-demo");

		const activated = await page
			.waitForFunction(() => {
				const el = document.querySelector(".perf-graph-demo");
				return el && el.getAttribute("data-activated") === "1";
			})
			.then(() => true)
			.catch(() => false);
		assert(`Client activation sets data-activated=1 (${mode})`, activated);

		const done = await page
			.waitForFunction(() => !!window.__PERF_DONE, { timeout: 20000 })
			.then(() => true)
			.catch(async () => {
				// Emit some debugging signal to stdout for quick diagnosis.
				try {
					const snap = await page.evaluate(() => {
						const el = document.querySelector(".perf-graph-demo__stats");
						return {
							statsText: el ? el.textContent : null,
							perfSummary: window.__PERF_SUMMARY || null,
							perfDone: !!window.__PERF_DONE
						};
					});
					console.log("\n[debug] perf not done; snapshot:", JSON.stringify(snap));
				} catch {
					// ignore
				}
				return false;
			});
		assert(`Perf run completes (${mode})`, done);

		let summary = null;
		try {
			summary = await page.evaluate(() => window.__PERF_SUMMARY);
		} catch {
			// ignore
		}
		const fallbackSummary = parsePerfSummary(logs);
		const perf = summary || fallbackSummary;

		assert(`Perf summary available (${mode})`, !!perf);
		if (perf) {
			assert(`Applied reaches totalNodes (${mode})`, perf.applied >= nodes, `applied=${perf.applied}`);
			assert(`Received reaches totalNodes (${mode})`, perf.received >= nodes, `received=${perf.received}`);
			assert(`Max frame time bounded (${mode})`, perf.maxFrameMs < 120, `maxFrameMs=${perf.maxFrameMs}`);
		}

		if (perf) {
			console.log(
				"CHECK_RESULT",
				JSON.stringify({ mode, nodes, ms, tick, batchSize, payloadBytes, perf }, null, 0)
			);
		}

		const pageErrors = logs.filter((l) => l.type === "pageerror");
		assert(`No page errors (${mode})`, pageErrors.length === 0, pageErrors.length ? pageErrors[0].text : "");

		if (!done || (pageErrors && pageErrors.length)) {
			const interesting = logs.filter((l) => l.type !== "debug");
			if (interesting.length) {
				console.log("\nBrowser logs:");
				interesting.forEach((l) => console.log(` [${l.type}] ${l.text}`));
			}
		}

		if (process.env.SHOW_BROWSER_LOGS === "1") {
			console.log("\nBrowser logs:");
			logs.forEach((l) => console.log(` [${l.type}] ${l.text}`));
		}
	} finally {
		if (browser) await browser.close().catch(() => {});
		await stop().catch(() => {});
	}
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
