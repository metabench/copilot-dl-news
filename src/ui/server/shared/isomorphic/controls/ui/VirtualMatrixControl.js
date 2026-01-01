"use strict";

/**
 * VirtualMatrixControl
 *
 * A lightweight virtual-scrolling matrix renderer.
 *
 * It renders a scroll viewport + spacer, then uses a tiny inline script to
 * paint only the visible window of cells (plus buffers) as absolutely-positioned divs.
 *
 * Design goal: keep DOM bounded for large matrices.
 * Data model: row/col keys + labels, and a sparse list of special cells.
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

function normalizeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

class VirtualMatrixControl extends Control {
  /**
   * @param {object} spec
   * @param {string} [spec.testId]
   * @param {string} [spec.viewportTestId]
  * @param {string} [spec.cornerLabel]
   * @param {Array<string|number>} spec.rowKeys
   * @param {Array<string>} spec.rowLabels
   * @param {Array<string>} [spec.rowTitles]
   * @param {Array<string|number>} spec.colKeys
   * @param {Array<string>} spec.colLabels
   * @param {Array<string>} [spec.colTitles]
   * @param {Array<object>} [spec.specialCells]
   * @param {object} [spec.cellLink]
   * @param {string} [spec.cellLink.path='/cell']
   * @param {string} [spec.cellLink.rowParam='row']
   * @param {string} [spec.cellLink.colParam='col']
   * @param {object} [spec.cellLink.params]
   * @param {object} [spec.layout]
   * @param {number} [spec.layout.cellW=44]
   * @param {number} [spec.layout.cellH=26]
   * @param {number} [spec.layout.rowHeaderW=220]
   * @param {number} [spec.layout.colHeaderH=120]
   * @param {number} [spec.layout.bufferRows=4]
   * @param {number} [spec.layout.bufferCols=4]
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: spec.tagName || "div",
      __type_name: spec.__type_name || "virtual_matrix_control"
    });

    this.testId = spec.testId || null;
    this.viewportTestId = spec.viewportTestId || "vm-viewport";

    this.cornerLabel = spec.cornerLabel || "";

    this.rowKeys = Array.isArray(spec.rowKeys) ? spec.rowKeys : [];
    this.rowLabels = Array.isArray(spec.rowLabels) ? spec.rowLabels : [];
    this.rowTitles = Array.isArray(spec.rowTitles) ? spec.rowTitles : this.rowLabels;

    this.colKeys = Array.isArray(spec.colKeys) ? spec.colKeys : [];
    this.colLabels = Array.isArray(spec.colLabels) ? spec.colLabels : [];
    this.colTitles = Array.isArray(spec.colTitles) ? spec.colTitles : this.colLabels;

    this.specialCells = Array.isArray(spec.specialCells) ? spec.specialCells : [];

    const cellLink = spec.cellLink && typeof spec.cellLink === "object" ? spec.cellLink : {};
    this.cellLink = {
      path: typeof cellLink.path === "string" ? cellLink.path : "/cell",
      rowParam: typeof cellLink.rowParam === "string" ? cellLink.rowParam : "row",
      colParam: typeof cellLink.colParam === "string" ? cellLink.colParam : "col",
      params: cellLink.params && typeof cellLink.params === "object" ? cellLink.params : null
    };

    const layout = spec.layout && typeof spec.layout === "object" ? spec.layout : {};
    this.layout = {
      cellW: Math.max(16, normalizeInt(layout.cellW, 44)),
      cellH: Math.max(16, normalizeInt(layout.cellH, 26)),
      rowHeaderW: Math.max(80, normalizeInt(layout.rowHeaderW, 220)),
      colHeaderH: Math.max(40, normalizeInt(layout.colHeaderH, 120)),
      bufferRows: Math.max(0, normalizeInt(layout.bufferRows, 4)),
      bufferCols: Math.max(0, normalizeInt(layout.bufferCols, 4))
    };

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    const ctx = this.context;

    const root = makeEl(ctx, "div", "virtual-matrix", {
      ...(this.testId ? { "data-testid": this.testId } : null),
      "data-cell-w": this.layout.cellW,
      "data-cell-h": this.layout.cellH,
      "data-row-header-w": this.layout.rowHeaderW,
      "data-col-header-h": this.layout.colHeaderH,
      "data-buffer-rows": this.layout.bufferRows,
      "data-buffer-cols": this.layout.bufferCols,
      "data-vm-ready": "0",
      "data-render-seq": "0"
    });

    const viewport = makeEl(ctx, "div", "vm-viewport", {
      "data-testid": this.viewportTestId
    });

    const corner = makeEl(ctx, "div", "vm-corner");
    if (this.cornerLabel) {
      corner.add(text(ctx, this.cornerLabel));
    }

    const spacer = makeEl(ctx, "div", "vm-spacer");
    const colHeaders = makeEl(ctx, "div", "vm-col-headers");
    const rowHeaders = makeEl(ctx, "div", "vm-row-headers");
    const cellsLayer = makeEl(ctx, "div", "vm-cells");

    viewport.add(corner);
    viewport.add(spacer);
    viewport.add(colHeaders);
    viewport.add(rowHeaders);
    viewport.add(cellsLayer);

    root.add(viewport);

    const payload = {
      cornerLabel: this.cornerLabel,
      rowKeys: this.rowKeys,
      rowLabels: this.rowLabels,
      rowTitles: this.rowTitles,
      colKeys: this.colKeys,
      colLabels: this.colLabels,
      colTitles: this.colTitles,
      specialCells: this.specialCells,
      cellLink: this.cellLink
    };

    const dataScript = makeEl(ctx, "script", null, {
      type: "application/json",
      "data-vm-role": "data"
    });
    dataScript.add(text(ctx, JSON.stringify(payload)));
    root.add(dataScript);

    const initScript = makeEl(ctx, "script", null, { "data-vm-role": "init" });
    initScript.add(
      text(
        ctx,
        `
(() => {
  const clamp = (n, min, max) => (n < min ? min : (n > max ? max : n));
  const ensureInit = () => {
    if (window.__VMATRIX_INIT__) return;
    window.__VMATRIX_INIT__ = true;

    const parseJson = (scriptEl) => {
      if (!scriptEl) return null;
      try { return JSON.parse(scriptEl.textContent || 'null'); } catch { return null; }
    };

    const buildHrefFor = (cellLink) => {
      const safe = (cellLink && typeof cellLink === 'object') ? cellLink : null;
      const path = (safe && safe.path) ? String(safe.path) : '/cell';
      const rowParam = (safe && safe.rowParam) ? String(safe.rowParam) : 'row';
      const colParam = (safe && safe.colParam) ? String(safe.colParam) : 'col';

      const extra = (safe && safe.params && typeof safe.params === 'object') ? safe.params : null;
      const baseParams = new URLSearchParams();
      if (extra) {
        for (const k of Object.keys(extra)) {
          const v = extra[k];
          if (v === undefined || v === null || v === '') continue;
          baseParams.set(String(k), String(v));
        }
      }

      const baseQuery = baseParams.toString();
      const basePrefix = baseQuery ? (baseQuery + '&') : '';

      const enc = encodeURIComponent;
      const rp = enc(rowParam);
      const cp = enc(colParam);

      return (rowKey, colKey) => {
        return path + '?' + basePrefix + rp + '=' + enc(String(rowKey)) + '&' + cp + '=' + enc(String(colKey));
      };
    };

    const initOne = (root) => {
      if (!root || root.getAttribute('data-vm-init') === '1') return;
      root.setAttribute('data-vm-init', '1');

      const dataEl = root.querySelector('script[data-vm-role="data"][type="application/json"]');
      const payload = parseJson(dataEl);
      if (!payload) return;

      const rowKeys = Array.isArray(payload.rowKeys) ? payload.rowKeys : [];
      const rowLabels = Array.isArray(payload.rowLabels) ? payload.rowLabels : [];
      const rowTitles = Array.isArray(payload.rowTitles) ? payload.rowTitles : rowLabels;
      const colKeys = Array.isArray(payload.colKeys) ? payload.colKeys : [];
      const colLabels = Array.isArray(payload.colLabels) ? payload.colLabels : [];
      const colTitles = Array.isArray(payload.colTitles) ? payload.colTitles : colLabels;
      const specialCells = Array.isArray(payload.specialCells) ? payload.specialCells : [];

      const buildHref = buildHrefFor(payload.cellLink);

      const cellW = Number(root.getAttribute('data-cell-w')) || 44;
      const cellH = Number(root.getAttribute('data-cell-h')) || 26;
      const rowHeaderW = Number(root.getAttribute('data-row-header-w')) || 220;
      const colHeaderH = Number(root.getAttribute('data-col-header-h')) || 120;
      const bufferRows = Number(root.getAttribute('data-buffer-rows')) || 4;
      const bufferCols = Number(root.getAttribute('data-buffer-cols')) || 4;

      const viewport = root.querySelector('.vm-viewport');
      const corner = root.querySelector('.vm-corner');
      const spacer = root.querySelector('.vm-spacer');
      const colLayer = root.querySelector('.vm-col-headers');
      const rowLayer = root.querySelector('.vm-row-headers');
      const cellLayer = root.querySelector('.vm-cells');

      if (!viewport || !spacer || !colLayer || !rowLayer || !cellLayer) return;

      // Sparse lookup by key string.
      const specialByKey = new Map();
      for (const cell of specialCells) {
        if (!cell) continue;
        const rk = cell.rowKey;
        const ck = cell.colKey;
        specialByKey.set(String(rk) + '|' + String(ck), cell);
      }

      const totalRows = rowKeys.length;
      const totalCols = colKeys.length;

      // Set scroll extents.
      spacer.style.position = 'relative';
      spacer.style.width = String(rowHeaderW + (totalCols * cellW)) + 'px';
      spacer.style.height = String(colHeaderH + (totalRows * cellH)) + 'px';

      viewport.style.position = 'relative';

      if (corner) {
        corner.style.position = 'absolute';
        corner.style.left = '0px';
        corner.style.top = '0px';
        corner.style.width = String(rowHeaderW) + 'px';
        corner.style.height = String(colHeaderH) + 'px';
        corner.style.display = 'flex';
        corner.style.alignItems = 'flex-end';
        corner.style.padding = '8px 10px';
        corner.style.fontWeight = '600';
        corner.style.fontSize = '12px';
        corner.style.color = 'rgba(212,165,116,0.95)';
        corner.style.background = '#120e0b';
        corner.style.borderRight = '1px solid rgba(74,54,40,1)';
        corner.style.borderBottom = '1px solid rgba(74,54,40,1)';
        corner.style.zIndex = '4';
      }

      colLayer.style.position = 'absolute';
  colLayer.style.left = String(rowHeaderW) + 'px';
  colLayer.style.top = '0px';
  colLayer.style.height = String(colHeaderH) + 'px';
      colLayer.style.zIndex = '3';

      rowLayer.style.position = 'absolute';
  rowLayer.style.left = '0px';
  rowLayer.style.top = String(colHeaderH) + 'px';
  rowLayer.style.width = String(rowHeaderW) + 'px';
      rowLayer.style.zIndex = '2';

      cellLayer.style.position = 'absolute';
      cellLayer.style.left = String(rowHeaderW) + 'px';
      cellLayer.style.top = String(colHeaderH) + 'px';

      let raf = 0;
      let renderSeq = 0;
      let lastWindowKey = null;

      const clearLayer = (el) => {
        while (el.firstChild) el.removeChild(el.firstChild);
      };

      const render = () => {
        raf = 0;

        const scrollTop = viewport.scrollTop || 0;
        const scrollLeft = viewport.scrollLeft || 0;

        // Counteract scroll so headers appear pinned.
        colLayer.style.transform = 'translateX(' + String(scrollLeft) + 'px)';
        rowLayer.style.transform = 'translateY(' + String(scrollTop) + 'px)';
        if (corner) corner.style.transform = 'translate(' + String(scrollLeft) + 'px, ' + String(scrollTop) + 'px)';

        const vpW = viewport.clientWidth || 0;
        const vpH = viewport.clientHeight || 0;

        const approxFirstRow = Math.floor(scrollTop / cellH);
        const approxFirstCol = Math.floor(scrollLeft / cellW);

        const visibleRows = Math.ceil((vpH || 1) / cellH);
        const visibleCols = Math.ceil((vpW || 1) / cellW);

        const firstRow = clamp(approxFirstRow - bufferRows, 0, Math.max(0, totalRows - 1));
        const firstCol = clamp(approxFirstCol - bufferCols, 0, Math.max(0, totalCols - 1));
        const lastRow = clamp(approxFirstRow + visibleRows + bufferRows, 0, Math.max(0, totalRows - 1));
        const lastCol = clamp(approxFirstCol + visibleCols + bufferCols, 0, Math.max(0, totalCols - 1));

        const windowKey = String(firstRow) + ':' + String(lastRow) + ':' + String(firstCol) + ':' + String(lastCol);
        if (lastWindowKey === windowKey && root.getAttribute('data-vm-ready') === '1') {
          return;
        }

        lastWindowKey = windowKey;
        renderSeq += 1;

        clearLayer(colLayer);
        clearLayer(rowLayer);
        clearLayer(cellLayer);

        // Column headers
        for (let c = firstCol; c <= lastCol; c += 1) {
          const col = document.createElement('div');
          col.className = 'vm-col-header';
          col.style.position = 'absolute';
          col.style.left = String(c * cellW) + 'px';
          col.style.top = '0px';
          col.style.width = String(cellW) + 'px';
          col.style.height = String(colHeaderH) + 'px';

          const inner = document.createElement('div');
          inner.className = 'vm-col-header-inner';

          const labelSpan = document.createElement('span');
          labelSpan.className = 'vm-col-label';
          labelSpan.textContent = String(colLabels[c] ?? '');
          const title = String(colTitles[c] ?? colLabels[c] ?? '');
          if (title) labelSpan.setAttribute('title', title);

          inner.appendChild(labelSpan);
          col.appendChild(inner);
          colLayer.appendChild(col);
        }

        // Row headers
        for (let r = firstRow; r <= lastRow; r += 1) {
          const row = document.createElement('div');
          row.className = 'vm-row-header';
          row.style.position = 'absolute';
          row.style.left = '0px';
          row.style.top = String(r * cellH) + 'px';
          row.style.width = String(rowHeaderW) + 'px';
          row.style.height = String(cellH) + 'px';
          row.setAttribute('title', String(rowTitles[r] ?? rowLabels[r] ?? ''));
          row.textContent = String(rowLabels[r] ?? '');
          rowLayer.appendChild(row);
        }

        let cellCount = 0;

        // Cells
        for (let r = firstRow; r <= lastRow; r += 1) {
          const rk = rowKeys[r];
          for (let c = firstCol; c <= lastCol; c += 1) {
            const ck = colKeys[c];
            const special = specialByKey.get(String(rk) + '|' + String(ck)) || null;
            const state = (special && special.state) ? String(special.state) : 'unchecked';
            const cls = (special && special.className) ? String(special.className) : 'cell--none';
            const title = (special && special.title) ? String(special.title) : '';
            const glyph = (special && special.glyph) ? String(special.glyph) : '';
            const ageLabel = (special && special.ageLabel) ? String(special.ageLabel) : '';

            const el = document.createElement('div');
            el.className = 'vm-cell cell ' + cls;
            el.style.position = 'absolute';
            el.style.left = String(c * cellW) + 'px';
            el.style.top = String(r * cellH) + 'px';
            el.style.width = String(cellW) + 'px';
            el.style.height = String(cellH) + 'px';
            el.setAttribute('data-testid', 'vm-cell');
            el.setAttribute('data-row', String(r));
            el.setAttribute('data-col', String(c));
            el.setAttribute('data-state', state);
            if (title) el.setAttribute('title', title);

            const a = document.createElement('a');
            a.className = 'cell-link';
            a.setAttribute('href', buildHref(rk, ck));
            a.setAttribute('aria-label', 'Open cell');
            if (glyph) a.appendChild(document.createTextNode(glyph));

            if (ageLabel) {
              const sub = document.createElement('span');
              sub.className = 'cell-age';
              sub.textContent = ageLabel;
              a.appendChild(sub);
            }

            el.appendChild(a);
            cellLayer.appendChild(el);
            cellCount += 1;
          }
        }

        root.setAttribute('data-vm-ready', '1');
        root.setAttribute('data-render-seq', String(renderSeq));
        root.setAttribute('data-total-rows', String(totalRows));
        root.setAttribute('data-total-cols', String(totalCols));
        root.setAttribute('data-first-row', String(firstRow));
        root.setAttribute('data-first-col', String(firstCol));
        root.setAttribute('data-last-row', String(lastRow));
        root.setAttribute('data-last-col', String(lastCol));
        root.setAttribute('data-cell-count', String(cellCount));
      };

      const scheduleRender = () => {
        if (raf) return;
        raf = window.requestAnimationFrame(render);
      };

      // Smoothness: avoid layout thrash; try passive scroll listener.
      try {
        viewport.addEventListener('scroll', scheduleRender, { passive: true });
      } catch {
        viewport.addEventListener('scroll', scheduleRender);
      }

      // Smoothness: rerender on resize.
      if (typeof ResizeObserver === 'function') {
        try {
          const ro = new ResizeObserver(() => scheduleRender());
          ro.observe(viewport);
        } catch {
          // ignore
        }
      }

      window.addEventListener('resize', scheduleRender);

      // Initial render.
      scheduleRender();
    };

    const initAll = () => {
      const roots = document.querySelectorAll('.virtual-matrix');
      for (const root of roots) initOne(root);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initAll);
    } else {
      initAll();
    }
  };

  ensureInit();
})();
`
      )
    );

    root.add(initScript);

    this.add(root);
  }
}

module.exports = VirtualMatrixControl;
