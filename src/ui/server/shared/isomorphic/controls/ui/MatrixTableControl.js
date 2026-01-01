"use strict";

/**
 * MatrixTableControl
 *
 * A small, reusable, isomorphic table control for rendering a matrix of values.
 * Designed for dense dashboards where row/column headers may need rotation.
 *
 * This control is intentionally generic:
 * - caller provides `rows`, `cols`
 * - caller provides label/title/key accessors
 * - caller provides a `renderCellTd({ row, col, rowIndex, colIndex })` callback that returns a <td>
 */

const jsgui = require("../../jsgui");

const { Control } = jsgui;
const StringControl = jsgui.String_Control;

function text(ctx, value) {
  return new StringControl({ context: ctx, text: String(value ?? "") });
}

function makeEl(ctx, tagName, className = null, attrs = null) {
  const el = new Control({ context: ctx, tagName, __type_name: tagName });
  if (className) el.add_class(className);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined) continue;
      el.dom.attributes[key] = String(value);
    }
  }
  return el;
}

function truncateLabel(label, maxLen) {
  const s = String(label ?? "");
  const limit = Number.isFinite(maxLen) ? Math.max(0, Math.trunc(maxLen)) : 0;
  if (!limit || s.length <= limit) return { display: s, truncated: false };
  if (limit <= 1) return { display: "…", truncated: true };
  return { display: s.slice(0, limit - 1) + "…", truncated: true };
}

class MatrixTableControl extends Control {
  /**
   * @param {object} spec
   * @param {Array<any>} spec.rows
   * @param {Array<any>} spec.cols
   * @param {string} [spec.tableTestId]
   * @param {string} [spec.cornerLabel] - top-left header label
   * @param {(row:any)=>string} [spec.getRowLabel]
   * @param {(row:any)=>string} [spec.getRowTitle]
   * @param {(row:any)=>string|number} [spec.getRowKey]
   * @param {(col:any)=>string} [spec.getColLabel]
   * @param {(col:any)=>string} [spec.getColTitle]
   * @param {(col:any)=>string|number} [spec.getColKey]
   * @param {(args:{row:any,col:any,rowIndex:number,colIndex:number})=>any} spec.renderCellTd
   * @param {object} [spec.header]
   * @param {'angle'|'vertical'} [spec.header.mode='angle']
   * @param {number} [spec.header.angleDeg=45]
   * @param {number} [spec.header.truncateAt=18]
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: spec.tagName || "div",
      __type_name: spec.__type_name || "matrix_table_control"
    });

    this.rows = Array.isArray(spec.rows) ? spec.rows : [];
    this.cols = Array.isArray(spec.cols) ? spec.cols : [];

    this.tableTestId = spec.tableTestId || null;
    this.cornerLabel = spec.cornerLabel || "";

    this.getRowLabel = typeof spec.getRowLabel === "function" ? spec.getRowLabel : (row) => String(row ?? "");
    this.getRowTitle = typeof spec.getRowTitle === "function" ? spec.getRowTitle : this.getRowLabel;
    this.getRowKey = typeof spec.getRowKey === "function" ? spec.getRowKey : (row, i) => i;

    this.getColLabel = typeof spec.getColLabel === "function" ? spec.getColLabel : (col) => String(col ?? "");
    this.getColTitle = typeof spec.getColTitle === "function" ? spec.getColTitle : this.getColLabel;
    this.getColKey = typeof spec.getColKey === "function" ? spec.getColKey : (col, i) => i;

    this.renderCellTd = typeof spec.renderCellTd === "function" ? spec.renderCellTd : null;

    const header = spec.header && typeof spec.header === "object" ? spec.header : {};
    this.headerMode = header.mode === "vertical" ? "vertical" : "angle";
    this.headerAngleDeg = Number.isFinite(header.angleDeg) ? Math.max(0, Math.min(90, Math.trunc(header.angleDeg))) : 45;
    this.headerTruncateAt = Number.isFinite(header.truncateAt) ? Math.max(0, Math.trunc(header.truncateAt)) : 18;

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    const ctx = this.context;

    const wrap = makeEl(ctx, "div", "matrix-wrap");
    const table = makeEl(ctx, "table", "matrix", this.tableTestId ? { "data-testid": this.tableTestId } : null);

    // Header
    const thead = makeEl(ctx, "thead");
    const trh = makeEl(ctx, "tr", null, { "data-testid": "matrix-col-headers" });

    const corner = makeEl(ctx, "th", "matrix-th matrix-th-corner", { title: this.cornerLabel || "" });
    corner.add(text(ctx, this.cornerLabel || ""));
    trh.add(corner);

    for (let colIndex = 0; colIndex < this.cols.length; colIndex += 1) {
      const col = this.cols[colIndex];
      const labelFull = this.getColLabel(col, colIndex);
      const titleFull = this.getColTitle(col, colIndex);
      const { display, truncated } = truncateLabel(labelFull, this.headerTruncateAt);

      const thClass = this.headerMode === "vertical"
        ? "matrix-th matrix-th-col matrix-th-col--vertical"
        : "matrix-th matrix-th-col matrix-th-col--angle";

      const th = makeEl(ctx, "th", thClass, {
        "data-col-key": this.getColKey(col, colIndex),
        title: truncated ? titleFull : titleFull
      });

      const inner = makeEl(ctx, "div", "matrix-th-col-inner", {
        style: this.headerMode === "angle" ? `--matrix-angle: ${this.headerAngleDeg}deg;` : undefined
      });
      const span = makeEl(ctx, "span", "matrix-th-col-label", {
        title: truncated ? titleFull : undefined,
        "data-full-label": titleFull
      });
      span.add(text(ctx, display));
      inner.add(span);
      th.add(inner);
      trh.add(th);
    }

    thead.add(trh);
    table.add(thead);

    // Body
    const tbody = makeEl(ctx, "tbody");

    for (let rowIndex = 0; rowIndex < this.rows.length; rowIndex += 1) {
      const row = this.rows[rowIndex];
      const tr = makeEl(ctx, "tr");

      const rowLabel = this.getRowLabel(row, rowIndex);
      const rowTitle = this.getRowTitle(row, rowIndex);

      const th = makeEl(ctx, "th", "matrix-place", {
        title: rowTitle,
        "data-row-key": this.getRowKey(row, rowIndex)
      });
      th.add(text(ctx, rowLabel));
      tr.add(th);

      for (let colIndex = 0; colIndex < this.cols.length; colIndex += 1) {
        const col = this.cols[colIndex];
        if (!this.renderCellTd) {
          tr.add(makeEl(ctx, "td", "matrix-td"));
          continue;
        }
        tr.add(this.renderCellTd({ row, col, rowIndex, colIndex }));
      }

      tbody.add(tr);
    }

    table.add(tbody);
    wrap.add(table);

    this.add(wrap);
  }
}

module.exports = MatrixTableControl;
