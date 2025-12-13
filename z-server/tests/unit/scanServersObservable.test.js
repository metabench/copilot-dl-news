"use strict";

const { EventEmitter } = require("events");

const { createScanServersObservable } = require("../../lib/scanServersObservable");

function createFakeChild(pid = 1234) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe("createScanServersObservable", () => {
  test("emits normalized progress messages and final result", (done) => {
    jest.useFakeTimers();
    const child = createFakeChild(2222);

    const spawnImpl = () => child;
    const killCalls = [];
    const killImpl = (pid, signal, cb) => {
      killCalls.push([pid, signal]);
      if (typeof cb === "function") cb();
    };

    const obs = createScanServersObservable({
      basePath: __dirname,
      cwd: __dirname,
      toolPath: "C:/fake/js-server-scan.js",
      spawnImpl,
      killImpl
    });

    const nextEvents = [];

    obs.on("next", (evt) => {
      nextEvents.push(evt);
    });

    obs.on("error", (err) => {
      done(err);
    });

    obs.on("complete", () => {
      try {
        expect(nextEvents).toEqual([
          { type: "count-start" },
          { type: "count-progress", current: 1, file: "src/a.js" },
          { type: "count", total: 2 },
          { type: "progress", current: 1, total: 2, file: "src/b.js" },
          { type: "result", servers: [{ file: "x.js" }] }
        ]);
        expect(killCalls).toEqual([]);
        done();
      } catch (e) {
        done(e);
      } finally {
        jest.useRealTimers();
      }
    });

    // fnl observables call the inner function on a future tick.
    // Advance timers to attach the child listeners.
    jest.runOnlyPendingTimers();

    // Emit JSONL progress (including an ignored chatter line)
    child.stdout.emit("data", Buffer.from("{\"type\":\"count-start\"}\nnot-json\n"));
    child.stdout.emit(
      "data",
      Buffer.from(
        "{\"type\":\"count-progress\",\"current\":1,\"file\":\"src/a.js\"}\n" +
          "{\"type\":\"count\",\"total\":2}\n" +
          "{\"type\":\"progress\",\"current\":1,\"total\":2,\"file\":\"src/b.js\"}\n"
      )
    );

    child.stdout.emit(
      "data",
      Buffer.from("{\"type\":\"result\",\"servers\":[{\"file\":\"x.js\"}]}\n")
    );
    child.emit("close", 0);
  });

  test("raises error if process exits without result", (done) => {
    jest.useFakeTimers();
    const child = createFakeChild(3333);

    const obs = createScanServersObservable({
      basePath: __dirname,
      cwd: __dirname,
      toolPath: "C:/fake/js-server-scan.js",
      spawnImpl: () => child
    });

    obs.on("next", () => {});

    obs.on("complete", () => {
      done(new Error("Expected error, got complete"));
    });

    obs.on("error", (err) => {
      try {
        expect(err).toBeInstanceOf(Error);
        expect(String(err.message)).toMatch(/No scan result received|failed/);
        done();
      } catch (e) {
        done(e);
      } finally {
        jest.useRealTimers();
      }
    });

    jest.runOnlyPendingTimers();
    child.stderr.emit("data", Buffer.from("boom"));
    child.emit("close", 1);
  });
});
