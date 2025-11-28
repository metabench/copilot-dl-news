"use strict";

const path = require("path");
const fs = require("fs");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const entryPoint = path.join(rootDir, "src", "ui", "client", "geoImport", "index.js");
const outdir = path.join(rootDir, "public", "assets");
const outfile = path.join(outdir, "geo-import.js");

const isProd = process.env.NODE_ENV === "production";

async function build() {
  fs.mkdirSync(outdir, { recursive: true });
  try {
    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      outfile,
      platform: "browser",
      format: "iife",
      target: ["es2019"],
      sourcemap: true,
      minify: isProd,
    });
    console.log(`Geo Import Client bundle created at ${outfile}`);
  } catch (err) {
    console.error("Failed to build client bundle", err);
    process.exitCode = 1;
  }
}

build();
