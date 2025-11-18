"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { findProjectRoot } = require("../../../utils/project-root");

const DEFAULT_TTL_MS = 5 * 60 * 1000;

class DiagramDataService {
  constructor(options = {}) {
    this.projectRoot = findProjectRoot(__dirname);
    this.cliPath = options.cliPath || path.join(this.projectRoot, "tools", "dev", "diagram-data.js");
    this.featureConfig = options.featureConfig || path.join(this.projectRoot, "config", "diagram-features.json");
    this.sections = Array.isArray(options.sections) && options.sections.length ? options.sections : ["code", "db", "features"];
    this.ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : DEFAULT_TTL_MS;
    this.cachePath = options.cachePath || path.join(this.projectRoot, "tmp", ".diagram-data-cache.json");
    this.snapshot = null;
    this.inflight = null;
    this.refreshDelayMs = Number.isFinite(options.refreshDelayMs) && options.refreshDelayMs > 0 ? options.refreshDelayMs : 0;
    this.status = {
      state: "idle",
      startedAt: null,
      lastSuccess: null,
      lastError: null,
      detail: null,
      generatedAt: null
    };
  }

  async load({ force } = {}) {
    if (!force) {
      const cached = this.getCachedSnapshot();
      if (cached && !this.isExpired(cached.generatedAt)) {
        this.snapshot = cached;
        this._markReady(cached);
        return cached;
      }
      if (this.snapshot && !this.isExpired(this.snapshot.generatedAt)) {
        this._markReady(this.snapshot);
        return this.snapshot;
      }
    }
    return this.refresh();
  }

  async refresh() {
    if (this.inflight) {
      return this.inflight;
    }
    this.status = {
      ...this.status,
      state: "refreshing",
      startedAt: new Date().toISOString(),
      detail: "diagram-data CLI running",
      lastError: null
    };
    this.inflight = this.runCli().then((payload) => {
      return this._finalizeRefresh(payload);
    }).catch((error) => {
      this.status = {
        ...this.status,
        state: "error",
        startedAt: null,
        detail: null,
        lastError: {
          message: error && error.message ? error.message : "diagram-data CLI failed",
          timestamp: new Date().toISOString()
        }
      };
      throw error;
    }).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  async runCli() {
    return new Promise((resolve, reject) => {
      const args = [
        this.cliPath,
        "--sections",
        this.sections.join(","),
        "--feature-config",
        this.featureConfig,
        "--json"
      ];
      const child = spawn(process.execPath, args, {
        cwd: this.projectRoot,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          const error = new Error(`diagram-data CLI exited with code ${code}: ${stderr}`);
          reject(error);
          return;
        }
        try {
          const payload = JSON.parse(stdout);
          resolve(payload);
        } catch (error) {
          reject(new Error(`Failed to parse diagram-data output: ${error.message}`));
        }
      });
    });
  }

  isExpired(timestamp) {
    if (!timestamp) return true;
    const generatedMs = Date.parse(timestamp);
    if (!Number.isFinite(generatedMs)) return true;
    return Date.now() - generatedMs > this.ttlMs;
  }

  getCachedSnapshot() {
    try {
      if (!fs.existsSync(this.cachePath)) return null;
      const raw = fs.readFileSync(this.cachePath, "utf8");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  writeCache(payload) {
    try {
      fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify(payload, null, 2));
    } catch (_) {
      // cache write best-effort
    }
  }

  getStatus() {
    return {
      state: this.status.state,
      inflight: Boolean(this.inflight),
      startedAt: this.status.startedAt,
      detail: this.status.detail,
      lastSuccess: this.status.lastSuccess,
      lastError: this.status.lastError,
      generatedAt: (this.snapshot && this.snapshot.generatedAt) || this.status.generatedAt || null
    };
  }

  _finalizeRefresh(payload) {
    const commit = () => {
      this.snapshot = payload;
      this.writeCache(payload);
      this._markReady(payload);
      return payload;
    };
    if (this.refreshDelayMs <= 0) {
      return commit();
    }
    return this._delay(this.refreshDelayMs).then(commit);
  }

  _markReady(snapshot) {
    this.status = {
      state: "ready",
      startedAt: null,
      detail: null,
      lastSuccess: new Date().toISOString(),
      lastError: null,
      generatedAt: snapshot && snapshot.generatedAt ? snapshot.generatedAt : this.status.generatedAt
    };
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = {
  DiagramDataService
};
