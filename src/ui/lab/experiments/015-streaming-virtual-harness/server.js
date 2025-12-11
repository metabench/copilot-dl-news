"use strict";

const http = require("http");
const { performance } = require("perf_hooks");

const DEFAULT_ITEMS = 2000;
const DEFAULT_CHUNK = 200;
const DEFAULT_VIEWPORT = 30;
const DEFAULT_BUFFER = 10;

function renderItems(items) {
	return items.map(idx => `<li data-idx="${idx}">Item ${idx}</li>`).join("");
}

function buildHtml({ slice, streaming }) {
	const head = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><ul id=\"list\">";
	const tail = `<script>
(() => {
  const nodes = document.querySelectorAll('li');
  const t0 = performance.now();
  nodes.forEach(n => n.onclick = () => {});
  window.__activationMs = performance.now() - t0;
  window.__liCount = nodes.length;
})();
</script></ul></body></html>`;
	const body = renderItems(slice);
	return { head, body, tail };
}

async function startServer({ streaming, virtual, items = DEFAULT_ITEMS, chunkSize = DEFAULT_CHUNK, viewport = DEFAULT_VIEWPORT, buffer = DEFAULT_BUFFER }) {
	const meta = { items, chunkSize, viewport, buffer, streaming, virtual, chunkCount: 0, totalBytes: 0 };
	const server = http.createServer(async (req, res) => {
		const data = Array.from({ length: items }, (_, i) => i);
		const sliceEnd = virtual ? Math.min(items, viewport + buffer) : items;
		const slice = data.slice(0, sliceEnd);
		const { head, body, tail } = buildHtml({ slice, streaming });
		let chunkCount = 0;
		let totalBytes = 0;

		if (streaming) {
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Transfer-Encoding": "chunked" });
			res.write(head);
			totalBytes += Buffer.byteLength(head);
			for (let i = 0; i < slice.length; i += chunkSize) {
				const chunk = renderItems(slice.slice(i, i + chunkSize));
				res.write(chunk);
				totalBytes += Buffer.byteLength(chunk);
				chunkCount += 1;
			}
			totalBytes += Buffer.byteLength(tail);
			res.end(tail);
		} else {
			const html = head + body + tail;
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			totalBytes = Buffer.byteLength(html);
			res.end(html);
		}
		meta.chunkCount = chunkCount;
		meta.totalBytes = totalBytes;
	});

	await new Promise(resolve => server.listen(0, resolve));
	const port = server.address().port;
	const url = `http://localhost:${port}/`;

	return {
		url,
		stop: () => new Promise(resolve => server.close(resolve)),
		meta
	};
}

module.exports = { startServer, DEFAULT_ITEMS, DEFAULT_CHUNK, DEFAULT_VIEWPORT, DEFAULT_BUFFER };
