"use strict";

require("../../../../shared/utils/userTerminationBanner");

const puppeteer = require("puppeteer");
const { startFractalServer } = require("./fractalServer");

async function runFractalScenario({ streaming, virtual }) {
	let server;
	let browser;
	let page;
	try {
		server = await startFractalServer({ streaming, virtual });
		browser = await puppeteer.launch({ headless: "new" });
		page = await browser.newPage();
		page.setDefaultNavigationTimeout(60000);
		page.setDefaultTimeout(60000);
		const response = await page.goto(server.url, { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => {
			return Boolean(
				window.__fractalMetrics &&
				(window.__fractalMetrics.pass === true || window.__fractalMetrics.pass === false)
			);
		});
		const status = response.status();
		const metrics = await page.evaluate(() => window.__fractalMetrics);
		return { status, ...metrics, mode: `${streaming ? "stream" : "no-stream"}|${virtual ? "virtual" : "full"}` };
	} finally {
		if (page) {
			await page.close().catch(() => {});
		}
		if (browser) {
			await browser.close().catch(() => {});
		}
		if (server) {
			await server.stop().catch(() => {});
		}
	}
}

async function runFractalChecks() {
	const scenarios = [
		{ streaming: false, virtual: true },
		{ streaming: true, virtual: true }
	];
	const results = [];
	let failed = false;
	for (const scenario of scenarios) {
		const result = await runFractalScenario(scenario);
		results.push(result);
		if (result.status !== 200 || !result || result.pass === false || (result.failures && result.failures.length)) {
			failed = true;
		}
	}
	console.log("Fractal hex validation");
	console.table(results.map(r => ({
		mode: r.mode,
		status: r.status,
		renderedRows: r.renderedRows,
		totalRows: r.totalRows,
		samples: r.samples,
		failures: r.failures ? r.failures.length : 0,
		virtual: r.virtual,
		streaming: r.streaming
	})));
	if (failed) {
		console.error("❌ Fractal validation failed");
		process.exitCode = 1;
	}
	return !failed;
}

if (require.main === module) {
	runFractalChecks().catch(err => {
		console.error(err);
		process.exitCode = 1;
	});
}

module.exports = { runFractalChecks };
