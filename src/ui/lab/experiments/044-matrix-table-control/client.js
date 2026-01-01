"use strict";

const { installConsoleNoiseFilter } = require("../../../client/consoleNoiseFilter");
installConsoleNoiseFilter();

const jsgui = require("jsgui3-client");
const { Control, Active_HTML_Document, controls } = jsgui;

// This lab runs under jsgui3-server (Node) but needs isomorphic controls to resolve
// to the same jsgui implementation as the rest of the page.
// Provide a minimal browser-ish global so shared isomorphic modules pick jsgui3-client.
if (typeof window === "undefined" && typeof document === "undefined") {
	global.window = global.window || {};
	global.document = global.document || {};
}

const MatrixTableControl = require("../../../server/shared/isomorphic/controls/ui/MatrixTableControl");

function toSingleQuoteJson(value) {
	return JSON.stringify(value).replace(/"/g, "'");
}

function tag(ctx, tagName, spec = {}) {
	const Ctor = jsgui[tagName] || Control;
	return new Ctor({ context: ctx, tagName, __type_name: tagName, ...spec });
}

function samplePlaces() {
	return [
		{ id: 101, label: "United Kingdom" },
		{ id: 102, label: "United States of America" },
		{ id: 103, label: "Bosnia and Herzegovina" },
		{ id: 104, label: "Papua New Guinea" },
		{ id: 105, label: "Central African Republic" }
	];
}

function sampleHosts() {
	return [
		"theguardian.com",
		"www.this-is-a-very-long-domain-name-example-01.com",
		"www.this-is-a-very-long-domain-name-example-02.com",
		"www.this-is-a-very-long-domain-name-example-03.com",
		"example.org"
	];
}

function cellValue(placeId, host) {
	// Deterministic pseudo-signal: stable across runs.
	let hash = placeId;
	for (let i = 0; i < host.length; i++) hash = (hash * 33 + host.charCodeAt(i)) >>> 0;
	return (hash % 7) === 0;
}

class MatrixTableLabControl extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "section",
			__type_name: spec.__type_name || "matrix_table_lab_control"
		});

		this.add_class("matrix-table-lab");

		if (!spec.el) {
			this.compose();
			this.dom.attributes["data-jsgui-fields"] = toSingleQuoteJson({ view: "a" });
		}
	}

	compose() {
		const ctx = this.context;

		const header = tag(ctx, "header");
		header.add_class("matrix-table-lab__header");

		const title = tag(ctx, "h2");
		title.add_text("MatrixTableControl Lab");

		const note = tag(ctx, "p");
		note.add_text("Rotated headers + truncation/tooltips + flip axes.");

		const btn = tag(ctx, "button");
		btn.dom.attributes["data-testid"] = "flip-axes";
		btn.add_class("matrix-table-lab__btn");
		btn.add_text("Flip axes");

		header.add(title);
		header.add(note);
		header.add(btn);
		this.add(header);

		// A: places as rows, hosts as cols
		const aWrap = tag(ctx, "div");
		aWrap.dom.attributes["data-testid"] = "matrix-view-a";
		aWrap.add_class("matrix-table-lab__view");

		const places = samplePlaces();
		const hosts = sampleHosts();

		aWrap.add(
			new MatrixTableControl({
				context: ctx,
				tableTestId: "matrix-table-a",
				cornerLabel: "Place \\ Host",
				rows: places,
				cols: hosts,
				getRowKey: (p) => p.id,
				getRowLabel: (p) => p.label,
				getRowTitle: (p) => p.label,
				getColKey: (h) => h,
				getColLabel: (h) => h,
				getColTitle: (h) => h,
				header: { mode: "angle", angleDeg: 45, truncateAt: 18 },
				renderCellTd: ({ row: place, col: host }) => {
					const ok = cellValue(place.id, host);
					const td = tag(ctx, "td");
					td.dom.attributes["data-testid"] = `cell-a-${place.id}-${host}`;
					td.add_class("matrix-td");
					td.add_text(ok ? "✓" : "");
					if (ok) td.add_class("matrix-td--ok");
					return td;
				}
			})
		);

		// B: hosts as rows, places as cols
		const bWrap = tag(ctx, "div");
		bWrap.dom.attributes["data-testid"] = "matrix-view-b";
		bWrap.add_class("matrix-table-lab__view");

		bWrap.add(
			new MatrixTableControl({
				context: ctx,
				tableTestId: "matrix-table-b",
				cornerLabel: "Host \\ Place",
				rows: hosts.map(h => ({ id: h, label: h })),
				cols: places,
				getRowKey: (h) => h.id,
				getRowLabel: (h) => h.label,
				getRowTitle: (h) => h.label,
				getColKey: (p) => p.id,
				getColLabel: (p) => p.label,
				getColTitle: (p) => p.label,
				header: { mode: "angle", angleDeg: 45, truncateAt: 18 },
				renderCellTd: ({ row: hostRow, col: place }) => {
					const ok = cellValue(place.id, hostRow.id);
					const td = tag(ctx, "td");
					td.dom.attributes["data-testid"] = `cell-b-${hostRow.id}-${place.id}`;
					td.add_class("matrix-td");
					td.add_text(ok ? "✓" : "");
					if (ok) td.add_class("matrix-td--ok");
					return td;
				}
			})
		);

		this.add(aWrap);
		this.add(bWrap);

		this.dom.attributes["data-jsgui-ctrl-fields"] = toSingleQuoteJson({
			flipBtn: btn._id()
		});
	}

	activate(el) {
		super.activate(el);
		if (this.__activatedOnce) return;
		this.__activatedOnce = true;

		const root = el || this.dom.el;
		if (!root) return;

		root.setAttribute("data-activated", "1");

		const getView = () => {
			const v = this._persisted_fields && this._persisted_fields.view;
			return v === "b" ? "b" : "a";
		};

		const setView = (next) => {
			if (!this._persisted_fields) this._persisted_fields = {};
			this._persisted_fields.view = next;
			root.setAttribute("data-view", next);
		};

		setView(getView());

		const btnEl = this.flipBtn && this.flipBtn.dom ? this.flipBtn.dom.el : null;
		if (btnEl) {
			btnEl.addEventListener("click", () => {
				setView(getView() === "a" ? "b" : "a");
			});
		}
	}
}

