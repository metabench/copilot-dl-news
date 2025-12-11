"use strict";

const puppeteer = require("puppeteer");

let browserPromise = null;
let sharedPage = null;

async function getBrowser(launchOptions = {}) {
	if (!browserPromise) {
		browserPromise = puppeteer.launch({ headless: "new", ...launchOptions });
		process.on("exit", () => {
			if (!browserPromise) return;
			browserPromise.then(b => b.close()).catch(() => {});
		});
	}
	return browserPromise;
}

async function getPage(launchOptions = {}) {
	if (!sharedPage) {
		const browser = await getBrowser(launchOptions);
		sharedPage = await browser.newPage();
	}
	return sharedPage;
}

async function resetPage(page) {
	page.removeAllListeners("console");
	page.removeAllListeners("pageerror");
	await page.goto("about:blank");
	await page.setViewport({ width: 1024, height: 768 });
	await page.evaluate(() => {
		if (typeof console.clear === "function") console.clear();
	});
}

async function runBrowserScenario({ name, scenario, launchOptions = {}, timeout = 5000 }) {
	const page = await getPage(launchOptions);
	page.setDefaultTimeout(timeout);
	const logs = [];
	const errors = [];
	const consoleHandler = msg => logs.push({ type: msg.type(), text: msg.text() });
	const errorHandler = err => errors.push({ text: err.message || String(err) });

	page.on("console", consoleHandler);
	page.on("pageerror", errorHandler);

	await page.setContent("<!doctype html><html><body><div id=\"root\"></div></body></html>", { waitUntil: "load" });
	const result = await page.evaluate(
		scenarioSource => {
			const scenarioFn = globalThis.eval(`(${scenarioSource})`);
			return scenarioFn();
		},
		scenario.toString()
	);

	await page.evaluate(() => {
		if (typeof console.clear === "function") console.clear();
	});
	page.off("console", consoleHandler);
	page.off("pageerror", errorHandler);

	return { name, result, logs, errors };
}

async function closeShared() {
	if (sharedPage) {
		await sharedPage.close().catch(() => {});
		sharedPage = null;
	}
	if (browserPromise) {
		const browser = await browserPromise.catch(() => null);
		browserPromise = null;
		if (browser) await browser.close().catch(() => {});
	}
}

module.exports = {
	runBrowserScenario,
	resetPage,
	closeShared
};
