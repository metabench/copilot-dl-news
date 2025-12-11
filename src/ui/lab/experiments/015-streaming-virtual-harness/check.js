"use strict";

const { performance } = require("perf_hooks");

const ITEMS = 2000;
const CHUNK_SIZE = 200;
const VIEWPORT = 30;
const BUFFER = 10;

const combos = [
	{ streaming: false, virtual: false },
	{ streaming: true, virtual: false },
	{ streaming: false, virtual: true },
	{ streaming: true, virtual: true }
];

function renderItem(idx) {
	// Cheap placeholder for DOM string cost
	return `<li data-idx="${idx}">Item ${idx}</li>`;
}

function simulate({ streaming, virtual }) {
	const t0 = performance.now();
	const items = Array.from({ length: ITEMS }, (_, i) => i);
	let rendered = 0;
	let chunkCount = 0;
	let htmlBytes = 0;

	const sliceStart = 0;
	const sliceEnd = virtual ? Math.min(ITEMS, VIEWPORT + BUFFER) : ITEMS;
	const slice = items.slice(sliceStart, sliceEnd);
	const totalToRender = slice.length;

	if (streaming) {
		for (let i = 0; i < totalToRender; i += CHUNK_SIZE) {
			const chunkItems = slice.slice(i, i + CHUNK_SIZE);
			htmlBytes += chunkItems.map(renderItem).join("").length;
			rendered += chunkItems.length;
			chunkCount += 1;
		}
	} else {
		htmlBytes = slice.map(renderItem).join("").length;
		rendered = totalToRender;
		chunkCount = 1;
	}

	const renderMs = +(performance.now() - t0).toFixed(3);

	const act0 = performance.now();
	// Activation cost proportional to rendered items
	for (let i = 0; i < rendered; i++) {
		// no-op loop to simulate handler binding cost
	}
	const activationMs = +(performance.now() - act0).toFixed(3);

	return { streaming, virtual, chunkCount, rendered, htmlBytes, renderMs, activationMs };
}

const results = combos.map(simulate);

const baseline = results.find(r => !r.streaming && !r.virtual);
const virtualOnly = results.find(r => !r.streaming && r.virtual);
const streamingOnly = results.find(r => r.streaming && !r.virtual);
const both = results.find(r => r.streaming && r.virtual);

const checks = [];
const log = (label, pass, detail) => {
	checks.push({ label, pass, detail });
	const status = pass ? "✅" : "❌";
	console.log(`${status} ${label}${detail ? " — " + detail : ""}`);
};

log("Virtual reduces rendered count", virtualOnly.rendered < baseline.rendered, `baseline=${baseline.rendered}, virtual=${virtualOnly.rendered}`);
log("Streaming increases chunk count for full render", streamingOnly.chunkCount > baseline.chunkCount, `baseline=${baseline.chunkCount}, streaming=${streamingOnly.chunkCount}`);
log("Virtual+Streaming has smallest activation", both.activationMs <= Math.min(virtualOnly.activationMs, streamingOnly.activationMs, baseline.activationMs), `activationMs=${baseline.activationMs}/${streamingOnly.activationMs}/${virtualOnly.activationMs}/${both.activationMs}`);

console.log("\nScenario metrics:");
results.forEach(r => {
	console.log(` streaming=${r.streaming} virtual=${r.virtual} | chunks=${r.chunkCount} rendered=${r.rendered} htmlBytes=${r.htmlBytes} renderMs=${r.renderMs} activationMs=${r.activationMs}`);
});

const failed = checks.filter(c => !c.pass);
console.log(`\nSummary: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
	failed.forEach(f => console.log(` - FAIL ${f.label}${f.detail ? " (" + f.detail + ")" : ""}`));
	process.exitCode = 1;
}
