"use strict";

const path = require("path");
const fs = require("fs");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const entryPoint = path.join(rootDir, "src", "ui", "client", "index.js");
const outdir = path.join(rootDir, "public", "assets");
const outfile = path.join(outdir, "ui-client.js");

const isProd = process.env.NODE_ENV === "production";
const defaultPluginEnabled = process.env.BINDING_PLUGIN_ENABLED ?? "true";

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
      define: {
        "process.env.BINDING_PLUGIN_ENABLED": JSON.stringify(defaultPluginEnabled)
      }
    });
    console.log(`Client bundle created at ${outfile}`);
  } catch (err) {
    console.error("Failed to build client bundle", err);
    process.exitCode = 1;
  }
}

build();
