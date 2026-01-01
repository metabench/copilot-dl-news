"use strict";

const { installConsoleNoiseFilter } = require("../../../client/consoleNoiseFilter");
installConsoleNoiseFilter();

const jsgui = require("jsgui3-client");
const { Control, Active_HTML_Document, controls } = jsgui;

// This lab runs under jsgui3-server (Node) but needs the same jsgui implementation.
if (typeof window === "undefined" && typeof document === "undefined") {
	global.window = global.window || {};
	global.document = global.document || {};
}

function toSingleQuoteJson(value) {
	return JSON.stringify(value).replace(/"/g, "'");
}

function tag(ctx, tagName, spec = {}) {
	const Ctor = jsgui[tagName] || Control;
	return new Ctor({ context: ctx, tagName, __type_name: tagName, ...spec });
}

function clamp(n, min, max) {
	if (n < min) return min;
	if (n > max) return max;
	return n;
}

function makeLabels(prefix, count) {
	const out = new Array(count);
	for (let i = 0; i < count; i++) out[i] = `${prefix} ${i}`;
	return out;
}

class VirtualMatrixControl extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "section",
			__type_name: spec.__type_name || "virtual_matrix_control"
		});

		this.add_class("virtual-matrix");

		if (!spec.el) {
			this.compose();
			this.dom.attributes["data-jsgui-fields"] = toSingleQuoteJson({ view: "a" });
		}
	}

	compose() {
		const ctx = this.context;

		const header = tag(ctx, "header");
		header.add_class("virtual-matrix__header");

		const title = tag(ctx, "h2");
		title.add_text("Virtual Matrix Scroll Lab");

		const note = tag(ctx, "p");
		note.add_text("Viewport-windowed cell rendering (bounded DOM) + deterministic scroll/flip checks.");

		const btn = tag(ctx, "button");
		btn.dom.attributes["data-testid"] = "flip-axes";
		btn.add_class("virtual-matrix__btn");
		btn.add_text("Flip axes");

		const status = tag(ctx, "div");
		status.dom.attributes["data-testid"] = "vm-status";
		status.add_class("virtual-matrix__status");
		status.add_text("(not activated)");

		header.add(title);
		header.add(note);
		header.add(btn);
		header.add(status);
		this.add(header);

		const stage = tag(ctx, "div");
		stage.dom.attributes["data-testid"] = "vm-stage";
		stage.add_class("virtual-matrix__stage");

		const corner = tag(ctx, "div");
		corner.dom.attributes["data-testid"] = "vm-corner";
		corner.add_class("virtual-matrix__corner");
		corner.add_text("Row \\ Col");

		const colWrap = tag(ctx, "div");
		colWrap.dom.attributes["data-testid"] = "vm-col-headers";
		colWrap.add_class("virtual-matrix__col-wrap");

		const rowWrap = tag(ctx, "div");
		rowWrap.dom.attributes["data-testid"] = "vm-row-headers";
		rowWrap.add_class("virtual-matrix__row-wrap");

		const viewport = tag(ctx, "div");
		viewport.dom.attributes["data-testid"] = "vm-viewport";
		viewport.add_class("virtual-matrix__viewport");

		const spacer = tag(ctx, "div");
		spacer.dom.attributes["data-testid"] = "vm-spacer";
		spacer.add_class("virtual-matrix__spacer");

		const cellLayer = tag(ctx, "div");
		cellLayer.dom.attributes["data-testid"] = "vm-cells";
		cellLayer.add_class("virtual-matrix__cells");

		spacer.add(cellLayer);
		viewport.add(spacer);

		stage.add(corner);
		stage.add(colWrap);
		stage.add(rowWrap);
		stage.add(viewport);

		this.add(stage);

		this.dom.attributes["data-jsgui-ctrl-fields"] = toSingleQuoteJson({
			flipBtn: btn._id(),
			status: status._id(),
			viewport: viewport._id(),
			spacer: spacer._id(),
			cellLayer: cellLayer._id(),
			rowWrap: rowWrap._id(),
			colWrap: colWrap._id(),
			corner: corner._id()
		});
	}

	activate(el) {
		super.activate(el);
		if (this.__activatedOnce) return;
		this.__activatedOnce = true;

		const root = el || this.dom.el;
		if (!root) return;

		root.setAttribute("data-activated", "1");

		const cellW = 64;
		const cellH = 26;
		const rowHeaderW = 160;
		const colHeaderH = 44;
		const bufferRows = 4;
		const bufferCols = 4;

		root.setAttribute("data-cell-w", String(cellW));
		root.setAttribute("data-cell-h", String(cellH));
		root.setAttribute("data-row-header-w", String(rowHeaderW));
		root.setAttribute("data-col-header-h", String(colHeaderH));
		root.setAttribute("data-buffer-rows", String(bufferRows));
		root.setAttribute("data-buffer-cols", String(bufferCols));

		const viewportEl = this.viewport && this.viewport.dom ? this.viewport.dom.el : null;
		const spacerEl = this.spacer && this.spacer.dom ? this.spacer.dom.el : null;
		const cellLayerEl = this.cellLayer && this.cellLayer.dom ? this.cellLayer.dom.el : null;
		const rowWrapEl = this.rowWrap && this.rowWrap.dom ? this.rowWrap.dom.el : null;
		const colWrapEl = this.colWrap && this.colWrap.dom ? this.colWrap.dom.el : null;
		const statusEl = this.status && this.status.dom ? this.status.dom.el : null;

		if (!viewportEl || !spacerEl || !cellLayerEl || !rowWrapEl || !colWrapEl) return;

		// Apply layout constants as inline CSS so the lab works without any build step.
		root.style.setProperty("--vm-row-header-w", `${rowHeaderW}px`);
		root.style.setProperty("--vm-col-header-h", `${colHeaderH}px`);
		root.style.setProperty("--vm-cell-w", `${cellW}px`);
		root.style.setProperty("--vm-cell-h", `${cellH}px`);

		let view = (this._persisted_fields && this._persisted_fields.view) === "b" ? "b" : "a";
		let renderSeq = 0;

		const modelA = {
			rowCount: 4000,
			colCount: 1500,
			rowPrefix: "Place",
			colPrefix: "Host"
		};

		const modelB = {
			rowCount: modelA.colCount,
			colCount: modelA.rowCount,
			rowPrefix: modelA.colPrefix,
			colPrefix: modelA.rowPrefix
		};

		modelA.rowLabels = makeLabels(modelA.rowPrefix, modelA.rowCount);
		modelA.colLabels = makeLabels(modelA.colPrefix, modelA.colCount);
		modelB.rowLabels = makeLabels(modelB.rowPrefix, modelB.rowCount);
		modelB.colLabels = makeLabels(modelB.colPrefix, modelB.colCount);

		const getModel = () => (view === "b" ? modelB : modelA);

		const clearChildren = (node) => {
			while (node.firstChild) node.removeChild(node.firstChild);
		};

		const renderWindow = () => {
			const model = getModel();
			const totalRows = model.rowCount;
			const totalCols = model.colCount;

			root.setAttribute("data-view", view);
			root.setAttribute("data-total-rows", String(totalRows));
			root.setAttribute("data-total-cols", String(totalCols));

			spacerEl.style.width = `${totalCols * cellW}px`;
			spacerEl.style.height = `${totalRows * cellH}px`;

			const vpW = viewportEl.clientWidth || 1;
			const vpH = viewportEl.clientHeight || 1;
			const scrollLeft = viewportEl.scrollLeft || 0;
			const scrollTop = viewportEl.scrollTop || 0;

			const approxFirstRow = Math.floor(scrollTop / cellH);
			const approxFirstCol = Math.floor(scrollLeft / cellW);
			const visibleRows = Math.ceil(vpH / cellH);
			const visibleCols = Math.ceil(vpW / cellW);

			const firstRow = clamp(approxFirstRow - bufferRows, 0, totalRows - 1);
			const firstCol = clamp(approxFirstCol - bufferCols, 0, totalCols - 1);
			const lastRow = clamp(approxFirstRow + visibleRows + bufferRows, 0, totalRows - 1);
			const lastCol = clamp(approxFirstCol + visibleCols + bufferCols, 0, totalCols - 1);

			root.setAttribute("data-first-row", String(firstRow));
			root.setAttribute("data-first-col", String(firstCol));
			root.setAttribute("data-last-row", String(lastRow));
			root.setAttribute("data-last-col", String(lastCol));

			clearChildren(cellLayerEl);
			clearChildren(rowWrapEl);
			clearChildren(colWrapEl);

			// Column headers (visible only)
			for (let c = firstCol; c <= lastCol; c++) {
				const x = c * cellW - scrollLeft;
				if (x < -cellW || x > vpW + cellW) continue;
				const elh = document.createElement("div");
				elh.className = "virtual-matrix__col";
				elh.style.left = `${x}px`;
				elh.style.width = `${cellW}px`;
				elh.title = model.colLabels[c];
				elh.textContent = model.colLabels[c];
				colWrapEl.appendChild(elh);
			}

			// Row headers (visible only)
			for (let r = firstRow; r <= lastRow; r++) {
				const y = r * cellH - scrollTop;
				if (y < -cellH || y > vpH + cellH) continue;
				const elh = document.createElement("div");
				elh.className = "virtual-matrix__row";
				elh.style.top = `${y}px`;
				elh.style.height = `${cellH}px`;
				elh.title = model.rowLabels[r];
				elh.textContent = model.rowLabels[r];
				rowWrapEl.appendChild(elh);
			}

			// Cells
			let cellCount = 0;
			for (let r = firstRow; r <= lastRow; r++) {
				const top = r * cellH;
				for (let c = firstCol; c <= lastCol; c++) {
					const left = c * cellW;
					const cell = document.createElement("div");
					cell.className = "virtual-matrix__cell";
					cell.setAttribute("data-testid", "vm-cell");
					cell.setAttribute("data-row", String(r));
					cell.setAttribute("data-col", String(c));
					cell.style.top = `${top}px`;
					cell.style.left = `${left}px`;
					cell.style.width = `${cellW}px`;
					cell.style.height = `${cellH}px`;
					cell.textContent = `r${r},c${c}`;
					cellLayerEl.appendChild(cell);
					cellCount++;
				}
			}

			renderSeq++;
			root.setAttribute("data-render-seq", String(renderSeq));
			root.setAttribute("data-cell-count", String(cellCount));
			if (statusEl) {
				statusEl.textContent = `view=${view} rows=${totalRows} cols=${totalCols} cells=${cellCount} window=[${firstRow}:${lastRow}]x[${firstCol}:${lastCol}]`;
			}
		};

		let rafPending = false;
		const scheduleRender = () => {
			if (rafPending) return;
			rafPending = true;
			requestAnimationFrame(() => {
				rafPending = false;
				renderWindow();
			});
		};

		const setView = (next) => {
			view = next === "b" ? "b" : "a";
			if (!this._persisted_fields) this._persisted_fields = {};
			this._persisted_fields.view = view;
			viewportEl.scrollTop = 0;
			viewportEl.scrollLeft = 0;
			scheduleRender();
		};

		viewportEl.addEventListener("scroll", scheduleRender);

		const btnEl = this.flipBtn && this.flipBtn.dom ? this.flipBtn.dom.el : null;
		if (btnEl) {
			btnEl.addEventListener("click", () => {
				setView(view === "a" ? "b" : "a");
			});
		}

		setView(view);
	}
}

