"use strict";

const fs = require("fs");
const path = require("path");
const net = require("net");

const puppeteer = require("puppeteer");

const jsguiServer = require("jsgui3-server");
const { Server: JsguiServer } = jsguiServer;
const jsgui = require("./client");

const Ctrl = jsgui.controls.virtual_matrix_lab_page;

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

function clamp(n, min, max) {
	if (n < min) return min;
	if (n > max) return max;
	return n;
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
			"SSR includes virtual_matrix_lab_page",
			/data-jsgui-type=["']virtual_matrix_lab_page["']/.test(html)
		);
		assert(
			"SSR includes virtual_matrix_control",
			/data-jsgui-type=["']virtual_matrix_control["']/.test(html)
		);
		assert(
			"SSR includes flip button test id",
			html.includes("data-testid='flip-axes'") || html.includes('data-testid="flip-axes"')
		);
		assert(
			"SSR includes viewport test id",
			html.includes("data-testid=\"vm-viewport\"") || html.includes("data-testid='vm-viewport'")
		);

		const jsBundle = await fetchText(`${baseUrl}/js/js.js`);
		assert("/js/js.js returns 200", jsBundle.status === 200, `status=${jsBundle.status}`);

		browser = await puppeteer.launch({ headless: "new" });
		const page = await browser.newPage();
		page.setDefaultTimeout(15000);
		await page.setViewport({ width: 1500, height: 900, deviceScaleFactor: 2 });

		await page.goto(pageUrl, { waitUntil: "load" });
		await page.waitForSelector(".virtual-matrix");

		const activated = await page
			.waitForFunction(() => {
				const el = document.querySelector(".virtual-matrix");
				return el && el.getAttribute("data-activated") === "1";
			})
			.then(() => true)
			.catch(() => false);
		assert("Client activation sets data-activated=1", activated);

		const outDir = path.join(process.cwd(), "screenshots");
		ensureDir(outDir);

		const defaultPath = path.join(outDir, "lab-045-virtual-matrix-default.png");
		await page.screenshot({ path: defaultPath, fullPage: true });
		console.log(`✅ Screenshot saved: ${defaultPath}`);

		const initial = await page.evaluate(() => {
			const root = document.querySelector(".virtual-matrix");
			const cellCount = Number(root && root.getAttribute("data-cell-count"));
			const view = root && root.getAttribute("data-view");
			const totalRows = Number(root && root.getAttribute("data-total-rows"));
			const totalCols = Number(root && root.getAttribute("data-total-cols"));
			return { cellCount, view, totalRows, totalCols };
		});

		assert("Initial view is a", initial.view === "a", `view=${initial.view}`);
		assert("Logical matrix has many rows", initial.totalRows >= 3000, `rows=${initial.totalRows}`);
		assert("Logical matrix has many cols", initial.totalCols >= 1000, `cols=${initial.totalCols}`);
		assert("DOM cell count bounded (initial)", initial.cellCount > 0 && initial.cellCount <= 2500, `cells=${initial.cellCount}`);

		let maxObservedCellCount = initial.cellCount;

		const readSeq = async () => {
			return await page.evaluate(() => {
				const root = document.querySelector(".virtual-matrix");
				return Number(root && root.getAttribute("data-render-seq")) || 0;
			});
		};

		const scrollAndAssert = async ({ scrollRow, scrollCol }) => {
			const beforeSeq = await readSeq();

			await page.evaluate(({ scrollRow, scrollCol }) => {
				const root = document.querySelector(".virtual-matrix");
				const viewport = document.querySelector('[data-testid="vm-viewport"]');
				const cellW = Number(root && root.getAttribute("data-cell-w")) || 64;
				const cellH = Number(root && root.getAttribute("data-cell-h")) || 26;
				viewport.scrollTop = cellH * scrollRow;
				viewport.scrollLeft = cellW * scrollCol;
			}, { scrollRow, scrollCol });

			await page.waitForFunction(
				(seq) => {
					const root = document.querySelector(".virtual-matrix");
					const cur = Number(root && root.getAttribute("data-render-seq")) || 0;
					return cur > seq;
				},
				{},
				beforeSeq
			);

			const snapshot = await page.evaluate(() => {
				const root = document.querySelector(".virtual-matrix");
				const viewport = document.querySelector('[data-testid="vm-viewport"]');
				return {
					cellCount: Number(root && root.getAttribute("data-cell-count")),
					firstRow: Number(root && root.getAttribute("data-first-row")),
					firstCol: Number(root && root.getAttribute("data-first-col")),
					lastRow: Number(root && root.getAttribute("data-last-row")),
					lastCol: Number(root && root.getAttribute("data-last-col")),
					totalRows: Number(root && root.getAttribute("data-total-rows")),
					totalCols: Number(root && root.getAttribute("data-total-cols")),
					cellW: Number(root && root.getAttribute("data-cell-w")) || 64,
					cellH: Number(root && root.getAttribute("data-cell-h")) || 26,
					bufferRows: Number(root && root.getAttribute("data-buffer-rows")) || 4,
					bufferCols: Number(root && root.getAttribute("data-buffer-cols")) || 4,
					vpW: viewport ? viewport.clientWidth : 0,
					vpH: viewport ? viewport.clientHeight : 0,
					scrollLeft: viewport ? viewport.scrollLeft : 0,
					scrollTop: viewport ? viewport.scrollTop : 0
				};
			});

			maxObservedCellCount = Math.max(maxObservedCellCount, snapshot.cellCount);

			assert("DOM cell count bounded (scroll)", snapshot.cellCount > 0 && snapshot.cellCount <= 2500, `cells=${snapshot.cellCount}`);
			assert("Window is sane", snapshot.lastRow >= snapshot.firstRow && snapshot.lastCol >= snapshot.firstCol);

			// Deterministic expected window math (should match the control).
			const approxFirstRow = Math.floor(snapshot.scrollTop / snapshot.cellH);
			const approxFirstCol = Math.floor(snapshot.scrollLeft / snapshot.cellW);
			const visibleRows = Math.ceil((snapshot.vpH || 1) / snapshot.cellH);
			const visibleCols = Math.ceil((snapshot.vpW || 1) / snapshot.cellW);

			const expectedFirstRow = clamp(approxFirstRow - snapshot.bufferRows, 0, snapshot.totalRows - 1);
			const expectedFirstCol = clamp(approxFirstCol - snapshot.bufferCols, 0, snapshot.totalCols - 1);
			const expectedLastRow = clamp(approxFirstRow + visibleRows + snapshot.bufferRows, 0, snapshot.totalRows - 1);
			const expectedLastCol = clamp(approxFirstCol + visibleCols + snapshot.bufferCols, 0, snapshot.totalCols - 1);

			assert("firstRow matches expected", snapshot.firstRow === expectedFirstRow, `got=${snapshot.firstRow} expected=${expectedFirstRow}`);
			assert("firstCol matches expected", snapshot.firstCol === expectedFirstCol, `got=${snapshot.firstCol} expected=${expectedFirstCol}`);
			assert("lastRow matches expected", snapshot.lastRow === expectedLastRow, `got=${snapshot.lastRow} expected=${expectedLastRow}`);
			assert("lastCol matches expected", snapshot.lastCol === expectedLastCol, `got=${snapshot.lastCol} expected=${expectedLastCol}`);

			const sampled = await page.evaluate(({ r0, c0, r1, c1, r2, c2 }) => {
				const want = [
					{ r: r0, c: c0 },
					{ r: r1, c: c1 },
					{ r: r2, c: c2 }
				];
				const results = [];
				for (const { r, c } of want) {
					const selector = `[data-testid="vm-cell"][data-row="${r}"][data-col="${c}"]`;
					const el = document.querySelector(selector);
					results.push({
						r,
						c,
						found: !!el,
						text: el ? (el.textContent || "") : ""
					});
				}
				return results;
			}, {
				r0: expectedFirstRow,
				c0: expectedFirstCol,
				r1: Math.min(expectedFirstRow + 1, expectedLastRow),
				c1: Math.min(expectedFirstCol + 1, expectedLastCol),
				r2: expectedLastRow,
				c2: expectedLastCol
			});

			for (const s of sampled) {
				assert(`Sample cell exists r=${s.r} c=${s.c}`, s.found, `text=${JSON.stringify(s.text)}`);
				assert(`Sample cell text matches r/c r=${s.r} c=${s.c}`, s.text.includes(`r${s.r},c${s.c}`), `text=${JSON.stringify(s.text)}`);
			}

			return snapshot;
		};

		const scrollA = await scrollAndAssert({ scrollRow: 2600, scrollCol: 900 });
		assert("Scroll A moved firstRow", scrollA.firstRow >= 2000, `firstRow=${scrollA.firstRow}`);
		assert("Scroll A moved firstCol", scrollA.firstCol >= 700, `firstCol=${scrollA.firstCol}`);

		const scrollB = await scrollAndAssert({ scrollRow: 3200, scrollCol: 1200 });
		assert("Scroll B moved firstRow", scrollB.firstRow >= 2500, `firstRow=${scrollB.firstRow}`);
		assert("Scroll B moved firstCol", scrollB.firstCol >= 900, `firstCol=${scrollB.firstCol}`);

		assert("Max observed cell count stays within budget", maxObservedCellCount <= 2500, `max=${maxObservedCellCount}`);

		const scrolledPath = path.join(outDir, "lab-045-virtual-matrix-scrolled.png");
		await page.screenshot({ path: scrolledPath, fullPage: true });
		console.log(`✅ Screenshot saved: ${scrolledPath}`);

		await page.click('[data-testid="flip-axes"]');
		await page.waitForFunction(() => {
			const root = document.querySelector(".virtual-matrix");
			return root && root.getAttribute("data-view") === "b";
		});

		const flipped = await page.evaluate(() => {
			const root = document.querySelector(".virtual-matrix");
			return {
				view: root && root.getAttribute("data-view"),
				totalRows: Number(root && root.getAttribute("data-total-rows")),
				totalCols: Number(root && root.getAttribute("data-total-cols")),
				cellCount: Number(root && root.getAttribute("data-cell-count"))
			};
		});

		assert("After flip, view is b", flipped.view === "b", `view=${flipped.view}`);
		assert("After flip, rows/cols swapped", flipped.totalRows < flipped.totalCols, `rows=${flipped.totalRows} cols=${flipped.totalCols}`);
		assert("DOM cell count bounded (flipped)", flipped.cellCount > 0 && flipped.cellCount <= 2500, `cells=${flipped.cellCount}`);

		const flippedPath = path.join(outDir, "lab-045-virtual-matrix-flipped.png");
		await page.screenshot({ path: flippedPath, fullPage: true });
		console.log(`✅ Screenshot saved: ${flippedPath}`);

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
