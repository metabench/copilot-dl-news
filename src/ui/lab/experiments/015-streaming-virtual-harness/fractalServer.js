"use strict";

const http = require("http");

const ROW_BYTES = 16;
const FRACTAL_WIDTH = 1024; // 1024 * 1024 = 1MB
const FRACTAL_HEIGHT = 1024;
const FRACTAL_SIZE = FRACTAL_WIDTH * FRACTAL_HEIGHT; // bytes
const DEFAULT_VIEWPORT_ROWS = 64;
const DEFAULT_BUFFER_ROWS = 32;
const STREAM_CHUNK_ROWS = 256; // rows per chunk when streaming pre-rendered table

function mandelbrotValue(x, y) {
	const normX = x / FRACTAL_WIDTH;
	const normY = y / FRACTAL_HEIGHT;
	const cx = normX * 3.5 - 2.5;
	const cy = normY * 2.0 - 1.0;
	let zx = 0;
	let zy = 0;
	let iter = 0;
	const maxIter = 256;
	while (zx * zx + zy * zy <= 4 && iter < maxIter) {
		const tmp = zx * zx - zy * zy + cx;
		zy = 2 * zx * zy + cy;
		zx = tmp;
		iter += 1;
	}
	return iter % 256;
}

function generateFractalData() {
	const buf = Buffer.allocUnsafe(FRACTAL_SIZE);
	for (let y = 0; y < FRACTAL_HEIGHT; y += 1) {
		for (let x = 0; x < FRACTAL_WIDTH; x += 1) {
			const idx = y * FRACTAL_WIDTH + x;
			buf[idx] = mandelbrotValue(x, y);
		}
	}
	return buf;
}

const FRACTAL_DATA = generateFractalData();
const TOTAL_ROWS = Math.ceil(FRACTAL_DATA.length / ROW_BYTES);

function renderRow(rowIdx, data) {
	const start = rowIdx * ROW_BYTES;
	let cells = `<th class="row-index">${start.toString(16).padStart(8, "0")}</th>`;
	for (let j = 0; j < ROW_BYTES; j += 1) {
		const offset = start + j;
		if (offset >= data.length) break;
		const hex = data[offset].toString(16).padStart(2, "0");
		cells += `<td data-offset="${offset}">${hex}</td>`;
	}
	return `<tr data-row="${rowIdx}">${cells}</tr>`;
}

function buildHead({ streaming, virtual, viewportRows = DEFAULT_VIEWPORT_ROWS, bufferRows = DEFAULT_BUFFER_ROWS }) {
	const hexHeaders = Array.from({ length: ROW_BYTES }, (_, i) => `<th>${i.toString(16).toUpperCase()}</th>`).join("");
	return [
		"<!DOCTYPE html>",
		"<html>",
		"<head>",
		"<meta charset=\"utf-8\" />",
		"<title>Fractal Hex Viewer</title>",
		"<style>",
		"  body { font-family: 'SFMono-Regular', Consolas, monospace; margin: 0; padding: 0; background: #0b1021; color: #e8eefc; }",
		"  #controls { position: sticky; top: 0; padding: 8px 12px; display: flex; gap: 8px; align-items: center; background: #0f1733; z-index: 2; }",
		"  #controls input { width: 140px; }",
		"  #hex-container { height: 520px; overflow: auto; padding: 8px 12px; }",
		"  table { border-collapse: collapse; width: 100%; }",
		"  th, td { padding: 2px 4px; font-size: 12px; }",
		"  th { background: #111936; color: #cdd9f5; position: sticky; top: 0; }",
		"  .row-index { position: sticky; left: 0; background: #0d152f; }",
		"  td { color: #e8eefc; text-align: center; }",
		"  tr:nth-child(even) td { background: #10162d; }",
		"  tr:nth-child(odd) td { background: #0c1226; }",
		"  #hex-body { position: relative; }",
		"</style>",
		"</head>",
		`<body data-viewport="${viewportRows}" data-buffer="${bufferRows}">`,
		"<div id=\"controls\">",
		"<label>Offset <input id=\"offset-input\" type=\"number\" min=\"0\" step=\"1\" value=\"0\" /></label>",
		"<button id=\"jump-btn\">Jump</button>",
		`<span id=\"status\">Loading… (${virtual ? "virtual" : "full"}${streaming ? ", stream" : ""})</span>`,
		"</div>",
		"<div id=\"hex-container\">",
		"<table>",
		"<thead>",
		"<tr>",
		"<th class=\"row-index\">offset</th>",
		hexHeaders,
		"</tr>",
		"</thead>",
		"<tbody id=\"hex-body\">"
	].join("\n");
}