controls.matrix_table_control = MatrixTableControl;
controls.matrix_table_lab_control = MatrixTableLabControl;

class MatrixTableLabPage extends Active_HTML_Document {
	constructor(spec = {}) {
		super({ ...spec, __type_name: spec.__type_name || "matrix_table_lab_page" });
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
  --gold: #e7c97a;
}

.matrix-table-lab {
  display: grid;
  gap: 12px;
  padding: 16px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  color: #e7e7e7;
  background: #0b0b0b;
}

.matrix-table-lab__header {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  background: #121212;
}

.matrix-table-lab__btn {
  width: fit-content;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #3a3a3a;
  background: #1f1f1f;
  color: inherit;
  cursor: pointer;
}

.matrix-table-lab__btn:hover {
  background: #262626;
}

.matrix-wrap {
  overflow: auto;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  background: #111;
}

table.matrix {
  width: 100%;
  border-collapse: collapse;
  min-width: 920px;
}

th.matrix-th {
  position: sticky;
  top: 0;
  background: #120e0b;
  color: var(--gold);
  font-weight: 600;
  font-size: 12px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
}

th.matrix-th-corner {
  left: 0;
  z-index: 3;
}

th.matrix-place {
  position: sticky;
  left: 0;
  background: #120e0b;
  color: #e7e7e7;
  font-weight: 500;
  padding: 8px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  z-index: 2;
}

th.matrix-th-col {
  text-align: left;
  padding: 0;
  vertical-align: bottom;
  height: 120px;
  min-width: 44px;
  width: 44px;
  max-width: 44px;
}

.matrix-th-col-inner {
  position: relative;
  height: 120px;
  width: 44px;
}

th.matrix-th-col--angle .matrix-th-col-label {
  position: absolute;
  left: 6px;
  bottom: 6px;
  transform-origin: left bottom;
  transform: rotate(calc(-1 * var(--matrix-angle, 45deg)));
  white-space: nowrap;
  font-size: 11px;
  color: var(--gold);
}

th.matrix-th-col--vertical .matrix-th-col-label {
  position: absolute;
  left: 50%;
  bottom: 6px;
  transform: translateX(-50%);
  writing-mode: vertical-rl;
  text-orientation: mixed;
  white-space: nowrap;
  font-size: 11px;
  color: var(--gold);
}

td.matrix-td {
  padding: 6px;
  text-align: center;
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border);
  font-variant-numeric: tabular-nums;
  min-width: 44px;
  width: 44px;
}

td.matrix-td--ok {
  color: #3fe36e;
}

.matrix-table-lab[data-view="a"] [data-testid="matrix-view-b"],
.matrix-table-lab[data-view="b"] [data-testid="matrix-view-a"] {
  display: none;
}
`);
		this.head.add(style);

		const host = tag(ctx, "main");
		host.add(new MatrixTableLabControl({ context: ctx }));
		this.body.add(host);
	}
}

controls.matrix_table_lab_page = MatrixTableLabPage;

module.exports = jsgui;
