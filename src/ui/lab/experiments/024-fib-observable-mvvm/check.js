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

function fibBigInt(n) {
	let a = 0n;
	let b = 1n;
	for (let i = 0; i < n; i++) {
		const next = a + b;
		a = b;
		b = next;
	}
	return a;
}

async function main() {
	const { baseUrl, pageUrl, stop } = await startServer({ tickMs: 330 });

	let browser;
	try {
		const { status, text: html } = await fetchText(pageUrl);
		assert("SSR returns 200", status === 200, `status=${status}`);
		assert("SSR includes fib_mvvm_page", /data-jsgui-type=["']fib_mvvm_page["']/.test(html));
		assert("SSR includes fib_mvvm_demo", /data-jsgui-type=["']fib_mvvm_demo["']/.test(html));

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
		await page.waitForSelector(".fib-mvvm");

		const activated = await page
			.waitForFunction(() => {
				const el = document.querySelector(".fib-mvvm");
				return el && el.getAttribute("data-activated") === "1";
			})
			.then(() => true)
			.catch(() => false);
		assert("Client activation sets data-activated=1", activated);

		const reached = await page
			.waitForFunction(() => {
				const el = document.querySelector(".fib-mvvm");
				const v = el && el.getAttribute("data-fib-index");
				const n = Number(v);
				return Number.isFinite(n) && n >= 5;
			}, { timeout: 10000 })
			.then(() => true)
			.catch(() => false);
		assert("Receives ≥ 5 Fibonacci ticks", reached);

		const idxText = await page.$eval(".fib-mvvm__index", el => el.textContent);
		const valText = await page.$eval(".fib-mvvm__value", el => el.textContent);
		const idx = Number(idxText);
		assert("Index is numeric", Number.isFinite(idx), `index=${idxText}`);

		const expected = fibBigInt(idx).toString();
		assert("Value matches Fibonacci(index)", valText === expected, `value=${valText}, expected=${expected}`);

		const statusText = await page.$eval(".fib-mvvm__status", el => el.textContent);
		assert("Status shows connected", /connected|error/.test(statusText), statusText);

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
