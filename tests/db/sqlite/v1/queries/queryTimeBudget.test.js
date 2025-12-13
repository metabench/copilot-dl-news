"use strict";

const {
  timedQuery,
  instrumentStatement,
  createTimedDb,
  DEFAULT_THRESHOLD_MS
} = require("../../../../../src/db/sqlite/v1/queries/helpers/queryTimeBudget");

describe("queryTimeBudget", () => {
  describe("timedQuery", () => {
    it("returns the result of the function", () => {
      const result = timedQuery(() => 42);
      expect(result).toBe(42);
    });

    it("returns complex results unchanged", () => {
      const data = [{ id: 1, name: "test" }, { id: 2, name: "other" }];
      const result = timedQuery(() => data);
      expect(result).toBe(data);
    });

    it("calls onSlow when threshold is exceeded", () => {
      const onSlow = jest.fn();
      
      timedQuery(() => {
        // Simulate slow operation
        const start = Date.now();
        while (Date.now() - start < 50) {
          // busy wait
        }
        return "done";
      }, { label: "slow-query", thresholdMs: 10, onSlow });

      expect(onSlow).toHaveBeenCalledTimes(1);
      expect(onSlow).toHaveBeenCalledWith(expect.objectContaining({
        label: "slow-query",
        thresholdMs: 10,
        exceeded: true
      }));
      expect(onSlow.mock.calls[0][0].durationMs).toBeGreaterThan(10);
    });

    it("does not call onSlow when under threshold", () => {
      const onSlow = jest.fn();
      
      timedQuery(() => 1 + 1, { label: "fast-query", thresholdMs: 1000, onSlow });

      expect(onSlow).not.toHaveBeenCalled();
    });

    it("uses default threshold when not specified", () => {
      expect(DEFAULT_THRESHOLD_MS).toBe(200);
    });
  });

  describe("instrumentStatement", () => {
    it("wraps .all() with timing", () => {
      const mockStmt = {
        all: jest.fn(() => [{ id: 1 }, { id: 2 }]),
        get: jest.fn(() => ({ id: 1 })),
        run: jest.fn(() => ({ changes: 1 })),
        bind: jest.fn()
      };

      const wrapped = instrumentStatement(mockStmt, "testStmt");
      const result = wrapped.all("arg1", "arg2");

      expect(mockStmt.all).toHaveBeenCalledWith("arg1", "arg2");
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("wraps .get() with timing", () => {
      const mockStmt = {
        all: jest.fn(),
        get: jest.fn(() => ({ id: 1 })),
        run: jest.fn(),
        bind: jest.fn()
      };

      const wrapped = instrumentStatement(mockStmt, "testStmt");
      const result = wrapped.get("arg1");

      expect(mockStmt.get).toHaveBeenCalledWith("arg1");
      expect(result).toEqual({ id: 1 });
    });

    it("wraps .run() with timing", () => {
      const mockStmt = {
        all: jest.fn(),
        get: jest.fn(),
        run: jest.fn(() => ({ changes: 5 })),
        bind: jest.fn()
      };

      const wrapped = instrumentStatement(mockStmt, "testStmt");
      const result = wrapped.run("arg1");

      expect(mockStmt.run).toHaveBeenCalledWith("arg1");
      expect(result).toEqual({ changes: 5 });
    });

    it("calls onSlow for slow .all() operations", () => {
      const onSlow = jest.fn();
      const mockStmt = {
        all: jest.fn(() => {
          const start = Date.now();
          while (Date.now() - start < 30) {}
          return [];
        }),
        get: jest.fn(),
        run: jest.fn(),
        bind: jest.fn()
      };

      const wrapped = instrumentStatement(mockStmt, "slowStmt", { thresholdMs: 10, onSlow });
      wrapped.all();

      expect(onSlow).toHaveBeenCalledWith(expect.objectContaining({
        label: "slowStmt.all",
        exceeded: true
      }));
    });
  });

  describe("createTimedDb", () => {
    it("creates a wrapper with timedPrepare method", () => {
      const mockStmt = {
        all: jest.fn(() => []),
        get: jest.fn(),
        run: jest.fn(),
        bind: jest.fn()
      };
      const mockDb = {
        prepare: jest.fn(() => mockStmt)
      };

      const timedDb = createTimedDb(mockDb);
      
      expect(typeof timedDb.timedPrepare).toBe("function");
      expect(typeof timedDb.prepare).toBe("function");
    });

    it("timedPrepare returns instrumented statement", () => {
      const mockStmt = {
        all: jest.fn(() => [{ id: 1 }]),
        get: jest.fn(),
        run: jest.fn(),
        bind: jest.fn()
      };
      const mockDb = {
        prepare: jest.fn(() => mockStmt)
      };

      const timedDb = createTimedDb(mockDb);
      const stmt = timedDb.timedPrepare("SELECT 1", "testQuery");
      const result = stmt.all();

      expect(mockDb.prepare).toHaveBeenCalledWith("SELECT 1");
      expect(mockStmt.all).toHaveBeenCalled();
      expect(result).toEqual([{ id: 1 }]);
    });

    it("uses custom threshold from options", () => {
      const onSlow = jest.fn();
      const mockStmt = {
        all: jest.fn(() => {
          const start = Date.now();
          while (Date.now() - start < 20) {}
          return [];
        }),
        get: jest.fn(),
        run: jest.fn(),
        bind: jest.fn()
      };
      const mockDb = {
        prepare: jest.fn(() => mockStmt)
      };

      const timedDb = createTimedDb(mockDb, { thresholdMs: 5, onSlow });
      const stmt = timedDb.timedPrepare("SELECT 1", "slowQuery");
      stmt.all();

      expect(onSlow).toHaveBeenCalled();
    });
  });
});
