"use strict";

/**
 * Build script for Control Harness client bundle.
 *
 * Usage:
 *   node scripts/build-control-harness-client.js
 */

const path = require("path");
const fs = require("fs");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const entryPoint = path.join(rootDir, "src", "ui", "server", "controlHarness", "client", "index.js");
const outdir = path.join(rootDir, "src", "ui", "server", "controlHarness", "public");
const outfile = path.join(outdir, "control-harness-client.js");
const shimsDir = path.join(rootDir, "src", "ui", "server", "controlHarness", "client", "shims");

const isProd = process.env.NODE_ENV === "production";

async function build() {
  fs.mkdirSync(outdir, { recursive: true });
  fs.mkdirSync(shimsDir, { recursive: true });

  const htmlparserShimPath = path.join(shimsDir, "htmlparser-shim.js");
  fs.writeFileSync(
    htmlparserShimPath,
    `// Browser shim for htmlparser - parse_mount only.
module.exports = {
  Parser: function() { this.parseComplete = function() {}; },
  DefaultHandler: function() {}
};
`
  );

  try {
    const result = await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      outfile,
      platform: "browser",
      format: "iife",
      target: ["es2019"],
      sourcemap: true,
      minify: isProd,
      alias: {
        htmlparser: htmlparserShimPath
      },
      define: {
        global: "window",
        "process.env.NODE_ENV": JSON.stringify(isProd ? "production" : "development")
      }
    });

    console.log(`✅ Control harness client bundle created at ${outfile}`);

    if (result.warnings.length > 0) {
      console.log("Warnings:", result.warnings);
    }
  } catch (err) {
    console.error("❌ Failed to build control harness client bundle:", err);
    process.exitCode = 1;
  }
}

build();