function buildTail({ streaming, virtual }) {
	const scriptLines = [
		"(function(){",
		"  const ROW_BYTES = " + ROW_BYTES + ";",
		"  const TOTAL_ROWS = " + TOTAL_ROWS + ";",
		"  const TOTAL_BYTES = " + FRACTAL_DATA.length + ";",
		"  const STREAMING = " + (streaming ? "true" : "false") + ";",
		"  const VIRTUAL = " + (virtual ? "true" : "false") + ";",
		"  const VIEWPORT_ROWS = Number(document.body.dataset.viewport) || " + DEFAULT_VIEWPORT_ROWS + ";",
		"  const BUFFER_ROWS = Number(document.body.dataset.buffer) || " + DEFAULT_BUFFER_ROWS + ";",
		"  const ROW_HEIGHT = 20;",
		"  const container = document.getElementById('hex-container');",
		"  const body = document.getElementById('hex-body');",
		"  const status = document.getElementById('status');",
		"  const offsetInput = document.getElementById('offset-input');",
		"  const jumpBtn = document.getElementById('jump-btn');",
		"  const renderRow = (rowIdx, data) => {",
		"    const start = rowIdx * ROW_BYTES;",
		"    const cells = ['<th class=\\\"row-index\\\">' + start.toString(16).padStart(8, '0') + '</th>'];",
		"    for (let j = 0; j < ROW_BYTES; j += 1) {",
		"      const offset = start + j;",
		"      if (offset >= data.length) break;",
		"      const hex = data[offset].toString(16).padStart(2, '0');",
		"      cells.push('<td data-offset=\\\"' + offset + '\\\">' + hex + '</td>');",
		"    }",
		"    return '<tr data-row=\\\"' + rowIdx + '\\\">' + cells.join('') + '</tr>';",
		"  };",
		"  let data = null;",
		"  let lastRenderStart = 0;",
		"  let lastRenderEnd = 0;",
		"  const renderVirtual = (startRow) => {",
		"    const clampedStart = Math.max(0, startRow);",
		"    const endRow = Math.min(TOTAL_ROWS, clampedStart + VIEWPORT_ROWS + BUFFER_ROWS);",
		"    const rows = [];",
		"    for (let r = clampedStart; r < endRow; r += 1) {",
		"      const y = r * ROW_HEIGHT;",
		"      rows.push(renderRow(r, data).replace('<tr ', '<tr style=\\\"position:absolute;top:' + y + 'px;left:0;right:0;\\\" '));",
		"    }",
		"    body.innerHTML = rows.join('');",
		"    lastRenderStart = clampedStart;",
		"    lastRenderEnd = endRow;",
		"  };",
		"  const scrollHandler = () => {",
		"    const startRow = Math.floor(container.scrollTop / ROW_HEIGHT) - BUFFER_ROWS;",
		"    renderVirtual(startRow);",
		"  };",
		"  const scrollToOffset = (offset) => {",
		"    const row = Math.floor(offset / ROW_BYTES);",
		"    const targetStart = Math.max(0, row - BUFFER_ROWS);",
		"    container.scrollTop = targetStart * ROW_HEIGHT;",
		"    if (VIRTUAL) renderVirtual(targetStart);",
		"    return row;",
		"  };",
		"  const verifyOffsets = async (offsets) => {",
		"    const failures = [];",
		"    for (const offset of offsets) {",
		"      const row = scrollToOffset(offset);",
		"      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));",
		"      const cell = body.querySelector('[data-offset=\\\"' + offset + '\\\"]');",
		"      const expected = data[offset].toString(16).padStart(2, '0');",
		"      const got = cell ? cell.textContent.trim().toLowerCase() : null;",
		"      if (got !== expected) {",
		"        failures.push({ offset, expected, got, row });",
		"      }",
		"    }",
		"    return failures;",
		"  };",
		"  const hydrateFullTableIfNeeded = () => {",
		"    if (!VIRTUAL) {",
		"      lastRenderStart = 0;",
		"      lastRenderEnd = TOTAL_ROWS;",
		"    }",
		"  };",
		"  const randomOffsets = (count) => {",
		"    const picks = [0, TOTAL_BYTES - 1, Math.floor(TOTAL_BYTES / 2), 12345, 543210];",
		"    for (let i = picks.length; i < count; i += 1) {",
		"      picks.push(Math.floor(Math.random() * TOTAL_BYTES));",
		"    }",
		"    return picks;",
		"  };",
		"  const recordMetrics = (failures, sampleCount) => {",
		"    const renderedRows = body.querySelectorAll('tr').length;",
		"    window.__fractalMetrics = {",
		"      streaming: STREAMING,",
		"      virtual: VIRTUAL,",
		"      totalRows: TOTAL_ROWS,",
		"      renderedRows,",
		"      totalBytes: TOTAL_BYTES,",
		"      samples: sampleCount,",
		"      failures,",
		"      pass: failures.length === 0,",
		"      lastRenderRange: [lastRenderStart, lastRenderEnd]",
		"    };",
		"    status.textContent = failures.length ? '❌ ' + failures.length + ' mismatches' : '✅ hex matches fractal bytes';",
		"  };",
		"  const init = async () => {",
		"    const res = await fetch('/fractal.bin');",
		"    const buf = await res.arrayBuffer();",
		"    data = new Uint8Array(buf);",
		"    if (VIRTUAL) {",
		"      body.style.position = 'relative';",
		"      body.style.display = 'block';",
		"      body.style.height = (TOTAL_ROWS * ROW_HEIGHT) + 'px';",
		"      renderVirtual(0);",
		"      container.addEventListener('scroll', scrollHandler, { passive: true });",
		"    } else {",
		"      hydrateFullTableIfNeeded();",
		"    }",
		"    const offsets = randomOffsets(12);",
		"    const failures = await verifyOffsets(offsets);",
		"    recordMetrics(failures, offsets.length);",
		"    jumpBtn.addEventListener('click', () => {",
		"      const val = Number(offsetInput.value) || 0;",
		"      scrollToOffset(Math.min(Math.max(0, val), TOTAL_BYTES - 1));",
		"    });",
		"  };",
		"  init().catch(err => {",
		"    console.error(err);",
		"    window.__fractalMetrics = { streaming: STREAMING, virtual: VIRTUAL, error: err.message, pass: false };",
		"    status.textContent = '❌ error';",
		"  });",
		"})();"
	];
	const script = scriptLines.join("\n");
	return "</tbody></table></div><pre id=\"debug\"></pre><script>" + script + "</script></body></html>";
}

