"use strict";

/**
 * Lab Experiment 016: Lifecycle-safe event binding
 * Run: node src/ui/lab/experiments/016-ap-lifecycle-event-bag/check.js
 */

class FakeEventTarget {
  constructor(name) {
    this.name = name;
    this._listeners = new Map();
    this.addCount = 0;
    this.removeCount = 0;
  }

  addEventListener(type, handler) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(handler);
    this.addCount++;
  }

  removeEventListener(type, handler) {
    const set = this._listeners.get(type);
    if (set) set.delete(handler);
    this.removeCount++;
  }

  listenerCount(type) {
    const set = this._listeners.get(type);
    return set ? set.size : 0;
  }
}

class ListenerBag {
  constructor() {
    this._bindings = [];
    this._active = true;
  }

  /**
   * @param {object} target must have addEventListener/removeEventListener
   * @param {string} type
   * @param {Function} handler
   */
  on(target, type, handler) {
    if (!this._active) return;
    if (!target?.addEventListener || !target?.removeEventListener) return;

    target.addEventListener(type, handler);
    this._bindings.push({ target, type, handler });
  }

  dispose() {
    if (!this._active) return;
    this._active = false;

    for (const { target, type, handler } of this._bindings) {
      try {
        target.removeEventListener(type, handler);
      } catch (e) {
        // ignore
      }
    }

    this._bindings.length = 0;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const svg = new FakeEventTarget("svg");
  const doc = new FakeEventTarget("document");

  const bag = new ListenerBag();
  const onDown = () => {};
  const onMove = () => {};
  const onUp = () => {};

  bag.on(svg, "mousedown", onDown);
  bag.on(doc, "mousemove", onMove);
  bag.on(doc, "mouseup", onUp);

  assert(svg.listenerCount("mousedown") === 1, "expected svg mousedown to be bound");
  assert(doc.listenerCount("mousemove") === 1, "expected document mousemove to be bound");
  assert(doc.listenerCount("mouseup") === 1, "expected document mouseup to be bound");

  const addsBefore = svg.addCount + doc.addCount;

  // Ensure no-ops after dispose.
  bag.dispose();
  bag.dispose();
  bag.on(doc, "mousemove", onMove);

  assert(svg.listenerCount("mousedown") === 0, "expected svg mousedown to be unbound");
  assert(doc.listenerCount("mousemove") === 0, "expected document mousemove to be unbound");
  assert(doc.listenerCount("mouseup") === 0, "expected document mouseup to be unbound");

  const addsAfter = svg.addCount + doc.addCount;
  assert(addsAfter === addsBefore, "expected no new bindings after dispose");

  console.log("✅ Experiment 016 passed", {
    adds: svg.addCount + doc.addCount,
    removes: svg.removeCount + doc.removeCount
  });
}

try {
  main();
  process.exit(0);
} catch (e) {
  console.error("❌ Experiment 016 failed", e?.message || e);
  process.exit(1);
}
