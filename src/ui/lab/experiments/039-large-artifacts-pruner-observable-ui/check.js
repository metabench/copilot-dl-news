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
	const { baseUrl, pageUrl, stop } = await startServer();

	let browser;
	try {
		const { status, text: html } = await fetchText(pageUrl);
		assert("SSR returns 200", status === 200, `status=${status}`);
		assert(
			"SSR includes large_artifacts_pruner_page",
			/data-jsgui-type=["']large_artifacts_pruner_page["']/.test(html)
		);
		assert(
			"SSR includes large_artifacts_pruner_demo",
			/data-jsgui-type=["']large_artifacts_pruner_demo["']/.test(html)
		);

		const jsBundle = await fetchText(`${baseUrl}/js/js.js`);
		assert("/js/js.js returns 200", jsBundle.status === 200, `status=${jsBundle.status}`);
		const cssBundle = await fetchText(`${baseUrl}/css/css.css`);
		assert("/css/css.css returns 200", cssBundle.status === 200, `status=${cssBundle.status}`);

		browser = await puppeteer.launch({ headless: "new" });
		const page = await browser.newPage();
		page.setDefaultTimeout(20000);

		const logs = [];
		page.on("console", msg => logs.push({ type: msg.type(), text: msg.text() }));
		page.on("pageerror", err => logs.push({ type: "pageerror", text: err.stack || err.message || String(err) }));

		await page.goto(pageUrl, { waitUntil: "load" });
		await page.waitForSelector(".large-artifacts-pruner");

		const activated = await page
			.waitForFunction(() => {
				const el = document.querySelector(".large-artifacts-pruner");
				return el && el.getAttribute("data-activated") === "1";
			})
			.then(() => true)
			.catch(() => false);
		assert("Client activation sets data-activated=1", activated);

		const reachesDone = await page
			.waitForFunction(() => {
				const el = document.querySelector(".large-artifacts-pruner__status");
				if (!el) return false;
				const t = String(el.textContent || "");
				return t.includes("status=done") || t.includes("status=error") || t.includes("status=parse-error");
			}, { timeout: 20000 })
			.then(() => true)
			.catch(() => false);
		assert("SSE run completes (done/error)", reachesDone);

		const listText = await page.$eval(".large-artifacts-pruner__list", el => String(el.textContent || ""));
		assert("Shows planned deletions list or none", listText.length > 0);

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
