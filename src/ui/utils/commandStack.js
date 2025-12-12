"use strict";

/**
 * Minimal do/undo/redo stack.
 * Commands are objects with { do(): void, undo(): void }.
 */
class CommandStack {
  constructor() {
    this._done = [];
    this._undone = [];
  }

  do(command) {
    if (!command || typeof command.do !== "function" || typeof command.undo !== "function") {
      throw new TypeError("CommandStack.do expects { do, undo } functions");
    }
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

  canUndo() {
    return this._done.length > 0;
  }

  canRedo() {
    return this._undone.length > 0;
  }

  clear() {
    this._done.length = 0;
    this._undone.length = 0;
  }
}

module.exports = { CommandStack };