async function startFractalServer({ streaming = false, virtual = true, viewportRows = DEFAULT_VIEWPORT_ROWS, bufferRows = DEFAULT_BUFFER_ROWS } = {}) {
	const meta = { chunkCount: 0, htmlBytes: 0 };
	const sockets = new Set();
	const server = http.createServer((req, res) => {
		meta.chunkCount = 0;
		meta.htmlBytes = 0;

		if (req.url && req.url.startsWith("/fractal.bin")) {
			res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": FRACTAL_DATA.length });
			res.end(FRACTAL_DATA);
			return;
		}

		const head = buildHead({ streaming, virtual, viewportRows, bufferRows });
		const tail = buildTail({ streaming, virtual });

		if (streaming) {
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Transfer-Encoding": "chunked" });
			res.write(head);
			meta.chunkCount += 1;
			meta.htmlBytes += Buffer.byteLength(head);
			if (!virtual) {
				for (let row = 0; row < TOTAL_ROWS; row += STREAM_CHUNK_ROWS) {
					let chunk = "";
					for (let r = row; r < Math.min(TOTAL_ROWS, row + STREAM_CHUNK_ROWS); r += 1) {
						chunk += renderRow(r, FRACTAL_DATA);
					}
					res.write(chunk);
					meta.chunkCount += 1;
					meta.htmlBytes += Buffer.byteLength(chunk);
				}
			}
			res.end(tail);
			meta.htmlBytes += Buffer.byteLength(tail);
		} else {
			let html = head;
			if (!virtual) {
				let rows = "";
				for (let r = 0; r < TOTAL_ROWS; r += 1) {
					rows += renderRow(r, FRACTAL_DATA);
				}
				html += rows;
			}
			html += tail;
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			meta.htmlBytes = Buffer.byteLength(html);
			meta.chunkCount = 1;
			res.end(html);
		}
	});

	server.on("connection", socket => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});

	return new Promise(resolve => {
		server.listen(0, () => {
			const port = server.address().port;
			resolve({
				url: `http://localhost:${port}/`,
				stop: () => new Promise(done => {
					for (const socket of sockets) {
						try {
							socket.destroy();
						} catch (e) {
							// ignore
						}
					}
					server.close(done);
				}),
				meta
			});
		});
	});
}

module.exports = {
	startFractalServer,
	FRACTAL_DATA,
	FRACTAL_SIZE,
	ROW_BYTES,
	TOTAL_ROWS
};
