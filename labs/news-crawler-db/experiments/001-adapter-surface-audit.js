"use strict";

const fs = require("fs");
const path = require("path");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function createTempDbPath() {
  const root = path.join(process.cwd(), "tmp", "news-crawler-db-lab");
  ensureDir(root);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(root, `lab-${stamp}.db`);
  const seed = path.join(process.cwd(), "data", "news.db");
  if (fs.existsSync(seed)) {
    try {
      const stat = fs.statSync(seed);
      if (stat.size <= 200 * 1024 * 1024) {
        fs.copyFileSync(seed, target);
      }
    } catch (_) {
      // If copy fails, fall back to empty DB.
    }
  }
  return target;
}

function getExternalDbPath() {
  const seed = path.join(process.cwd(), "data", "news.db");
  if (fs.existsSync(seed)) {
    return seed;
  }
  return createTempDbPath();
}

function listMethods(instance) {
  const all = new Set();
  const publicOnly = new Set();
  let proto = instance;
  while (proto && proto !== Object.prototype) {
    Object.getOwnPropertyNames(proto).forEach((name) => {
      if (name === "constructor") return;
      const desc = Object.getOwnPropertyDescriptor(proto, name);
      if (desc && typeof desc.value === "function") {
        all.add(name);
        if (!name.startsWith("_")) {
          publicOnly.add(name);
        }
      }
    });
    proto = Object.getPrototypeOf(proto);
  }
  return {
    all: Array.from(all).sort(),
    publicOnly: Array.from(publicOnly).sort()
  };
}

function safeClose(instance) {
  try {
    if (instance && typeof instance.close === "function") {
      instance.close();
    }
  } catch (_) {
    // ignore
  }
}

function resolveExternalFactory() {
  try {
    const candidates = ["news-crawler-db", "news-crawler-db/dist/db"];
    let lastError = null;
    for (const id of candidates) {
      try {
        const mod = require(id);
        if (typeof mod.createDatabase === "function") {
          return { name: "news-crawler-db", create: mod.createDatabase };
        }
        if (typeof mod.createDbAdapter === "function") {
          return { name: "news-crawler-db", create: mod.createDbAdapter };
        }
        if (typeof mod.createSQLiteDatabase === "function") {
          return { name: "news-crawler-db", create: mod.createSQLiteDatabase };
        }
        if (typeof mod.default === "function") {
          return { name: "news-crawler-db", create: mod.default };
        }
        if (typeof mod === "function") {
          return { name: "news-crawler-db", create: mod };
        }
        if (mod.dbAdapter) {
          return { name: "news-crawler-db", create: () => mod.dbAdapter };
        }
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError && (lastError.code === "MODULE_NOT_FOUND" || /Cannot find module/.test(lastError.message))) {
      return { name: "news-crawler-db", missing: true };
    }
    return { name: "news-crawler-db", error: "No compatible factory export found" };
  } catch (err) {
    if (err && (err.code === "MODULE_NOT_FOUND" || /Cannot find module/.test(err.message))) {
      return { name: "news-crawler-db", missing: true };
    }
    return { name: "news-crawler-db", error: err.message || String(err) };
  }
}

async function createExternalInstance(factory, dbPath) {
  const candidates = [
    () => factory({ engine: "sqlite", dbPath }),
    () => factory({ type: "sqlite", path: dbPath }),
    () => factory({ type: "sqlite", dbPath }),
    () => factory({ dbPath }),
    () => factory(dbPath)
  ];
  let lastErr = null;
  for (const attempt of candidates) {
    try {
      const value = attempt();
      return value && typeof value.then === "function" ? await value : value;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Unable to create external adapter instance");
}

function writeResult(payload) {
  const outDir = path.join(process.cwd(), "labs", "news-crawler-db", "results");
  ensureDir(outDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `adapter-surface-audit-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return outPath;
}

async function main() {
  const { createDatabase } = require("../../../src/data/db");

  const dbPath = createTempDbPath();
  const current = createDatabase({ engine: "sqlite", dbPath });
  const currentMethods = listMethods(current);

  let external = null;
  let externalMethods = null;
  let externalError = null;

  try {
    external = createDatabase({ engine: "news-crawler-db", dbPath: getExternalDbPath() });
    externalMethods = listMethods(external);
    if (external && external.coreError) {
      externalError = external.coreError;
    }
  } catch (err) {
    externalError = err.message || String(err);
  }

  const diff = {
    missingInExternal: externalMethods
      ? currentMethods.publicOnly.filter((name) => !externalMethods.publicOnly.includes(name))
      : [],
    extraInExternal: externalMethods
      ? externalMethods.publicOnly.filter((name) => !currentMethods.publicOnly.includes(name))
      : []
  };

  const payload = {
    timestamp: new Date().toISOString(),
    current: {
      methodCount: currentMethods.publicOnly.length,
      methods: currentMethods.publicOnly
    },
    external: externalMethods
      ? { methodCount: externalMethods.publicOnly.length, methods: externalMethods.publicOnly }
      : null,
    externalError,
    diff
  };

  const outPath = writeResult(payload);
  console.log("Adapter surface audit complete:");
  console.log(JSON.stringify(payload, null, 2));
  console.log("Result saved:", outPath);

  safeClose(current);
  safeClose(external);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
