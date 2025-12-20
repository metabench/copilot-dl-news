"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_STYLE = "compressed";

let _sass;

function getSass() {
  if (_sass) return _sass;
  try {
    // `sass` is a devDependency in this repo.
    // If it's not installed in an environment, callers get a clear error.
    // eslint-disable-next-line global-require
    _sass = require("sass");
    return _sass;
  } catch (err) {
    const msg = "Sass compiler missing. Install deps or add `sass` to dependencies.";
    const e = new Error(msg);
    e.cause = err;
    throw e;
  }
}

function safeStatMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

const cache = new Map();

/**
 * Compile a Sass/SCSS entry file to CSS.
 *
 * - Caches per entry file keyed by its mtime.
 * - Uses Dart Sass JS API (no `npx sass` shellouts).
 */
function compileSassFileToCss(entryFilePath, options = {}) {
  if (!entryFilePath || typeof entryFilePath !== "string") {
    throw new Error("compileSassFileToCss: entryFilePath must be a string");
  }

  const abs = path.resolve(entryFilePath);
  const mtimeMs = safeStatMtimeMs(abs);
  const cacheKey = `${abs}::${options.style || DEFAULT_STYLE}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.css;
  }

  const sass = getSass();
  const loadPaths = Array.isArray(options.loadPaths) && options.loadPaths.length
    ? options.loadPaths
    : [path.dirname(abs)];

  const result = sass.compile(abs, {
    style: options.style || DEFAULT_STYLE,
    loadPaths
  });

  const css = String(result && result.css ? result.css : "");
  cache.set(cacheKey, { mtimeMs, css });
  return css;
}

module.exports = {
  compileSassFileToCss
};
