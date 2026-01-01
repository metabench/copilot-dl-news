"use strict";

const path = require("path");

const puppeteer = require("puppeteer");
const jsgui = require("jsgui3-html");

const VirtualMatrixControl = require("../../../server/shared/isomorphic/controls/ui/VirtualMatrixControl");

function makeLabels(prefix, count) {
	const out = new Array(count);
	for (let i = 0; i < count; i += 1) out[i] = `${prefix} ${i}`;
	return out;
}

function assert(label, condition, detail) {
	const status = condition ? "✅" : "❌";
	console.log(`${status} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!condition) process.exitCode = 1;
}

function buildHtml() {
	const ctx = new jsgui.Page_Context();

	const rowCount = 5000;
	const colCount = 2000;
	const rowKeys = Array.from({ length: rowCount }, (_, i) => i);
	const colKeys = Array.from({ length: colCount }, (_, i) => i);
	const rowLabels = makeLabels("Row", rowCount);
	const colLabels = makeLabels("Col", colCount);

	const specialCells = [
		{ rowKey: 1, colKey: 1, state: "checked", className: "cell--yes", glyph: "✓", title: "Example hit" },
		{ rowKey: 120, colKey: 50, state: "unchecked", className: "cell--no", glyph: "×", title: "Example miss" }
	];

	const ctrl = new VirtualMatrixControl({
		context: ctx,
		testId: "lab-046-vm",
		viewportTestId: "lab-046-vm-viewport",
		cornerLabel: "Row \\ Col",
		rowKeys,
		rowLabels,
		rowTitles: rowLabels,
		colKeys,
		colLabels,
		colTitles: colLabels,
		specialCells,
		cellLink: {
			path: "/cell",
			rowParam: "row",
			colParam: "col",
			params: { lab: "046" }
		},
		layout: {
			cellW: 44,
			cellH: 26,
			rowHeaderW: 220,
			colHeaderH: 80,
			bufferRows: 4,
			bufferCols: 4
		}
	});

	const ctrlHtml = ctrl.all_html_render();

	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lab 046 — VirtualMatrixControl Smoothness</title>
  <style>
    html, body { margin: 0; padding: 0; background: #0b0b0b; color: #e7e7e7; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    .virtual-matrix { padding: 16px; }
    .vm-viewport { width: 1200px; height: 680px; overflow: auto; border: 1px solid rgba(255,255,255,0.14); border-radius: 12px; background: #111; position: relative; }
    .vm-col-headers { background: #120e0b; border-bottom: 1px solid rgba(74,54,40,1); }
    .vm-row-headers { background: #120e0b; border-right: 1px solid rgba(74,54,40,1); }
    .vm-col-header, .vm-row-header { box-sizing: border-box; }
    .vm-row-header { display: flex; align-items: center; padding: 0 10px; font-size: 12px; color: rgba(231,231,231,0.9); border-bottom: 1px solid rgba(255,255,255,0.08); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .vm-col-header-inner { position: relative; width: 100%; height: 100%; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 10px; }
    .vm-col-label { display: inline-block; transform: rotate(-45deg); transform-origin: bottom left; font-size: 11px; color: rgba(231,231,231,0.92); white-space: nowrap; max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
    .vm-cell { box-sizing: border-box; border-right: 1px solid rgba(255,255,255,0.06); border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; }
    .vm-cell .cell-link { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: inherit; text-decoration: none; }
    .cell--yes { background: rgba(90, 172, 89, 0.18); }
    .cell--no { background: rgba(216, 86, 86, 0.18); }
  </style>
</head>
<body>
${ctrlHtml}
</body>
</html>`;
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
	console.log("");
	console.log("═══════════════════════════════════════════════════════════════");
	console.log("Lab 046: VirtualMatrixControl Smoothness");
	console.log("═══════════════════════════════════════════════════════════════");
	console.log("");

	const html = buildHtml();
	assert("HTML generated", typeof html === "string" && html.length > 1000, `len=${html.length}`);

	let browser;
	try {
		browser = await puppeteer.launch({ headless: "new" });
		const page = await browser.newPage();
		page.setDefaultTimeout(15000);
		await page.setViewport({ width: 1500, height: 900, deviceScaleFactor: 2 });

		await page.setContent(html, { waitUntil: "domcontentloaded" });

		await page.waitForSelector('[data-testid="lab-046-vm"]');
		await page.waitForSelector('[data-testid="lab-046-vm-viewport"]');

		const ready = await page
			.waitForFunction(() => {
				const root = document.querySelector('[data-testid="lab-046-vm"]');
				return root && root.getAttribute("data-vm-ready") === "1";
			})
			.then(() => true)
			.catch(() => false);
		assert("data-vm-ready=1", ready);

		const initial = await page.$eval('[data-testid="lab-046-vm"]', (el) => ({
			renderSeq: Number(el.getAttribute("data-render-seq")) || 0,
			cellCount: Number(el.getAttribute("data-cell-count")) || 0,
			firstRow: Number(el.getAttribute("data-first-row")) || 0,
			firstCol: Number(el.getAttribute("data-first-col")) || 0
		}));

		assert("Initial renderSeq >= 1", initial.renderSeq >= 1, `renderSeq=${initial.renderSeq}`);
		assert("DOM cell count bounded", initial.cellCount > 0 && initial.cellCount <= 2500, `cells=${initial.cellCount}`);

		// Smoothness: a small scroll that does not cross a cell boundary should not trigger a full rerender.
		const seqBeforeSmall = initial.renderSeq;
		await page.$eval('[data-testid="lab-046-vm-viewport"]', (el) => {
			el.scrollTop = (el.scrollTop || 0) + 5;
			el.scrollLeft = (el.scrollLeft || 0) + 5;
		});
		await delay(150);
		const seqAfterSmall = await page.$eval('[data-testid="lab-046-vm"]', (el) => Number(el.getAttribute("data-render-seq")) || 0);
		assert("Small scroll does not bump renderSeq", seqAfterSmall === seqBeforeSmall, `before=${seqBeforeSmall} after=${seqAfterSmall}`);

		// Crossing a boundary should trigger re-windowing (renderSeq increments).
		const seqBeforeBig = seqAfterSmall;
		await page.$eval('[data-testid="lab-046-vm-viewport"]', (el) => {
			el.scrollTop = (el.scrollTop || 0) + 26 * 5;
			el.scrollLeft = (el.scrollLeft || 0) + 44 * 3;
		});
		await page.waitForFunction((seq) => {
			const root = document.querySelector('[data-testid="lab-046-vm"]');
			const cur = Number(root && root.getAttribute("data-render-seq")) || 0;
			return cur > seq;
		}, {}, seqBeforeBig);
		const afterBig = await page.$eval('[data-testid="lab-046-vm"]', (el) => ({
			renderSeq: Number(el.getAttribute("data-render-seq")) || 0,
			firstRow: Number(el.getAttribute("data-first-row")) || 0,
			firstCol: Number(el.getAttribute("data-first-col")) || 0,
			cellCount: Number(el.getAttribute("data-cell-count")) || 0
		}));
		assert("Big scroll bumps renderSeq", afterBig.renderSeq > seqBeforeBig, `before=${seqBeforeBig} after=${afterBig.renderSeq}`);
		assert("Still bounded after big scroll", afterBig.cellCount > 0 && afterBig.cellCount <= 2500, `cells=${afterBig.cellCount}`);

		// Resize should trigger a re-windowing render.
		const seqBeforeResize = afterBig.renderSeq;
		await page.$eval('[data-testid="lab-046-vm-viewport"]', (el) => {
			el.style.height = "260px";
		});
		await page.evaluate(() => window.dispatchEvent(new Event("resize")));
		await page.waitForFunction((seq) => {
			const root = document.querySelector('[data-testid="lab-046-vm"]');
			const cur = Number(root && root.getAttribute("data-render-seq")) || 0;
			return cur > seq;
		}, {}, seqBeforeResize);

		const afterResize = await page.$eval('[data-testid="lab-046-vm"]', (el) => ({
			renderSeq: Number(el.getAttribute("data-render-seq")) || 0,
			cellCount: Number(el.getAttribute("data-cell-count")) || 0
		}));
		assert("Resize bumps renderSeq", afterResize.renderSeq > seqBeforeResize, `before=${seqBeforeResize} after=${afterResize.renderSeq}`);
		assert("Still bounded after resize", afterResize.cellCount > 0 && afterResize.cellCount <= 2500, `cells=${afterResize.cellCount}`);

		console.log("");
		assert("Lab 046 passed", process.exitCode !== 1);
	} finally {
		if (browser) await browser.close().catch(() => {});
	}
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