controls.virtual_matrix_control = VirtualMatrixControl;

class VirtualMatrixLabPage extends Active_HTML_Document {
	constructor(spec = {}) {
		super({ ...spec, __type_name: spec.__type_name || "virtual_matrix_lab_page" });
		if (!spec.el) this.compose();
	}

	compose() {
		const ctx = this.context;

		const favicon = tag(ctx, "link");
		favicon.dom.attributes.rel = "icon";
		favicon.dom.attributes.href = "data:,";
		this.head.add(favicon);

		const style = tag(ctx, "style");
		style.add_text(`
:root {
  --border: rgba(255, 255, 255, 0.12);
  --panel: #121212;
  --bg: #0b0b0b;
  --text: #e7e7e7;
  --gold: #e7c97a;
}

.virtual-matrix {
  display: grid;
  gap: 12px;
  padding: 16px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  color: var(--text);
  background: var(--bg);
}

.virtual-matrix__header {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  background: var(--panel);
}

.virtual-matrix__btn {
  width: fit-content;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #3a3a3a;
  background: #1f1f1f;
  color: inherit;
  cursor: pointer;
}

.virtual-matrix__btn:hover {
  background: #262626;
}

.virtual-matrix__status {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  opacity: 0.9;
}

.virtual-matrix__stage {
  position: relative;
  height: 640px;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  background: #111;
  overflow: hidden;
}

.virtual-matrix__corner {
  position: absolute;
  left: 0;
  top: 0;
  width: var(--vm-row-header-w, 160px);
  height: var(--vm-col-header-h, 44px);
  display: grid;
  align-items: center;
  padding: 0 10px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  color: var(--gold);
  background: #120e0b;
  z-index: 3;
}

.virtual-matrix__col-wrap {
  position: absolute;
  left: var(--vm-row-header-w, 160px);
  top: 0;
  right: 0;
  height: var(--vm-col-header-h, 44px);
  overflow: hidden;
  border-bottom: 1px solid var(--border);
  background: #120e0b;
  z-index: 2;
}

.virtual-matrix__row-wrap {
  position: absolute;
  left: 0;
  top: var(--vm-col-header-h, 44px);
  width: var(--vm-row-header-w, 160px);
  bottom: 0;
  overflow: hidden;
  border-right: 1px solid var(--border);
  background: #120e0b;
  z-index: 2;
}

.virtual-matrix__viewport {
  position: absolute;
  left: var(--vm-row-header-w, 160px);
  top: var(--vm-col-header-h, 44px);
  right: 0;
  bottom: 0;
  overflow: auto;
  background: #0d0d0d;
}

.virtual-matrix__spacer {
  position: relative;
}

.virtual-matrix__cells {
  position: absolute;
  inset: 0;
}

.virtual-matrix__cell {
  position: absolute;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(231, 231, 231, 0.9);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.virtual-matrix__cell:nth-child(7n) {
  color: #3fe36e;
}

.virtual-matrix__col {
  position: absolute;
  top: 0;
  height: var(--vm-col-header-h, 44px);
  box-sizing: border-box;
  display: grid;
  align-items: end;
  padding: 0 6px 6px;
  border-right: 1px solid rgba(255, 255, 255, 0.07);
  color: var(--gold);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.virtual-matrix__row {
  position: absolute;
  left: 0;
  right: 0;
  box-sizing: border-box;
  display: grid;
  align-items: center;
  padding: 0 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  color: rgba(231, 231, 231, 0.95);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`);
		this.head.add(style);

		const host = tag(ctx, "main");
		host.add(new VirtualMatrixControl({ context: ctx }));
		this.body.add(host);
	}
}

controls.virtual_matrix_lab_page = VirtualMatrixLabPage;

module.exports = jsgui;
