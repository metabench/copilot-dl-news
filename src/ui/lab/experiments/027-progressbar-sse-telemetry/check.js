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
	const { baseUrl, pageUrl, stop } = await startServer({ tickMs: 90 });

	let browser;
	try {
		const { status, text: html } = await fetchText(pageUrl);
		assert("SSR returns 200", status === 200, `status=${status}`);
		assert("SSR includes crawl_progress_page", /data-jsgui-type=["']crawl_progress_page["']/.test(html));
		assert("SSR includes crawl_progress_demo", /data-jsgui-type=["']crawl_progress_demo["']/.test(html));
		assert("SSR includes progress_bar", /data-jsgui-type=["']progress_bar["']/.test(html));
		assert(
			"SSR starts indeterminate",
			/data-progress-mode=["']indeterminate["']/.test(html) || /progress-bar--indeterminate/.test(html)
		);

		const jsBundle = await fetchText(`${baseUrl}/js/js.js`);
		assert("/js/js.js returns 200", jsBundle.status === 200, `status=${jsBundle.status}`);
		const cssBundle = await fetchText(`${baseUrl}/css/css.css`);
		assert("/css/css.css returns 200", cssBundle.status === 200, `status=${cssBundle.status}`);

		browser = await puppeteer.launch({ headless: "new" });
		const page = await browser.newPage();
		page.setDefaultTimeout(12000);

		const logs = [];
		page.on("console", msg => logs.push({ type: msg.type(), text: msg.text() }));
		page.on("pageerror", err => logs.push({ type: "pageerror", text: err.stack || err.message || String(err) }));

		await page.goto(pageUrl, { waitUntil: "load" });
		await page.waitForSelector(".crawl-progress-demo");

		const activated = await page
			.waitForFunction(() => {
				const el = document.querySelector(".crawl-progress-demo");
				return el && el.getAttribute("data-activated") === "1";
			})
			.then(() => true)
			.catch(() => false);
		assert("Client activation sets data-activated=1", activated);

		const reachedDeterminate = await page
			.waitForFunction(() => {
				const el = document.querySelector(".crawl-progress-demo");
				if (!el) return false;
				if (el.getAttribute("data-progress-mode") !== "determinate") return false;
				const pct = Number(el.getAttribute("data-progress-percent"));
				return Number.isFinite(pct) && pct >= 20;
			}, { timeout: 10000 })
			.then(() => true)
			.catch(() => false);
		assert("Flips to determinate and reaches ≥ 20%", reachedDeterminate);

		const indeterminateClassGone = await page
			.waitForFunction(() => {
				const bar = document.querySelector(".progress-bar");
				return bar && !bar.classList.contains("progress-bar--indeterminate");
			}, { timeout: 10000 })
			.then(() => true)
			.catch(() => false);
		assert("Progress bar removes indeterminate class", indeterminateClassGone);

		const statusText = await page.$eval(".crawl-progress-demo__status", el => el.textContent);
		assert("Status shows connected or error", /connected|error/.test(statusText), statusText);

		if (logs.length) {
			const interesting = logs.filter(l => l.type !== "debug");
			if (interesting.length) {
				console.log("\nBrowser logs:");
				interesting.forEach(l => console.log(` [${l.type}] ${l.text}`));
			}
		}
	} finally {
		if (browser) await browser.close().catch(() => {});
		await stop().catch(() => {});
	}
}

main().catch(err => {
	console.error(err);
	process.exitCode = 1;
});
