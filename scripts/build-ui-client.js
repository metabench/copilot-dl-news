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

function legacyHtmlparserGlobalThisShim() {
  const matcher = /[\\/]node_modules[\\/]htmlparser[\\/]lib[\\/]htmlparser\.js$/;
  return {
    name: "legacy-htmlparser-globalthis-shim",
    setup(build) {
      build.onLoad({ filter: matcher }, async (args) => {
        const source = await fs.promises.readFile(args.path, "utf8");
        const patched = source.replace(/\bthis\.Tautologistics\b/g, "globalThis.Tautologistics");
        return {
          contents: patched,
          loader: "js"
        };
      });
    }
  };
}

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
      plugins: [legacyHtmlparserGlobalThisShim()],
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
