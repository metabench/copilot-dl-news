"use strict";

/**
 * Lab Experiment 017: DOM-free component store
 * Run: node src/ui/lab/experiments/017-ap-component-store/check.js
 */

class ComponentStore {
  constructor() {
    this._components = new Map();
    this._selectedId = null;
    this._nextId = 1;
  }

  add(type, data = {}) {
    const id = data.id || `comp${this._nextId++}`;

    if (type === "rect") {
      this._components.set(id, {
        id,
        type,
        x: data.x ?? 0,
        y: data.y ?? 0,
        width: data.width ?? 100,
        height: data.height ?? 60,
        fill: data.fill ?? "#000",
        stroke: data.stroke
      });
    } else if (type === "ellipse") {
      const rx = data.rx ?? 50;
      const ry = data.ry ?? 40;
      const cx = data.cx ?? rx;
      const cy = data.cy ?? ry;
      this._components.set(id, {
        id,
        type,
        x: cx - rx,
        y: cy - ry,
        width: rx * 2,
        height: ry * 2,
        fill: data.fill ?? "#000",
        stroke: data.stroke
      });
    } else if (type === "text") {
      this._components.set(id, {
        id,
        type,
        x: data.x ?? 0,
        y: data.y ?? 0,
        width: data.width ?? 100,
        height: data.height ?? 24,
        text: data.text ?? "Text",
        fill: data.fill ?? "#111",
        stroke: data.stroke
      });
    } else {
      return null;
    }

    this.select(id);
    return id;
  }

  select(id) {
    if (!id || !this._components.has(id)) {
      this._selectedId = null;
      return false;
    }
    this._selectedId = id;
    return true;
  }

  delete(id) {
    if (!id) return false;
    const ok = this._components.delete(id);
    if (this._selectedId === id) this._selectedId = null;
    return ok;
  }

  update(id, patch = {}) {
    const c = this._components.get(id);
    if (!c) return false;

    const next = { ...patch };
    ["x", "y", "width", "height"].forEach((k) => {
      if (next[k] === undefined) return;
      const n = typeof next[k] === "number" ? next[k] : parseFloat(String(next[k]).trim());
      if (!Number.isFinite(n)) delete next[k];
      else next[k] = n;
    });

    if (typeof next.fill === "string") c.fill = next.fill;
    if (typeof next.stroke === "string") c.stroke = next.stroke;

    if (typeof next.x === "number") c.x = next.x;
    if (typeof next.y === "number") c.y = next.y;
    if (typeof next.width === "number") c.width = Math.max(1, next.width);
    if (typeof next.height === "number") c.height = Math.max(1, next.height);

    return true;
  }

  getSelectionData() {
    if (!this._selectedId) return null;
    const c = this._components.get(this._selectedId);
    if (!c) return null;
    return {
      id: c.id,
      type: c.type,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      fill: c.fill,
      stroke: c.stroke
    };
  }

  getLayers() {
    const layers = [];
    this._components.forEach((c, id) => {
      layers.push({
        id,
        type: c.type,
        name: `${c.type} ${id}`,
        selected: id === this._selectedId
      });
    });
    return layers.reverse();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const store = new ComponentStore();

  const r1 = store.add("rect", { x: 10, y: 20, width: 30, height: 40, fill: "#123" });
  assert(typeof r1 === "string", "expected rect id");
  assert(store.getSelectionData().id === r1, "expected selection to be r1");

  const e1 = store.add("ellipse", { cx: 100, cy: 100, rx: 20, ry: 10, fill: "#0f0" });
  assert(store.getSelectionData().id === e1, "expected selection to be e1");

  store.update(e1, { x: "200", width: "50" });
  const sel = store.getSelectionData();
  assert(sel.x === 200, "expected numeric parsing for x");
  assert(sel.width === 50, "expected numeric parsing for width");

  const layers = store.getLayers();
  assert(layers.length === 2, "expected 2 layers");
  assert(layers[0].id === e1, "expected topmost-first ordering");

  store.delete(e1);
  assert(store.getSelectionData() === null, "expected selection cleared when deleted");

  console.log("✅ Experiment 017 passed", { layerCount: layers.length });
}

try {
  main();
  process.exit(0);
} catch (e) {
  console.error("❌ Experiment 017 failed", e?.message || e);
  process.exit(1);
}
