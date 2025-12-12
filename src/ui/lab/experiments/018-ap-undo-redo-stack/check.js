"use strict";

/**
 * Lab Experiment 018: Undo/redo command stack
 * Run: node src/ui/lab/experiments/018-ap-undo-redo-stack/check.js
 */

class ComponentStore {
  constructor() {
    this._components = new Map();
    this._selectedId = null;
    this._nextId = 1;
  }

  addRect(data = {}) {
    const id = data.id || `comp${this._nextId++}`;
    this._components.set(id, {
      id,
      type: "rect",
      x: data.x ?? 0,
      y: data.y ?? 0,
      width: data.width ?? 100,
      height: data.height ?? 60,
      fill: data.fill ?? "#000",
      stroke: data.stroke
    });
    this._selectedId = id;
    return id;
  }

  get(id) {
    return this._components.get(id) || null;
  }

  set(id, next) {
    if (!id) return false;
    if (!next) {
      this._components.delete(id);
      if (this._selectedId === id) this._selectedId = null;
      return true;
    }
    this._components.set(id, { ...next });
    return true;
  }

  update(id, patch) {
    const prev = this.get(id);
    if (!prev) return null;
    const next = { ...prev, ...patch };
    this.set(id, next);
    return { prev, next };
  }
}

class CommandStack {
  constructor() {
    this._done = [];
    this._undone = [];
  }

  do(command) {
    command.do();
    this._done.push(command);
    this._undone.length = 0;
  }

  undo() {
    const cmd = this._done.pop();
    if (!cmd) return false;
    cmd.undo();
    this._undone.push(cmd);
    return true;
  }

  redo() {
    const cmd = this._undone.pop();
    if (!cmd) return false;
    cmd.do();
    this._done.push(cmd);
    return true;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const store = new ComponentStore();
  const stack = new CommandStack();

  let id;
  stack.do({
    do() {
      id = store.addRect({ x: 10, y: 10, width: 20, height: 20, fill: "#123" });
    },
    undo() {
      store.set(id, null);
    }
  });

  assert(store.get(id) !== null, "expected rect to exist after add");

  stack.do({
    do() {
      this._snapshot = store.update(id, { x: 99, y: 88 });
    },
    undo() {
      store.set(id, this._snapshot.prev);
    }
  });

  assert(store.get(id).x === 99, "expected move to apply");
  assert(store.get(id).y === 88, "expected move to apply");

  assert(stack.undo() === true, "expected undo to succeed");
  assert(store.get(id).x === 10, "expected move undo to restore x");

  assert(stack.redo() === true, "expected redo to succeed");
  assert(store.get(id).x === 99, "expected redo to restore x");

  assert(stack.undo() === true, "expected undo move");
  assert(stack.undo() === true, "expected undo add");
  assert(store.get(id) === null, "expected rect deleted after undo add");

  console.log("✅ Experiment 018 passed");
}

try {
  main();
  process.exit(0);
} catch (e) {
  console.error("❌ Experiment 018 failed", e?.message || e);
  process.exit(1);
}
