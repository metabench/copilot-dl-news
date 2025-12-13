"use strict";

const crypto = require("crypto");

function createRunId() {
  try {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch (_) {
    // ignore
  }
  return crypto.randomBytes(16).toString("hex");
}

function normalizeError(err) {
  if (!err) return null;
  if (typeof err === "string") {
    return { message: err };
  }
  if (typeof err === "object") {
    const message = err.message ? String(err.message) : String(err);
    const stack = err.stack ? String(err.stack) : undefined;
    const code = err.code ? String(err.code) : undefined;
    return { message, stack, code };
  }
  return { message: String(err) };
}

function createTelemetry(options = {}) {
  const serverName = options.name || process.env.SERVER_NAME || "Server";
  const entry = options.entry || null;
  const startedAt = new Date().toISOString();
  const runId = options.runId || createRunId();
  const stream = options.stream || process.stdout;

  const PROCESS_HANDLER_STATE = Symbol.for("telemetry.v1.processHandlers");

  const state = {
    port: Number.isFinite(options.port) ? options.port : null,
    startedAt,
    lastEventAt: null,
    pid: process.pid,
    runId,
    name: serverName,
    entry
  };

  function buildBaseRecord(level, event, fields = {}) {
    state.lastEventAt = new Date().toISOString();
    return {
      v: 1,
      ts: state.lastEventAt,
      level,
      event,
      server: {
        name: state.name,
        entry: state.entry,
        port: state.port,
        pid: state.pid,
        runId: state.runId
      },
      ...fields
    };
  }

  function writeRecord(record) {
    const line = `${JSON.stringify(record)}\n`;
    try {
      stream.write(line);
    } catch (_) {
      // telemetry must never crash the server
    }
  }

  function emit(level, event, fields = {}) {
    writeRecord(buildBaseRecord(level, event, fields));
  }

  function info(event, msg, data) {
    emit("info", event, {
      ...(msg ? { msg: String(msg) } : null),
      ...(data !== undefined ? { data } : null)
    });
  }

  function warn(event, msg, data) {
    emit("warn", event, {
      ...(msg ? { msg: String(msg) } : null),
      ...(data !== undefined ? { data } : null)
    });
  }

  function error(event, err, msg, data) {
    emit("error", event, {
      ...(msg ? { msg: String(msg) } : null),
      ...(data !== undefined ? { data } : null),
      err: normalizeError(err)
    });
  }

  function debug(event, msg, data) {
    emit("debug", event, {
      ...(msg ? { msg: String(msg) } : null),
      ...(data !== undefined ? { data } : null)
    });
  }

  function setPort(port) {
    const numeric = Number(port);
    state.port = Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }

  function getStatus() {
    const now = Date.now();
    const started = Date.parse(state.startedAt);
    const uptimeMs = Number.isFinite(started) ? Math.max(0, now - started) : null;

    return {
      ok: true,
      v: 1,
      server: {
        name: state.name,
        entry: state.entry,
        port: state.port,
        pid: state.pid,
        runId: state.runId,
        startedAt: state.startedAt,
        uptimeMs
      },
      startedAt: state.startedAt,
      lastEventAt: state.lastEventAt,
      uptimeMs,
      node: {
        version: process.version
      }
    };
  }

  function wireProcessHandlers() {
    const state = process[PROCESS_HANDLER_STATE] || {
      wired: false,
      sinks: new Set()
    };

    state.sinks.add((event, err) => {
      error(event, err);
    });

    if (!state.wired) {
      state.wired = true;

      process.on("uncaughtException", (err) => {
        state.sinks.forEach((sink) => {
          try {
            sink("server.uncaughtException", err);
          } catch (_) {
            // ignore
          }
        });
      });

      process.on("unhandledRejection", (reason) => {
        const err = reason instanceof Error ? reason : new Error(String(reason));
        state.sinks.forEach((sink) => {
          try {
            sink("server.unhandledRejection", err);
          } catch (_) {
            // ignore
          }
        });
      });
    }

    process[PROCESS_HANDLER_STATE] = state;
  }

  return {
    emit,
    debug,
    info,
    warn,
    error,
    setPort,
    getStatus,
    wireProcessHandlers,
    normalizeError
  };
}

function attachTelemetryEndpoints(app, telemetry, options = {}) {
  if (!app || !telemetry) return;
  const basePath = options.basePath || "/api";

  app.get(`${basePath}/health`, (req, res) => {
    res.json({ ok: true, v: 1 });
  });

  app.get(`${basePath}/status`, (req, res) => {
    res.json(telemetry.getStatus());
  });
}

function attachTelemetryMiddleware(app, telemetry, options = {}) {
  if (!app || !telemetry) return;
  const excludePaths = new Set(options.excludePaths || ["/api/health", "/api/status"]);
  const emitLegacyHttpRequestEvent = options.emitLegacyHttpRequestEvent === true;

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (excludePaths.has(req.path)) return;
      const durationMs = Math.max(0, Date.now() - start);
      const data = {
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        statusCode: res.statusCode,
        durationMs
      };

      telemetry.info("http.response", undefined, data);

      if (emitLegacyHttpRequestEvent) {
        telemetry.info("http.request", undefined, data);
      }
    });
    next();
  });
}

module.exports = {
  createTelemetry,
  attachTelemetryEndpoints,
  attachTelemetryMiddleware,
  normalizeError
};
