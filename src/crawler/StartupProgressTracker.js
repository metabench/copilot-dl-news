"use strict";

class StartupProgressTracker {
  constructor(options = {}) {
    const { emit } = options;
    if (typeof emit !== "function") {
      throw new Error("StartupProgressTracker requires emit callback");
    }
    this.emit = emit;
    this.stages = new Map();
    this.order = [];
    this.sequence = 0;
    this.manualStatusText = null;
  }

  startStage(id, meta = {}) {
    if (!id) return;
    this.manualStatusText = null;
    const stage = this._ensureStage(id, meta);
    stage.status = "running";
    stage.error = null;
    stage.message = meta.message || stage.message || null;
    stage.details = this._trim(meta.details);
    stage.startedAt = Date.now();
    stage.completedAt = null;
    stage.durationMs = null;
    this._emit();
  }

  completeStage(id, meta = {}) {
    this._finishStage(id, "completed", meta);
  }

  failStage(id, error, meta = {}) {
    const errText = error ? (typeof error === "string" ? error : (error.message || String(error))) : null;
    const stage = this._finishStage(id, "failed", meta);
    if (stage) {
      stage.error = errText;
      this._emit();
    }
  }

  skipStage(id, meta = {}) {
    const stage = this._finishStage(id, "skipped", meta);
    if (stage) {
      stage.error = null;
    }
  }

  markComplete(statusText = null) {
    this.manualStatusText = statusText || "Startup complete";
    this._emit();
  }

  _finishStage(id, status, meta = {}) {
    if (!id) return null;
    this.manualStatusText = null;
    const stage = this._ensureStage(id, meta);
    if (!stage.startedAt) {
      stage.startedAt = Date.now();
    }
    stage.status = status;
    stage.message = meta.message || stage.message || null;
    stage.details = this._trim(meta.details) || stage.details || null;
    stage.completedAt = Date.now();
    stage.durationMs = Math.max(0, stage.completedAt - stage.startedAt);
    this._emit();
    return stage;
  }

  _ensureStage(id, meta = {}) {
    let stage = this.stages.get(id);
    if (!stage) {
      this.sequence += 1;
      stage = {
        id,
        sequence: this.sequence,
        label: meta.label || this._defaultLabel(id),
        status: "pending",
        message: meta.message || null,
        details: this._trim(meta.details),
        startedAt: null,
        completedAt: null,
        durationMs: null,
        error: null
      };
      this.order.push(id);
      this.stages.set(id, stage);
    } else {
      if (meta.label) stage.label = meta.label;
    }
    return stage;
  }

  _defaultLabel(id) {
    return id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  _trim(details) {
    if (!details) return null;
    try {
      if (Array.isArray(details)) {
        return details.slice(0, 6);
      }
      if (typeof details === "object") {
        const out = {};
        const keys = Object.keys(details).slice(0, 8);
        for (const key of keys) {
          const value = details[key];
          if (Array.isArray(value)) {
            out[key] = value.slice(0, 6);
          } else if (value && typeof value === "object") {
            out[key] = this._trim(value);
          } else {
            out[key] = value;
          }
        }
        return out;
      }
      return details;
    } catch (_) {
      return null;
    }
  }

  _emit() {
    const now = Date.now();
    const stages = this.order.map((id) => {
      const stage = this.stages.get(id);
      if (!stage) return null;
      const duration = stage.durationMs != null ? stage.durationMs : (stage.startedAt ? Math.max(0, now - stage.startedAt) : null);
      return {
        id: stage.id,
        label: stage.label,
        status: stage.status,
        sequence: stage.sequence,
        durationMs: duration,
        startedAt: stage.startedAt || null,
        completedAt: stage.completedAt || null,
        message: stage.message || null,
        details: stage.details || null,
        error: stage.error || null
      };
    }).filter(Boolean);
    const total = stages.length;
    const completed = stages.filter((s) => s.status === "completed").length;
    const skipped = stages.filter((s) => s.status === "skipped").length;
    const failedStage = stages.find((s) => s.status === "failed") || null;
    const runningStage = stages.find((s) => s.status === "running") || null;
    const progress = total > 0 ? Math.max(0, Math.min(1, (completed + skipped) / total)) : null;
    const summary = {
      total,
      completed,
      skipped,
      failed: failedStage ? 1 : 0,
      progress,
      running: runningStage ? runningStage.id : null,
      done: total > 0 && (completed + skipped === total) && !failedStage
    };
    const statusText = this._selectStatusText({ runningStage, failedStage, summary });
    this.emit({ stages, summary }, this.manualStatusText || statusText);
  }

  _selectStatusText({ runningStage, failedStage, summary }) {
    if (this.manualStatusText) return this.manualStatusText;
    if (failedStage) {
      return `${failedStage.label || failedStage.id} failed`;
    }
    if (runningStage) {
      return `${runningStage.label || runningStage.id}…`;
    }
    if (summary.done) {
      return "Startup complete";
    }
    return null;
  }
}

module.exports = { StartupProgressTracker };
