"use strict";

const path = require("path");
const fs = require("fs");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const entryPoint = path.join(rootDir, "src", "ui", "server", "wysiwyg-demo", "client.js");
const outdir = path.join(rootDir, "src", "ui", "server", "wysiwyg-demo", "public", "js");
const outfile = path.join(outdir, "bundle.js");

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
      minify: false, // Keep unminified for debugging
    });
    console.log(`WYSIWYG Client bundle created at ${outfile}`);
  } catch (err) {
    console.error("Failed to build WYSIWYG client bundle", err);
    process.exitCode = 1;
  }
}

build();
