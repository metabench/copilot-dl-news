"use strict";

const fs = require("fs");
const path = require("path");
const net = require("net");

const puppeteer = require("puppeteer");

const jsguiServer = require("jsgui3-server");
const { Server: JsguiServer } = jsguiServer;
const jsgui = require("./client");

const Ctrl = jsgui.controls.matrix_table_lab_page;

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

function ensureDir(dirPath) {
	if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

async function main() {
	const server = new JsguiServer({
		Ctrl,
		debug: true,
		disk_path_client_js: require.resolve("./client.js")
	});

	server.allowed_addresses = ["127.0.0.1"];
	await new Promise((resolve) => server.on("ready", resolve));

	const port = await getFreePort();
	await new Promise((resolve, reject) => server.start(port, (err) => (err ? reject(err) : resolve())));

	const baseUrl = `http://127.0.0.1:${port}`;
	const pageUrl = `${baseUrl}/`;

	let browser;
	try {
		const { status, text: html } = await fetchText(pageUrl);
		assert("SSR returns 200", status === 200, `status=${status}`);
		assert(
			"SSR includes matrix_table_lab_page",
			/data-jsgui-type=["']matrix_table_lab_page["']/.test(html)
		);
		assert(
			"SSR includes matrix_table_control",
			/data-jsgui-type=["']matrix_table_control["']/.test(html)
		);
		assert("SSR includes flip button test id", html.includes("data-testid='flip-axes'") || html.includes('data-testid="flip-axes"'));
		assert("SSR includes table a", html.includes("data-testid=\"matrix-table-a\""));
		assert("SSR includes table b", html.includes("data-testid=\"matrix-table-b\""));

		const jsBundle = await fetchText(`${baseUrl}/js/js.js`);
		assert("/js/js.js returns 200", jsBundle.status === 200, `status=${jsBundle.status}`);

		browser = await puppeteer.launch({ headless: "new" });
		const page = await browser.newPage();
		page.setDefaultTimeout(12000);
		await page.setViewport({ width: 1500, height: 900, deviceScaleFactor: 2 });

		await page.goto(pageUrl, { waitUntil: "load" });
		await page.waitForSelector(".matrix-table-lab");

		const activated = await page
			.waitForFunction(() => {
				const el = document.querySelector(".matrix-table-lab");
				return el && el.getAttribute("data-activated") === "1";
			})
			.then(() => true)
			.catch(() => false);
		assert("Client activation sets data-activated=1", activated);

		const getVisibleTableTestId = async () => {
			return await page.evaluate(() => {
				const root = document.querySelector(".matrix-table-lab");
				if (!root) return null;
				const view = root.getAttribute("data-view") || "a";
				return view === "b" ? "matrix-table-b" : "matrix-table-a";
			});
		};

		const visibleBefore = await getVisibleTableTestId();
		assert("Initial view is table a", visibleBefore === "matrix-table-a", `visible=${visibleBefore}`);

		const headerStats = await page.evaluate(() => {
			const ths = Array.from(document.querySelectorAll('[data-testid="matrix-col-headers"] th.matrix-th-col'));
			const tooltipCount = ths
				.map((th) => th.querySelector(".matrix-th-col-label"))
				.filter((el) => el && el.getAttribute("title"))
				.length;
			return { colTh: ths.length, tooltipCount };
		});

		assert("Has multiple column headers", headerStats.colTh >= 4, `cols=${headerStats.colTh}`);
		assert("Has at least one tooltip", headerStats.tooltipCount >= 1, `tooltips=${headerStats.tooltipCount}`);

		const outDir = path.join(process.cwd(), "screenshots");
		ensureDir(outDir);

		const beforePath = path.join(outDir, "lab-044-matrix-table-control-a.png");
		await page.screenshot({ path: beforePath, fullPage: true });
		console.log(`✅ Screenshot saved: ${beforePath}`);

		await page.click('[data-testid="flip-axes"]');
		await new Promise((resolve) => setTimeout(resolve, 200));

		const visibleAfter = await getVisibleTableTestId();
		assert("After flip, view is table b", visibleAfter === "matrix-table-b", `visible=${visibleAfter}`);

		const afterPath = path.join(outDir, "lab-044-matrix-table-control-b.png");
		await page.screenshot({ path: afterPath, fullPage: true });
		console.log(`✅ Screenshot saved: ${afterPath}`);

		await page.close();
		await browser.close();
		browser = null;
	} finally {
		if (browser) await browser.close().catch(() => {});
		await new Promise((resolve) => server.close(resolve));
	}
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
