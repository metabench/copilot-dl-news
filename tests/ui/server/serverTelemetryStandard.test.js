"use strict";

const express = require("express");
const request = require("supertest");
const { Writable } = require("stream");

const {
  createTelemetry,
  attachTelemetryEndpoints,
  attachTelemetryMiddleware
} = require("../../../src/ui/server/utils/telemetry");

function createCaptureStream() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString("utf-8"));
      callback();
    }
  });

  return {
    stream,
    getRawText() {
      return chunks.join("");
    },
    getJsonLines() {
      return chunks
        .join("")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }
  };
}

describe("Server telemetry standard (v1)", () => {
  test("wireProcessHandlers() is idempotent", () => {
    const capture = createCaptureStream();
    const telemetryA = createTelemetry({ name: "A", entry: "tests", stream: capture.stream });
    const telemetryB = createTelemetry({ name: "B", entry: "tests", stream: capture.stream });

    const beforeUncaught = process.listenerCount("uncaughtException");
    const beforeRejection = process.listenerCount("unhandledRejection");

    telemetryA.wireProcessHandlers();
    telemetryA.wireProcessHandlers();
    telemetryB.wireProcessHandlers();

    const afterUncaught = process.listenerCount("uncaughtException");
    const afterRejection = process.listenerCount("unhandledRejection");

    expect(afterUncaught - beforeUncaught).toBeLessThanOrEqual(1);
    expect(afterRejection - beforeRejection).toBeLessThanOrEqual(1);
  });

  test("exposes /api/health and /api/status", async () => {
    const app = express();
    const capture = createCaptureStream();
    const telemetry = createTelemetry({ name: "Test Server", entry: "tests", stream: capture.stream });

    attachTelemetryEndpoints(app, telemetry);

    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ ok: true, v: 1 });

    const status = await request(app).get("/api/status");
    expect(status.status).toBe(200);
    expect(status.body).toHaveProperty("ok", true);
    expect(status.body).toHaveProperty("v", 1);
    expect(status.body).toHaveProperty("server.name", "Test Server");
    expect(status.body).toHaveProperty("server.runId");
    expect(typeof status.body.server.runId).toBe("string");
  });

  test("emits http.request events via middleware", async () => {
    const app = express();
    const capture = createCaptureStream();
    const telemetry = createTelemetry({ name: "Test Server", entry: "tests", stream: capture.stream });

    attachTelemetryMiddleware(app, telemetry);
    attachTelemetryEndpoints(app, telemetry);

    app.get("/hello", (req, res) => {
      res.json({ ok: true });
    });

    const response = await request(app).get("/hello");
    expect(response.status).toBe(200);

    const records = capture.getJsonLines();
    const httpRecords = records.filter((rec) => rec && rec.v === 1 && rec.event === "http.request");

    expect(httpRecords.length).toBeGreaterThan(0);
    const last = httpRecords[httpRecords.length - 1];
    expect(last).toHaveProperty("level", "info");
    expect(last).toHaveProperty("server.name", "Test Server");
    expect(last).toHaveProperty("data.method", "GET");
    expect(last).toHaveProperty("data.statusCode", 200);
  });
});
