"use strict";

const { performance } = require("perf_hooks");
const puppeteer = require("puppeteer");
const { startServer, DEFAULT_ITEMS, DEFAULT_CHUNK, DEFAULT_VIEWPORT, DEFAULT_BUFFER } = require("./server");

function parseEnvInt(name, fallback) {
	const raw = process.env[name];
	const val = raw ? parseInt(raw, 10) : NaN;
	return Number.isFinite(val) ? val : fallback;
}

async function measureTTFB(url) {
	const start = performance.now();
	const res = await fetch(url);
	const reader = res.body.getReader();
	let ttfbMs = null;
	// Read until first chunk arrives, then cancel.
	await reader.read().then(first => {
		if (!first.done) {
			ttfbMs = performance.now() - start;
			return reader.cancel();
		}
		return null;
	});
	return ttfbMs;
}

async function measureScenario(browser, opts) {
	const server = await startServer(opts);
	const page = await browser.newPage();
	const ttfbMs = await measureTTFB(server.url);
	await page.goto(server.url, { waitUntil: "load" });
	const clientMetrics = await page.evaluate(async () => {
		const nav = performance.getEntriesByType("navigation")[0];
		const liCount = window.__liCount;
		const activationMs = window.__activationMs;
		let maxFrameGap = null;
		// Lightweight scroll jank probe: perform small scroll steps and record worst rAF delta.
		const gaps = [];
		await new Promise(resolve => {
			let last = performance.now();
			let steps = 0;
			function step() {
				const now = performance.now();
				gaps.push(now - last);
				last = now;
				window.scrollBy(0, 100);
				steps += 1;
				if (steps < 15) {
					requestAnimationFrame(step);
				} else {
					requestAnimationFrame(() => {
						window.scrollTo(0, 0);
						resolve();
					});
				}
			}
			requestAnimationFrame(step);
		});
		if (gaps.length) {
			maxFrameGap = Math.max(...gaps);
		}
		return {
			liCount,
			activationMs,
			domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : null,
			loadEvent: nav ? nav.loadEventEnd - nav.startTime : null,
			maxFrameGap
		};
	});
	await page.close();
	await server.stop();
	return { ttfbMs, ...clientMetrics, meta: server.meta };
}

function formatResult({ meta, ttfbMs, liCount, activationMs, domContentLoaded, loadEvent, maxFrameGap }) {
	const flags = `${meta.streaming ? "stream" : "no-stream"} | ${meta.virtual ? "virtual" : "full"}`;
	return {
		mode: flags,
		items: meta.items,
		viewport: meta.viewport,
		buffer: meta.buffer,
		chunkSize: meta.chunkSize,
		chunkCount: meta.chunkCount,
		totalBytes: meta.totalBytes,
		liCount,
		activationMs: activationMs != null ? activationMs.toFixed(3) : null,
		ttfbMs: ttfbMs != null ? ttfbMs.toFixed(3) : null,
		domContentLoaded: domContentLoaded != null ? domContentLoaded.toFixed(3) : null,
		loadEvent: loadEvent != null ? loadEvent.toFixed(3) : null,
		maxFrameGap: maxFrameGap != null ? maxFrameGap.toFixed(3) : null
	};
}

async function main() {
	const browser = await puppeteer.launch({ headless: "new" });
	const scenarios = [
		{ streaming: false, virtual: false },
		{ streaming: true, virtual: false },
		{ streaming: false, virtual: true },
		{ streaming: true, virtual: true }
	];
	const results = [];
	for (const scenario of scenarios) {
		const res = await measureScenario(browser, {
			...scenario,
			items: parseEnvInt("ITEMS", DEFAULT_ITEMS),
			chunkSize: parseEnvInt("CHUNK", DEFAULT_CHUNK),
			viewport: parseEnvInt("VIEWPORT", DEFAULT_VIEWPORT),
			buffer: parseEnvInt("BUFFER", DEFAULT_BUFFER)
		});
		results.push(formatResult(res));
	}
	await browser.close();

	console.log("Streaming/Virtual Bench (values in ms where applicable)");
	console.table(results);
}

main().catch(err => {
	console.error(err);
	process.exitCode = 1;
});
