"use strict";

/**
 * Build script for Design Studio client bundle
 * 
 * Uses esbuild to bundle the jsgui3 client code for browser delivery.
 * 
 * Usage:
 *   node scripts/build-design-studio-client.js
 */

const path = require("path");
const fs = require("fs");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const entryPoint = path.join(rootDir, "src", "ui", "server", "designStudio", "client.js");
const outdir = path.join(rootDir, "src", "ui", "server", "designStudio", "public");
const outfile = path.join(outdir, "design-studio-client.js");
const shimsDir = path.join(rootDir, "src", "ui", "server", "designStudio", "shims");

const isProd = process.env.NODE_ENV === "production";

async function build() {
  // Ensure output directory exists
  fs.mkdirSync(outdir, { recursive: true });
  
  // Create shims directory and htmlparser shim for browser
  fs.mkdirSync(shimsDir, { recursive: true });
  const htmlparserShimPath = path.join(shimsDir, "htmlparser-shim.js");
  fs.writeFileSync(htmlparserShimPath, `
// Browser shim for htmlparser - not needed on client side
// HTML parsing is only used server-side for parse_mount
module.exports = {
  Parser: function() { 
    this.parseComplete = function() { console.warn('htmlparser not available in browser'); };
  },
  DefaultHandler: function() {}
};
`);

  try {
    const result = await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      outfile,
      platform: "browser",
      format: "iife",
      globalName: "DesignStudioClient",
      target: ["es2019"],
      sourcemap: true,
      minify: isProd,
      // Shim htmlparser for browser (not needed client-side)
      alias: {
        "htmlparser": htmlparserShimPath
      },
      external: [],
      define: {
        "global": "window",
        "process.env.NODE_ENV": JSON.stringify(isProd ? "production" : "development")
      }
    });
    
    console.log(`✅ Design Studio client bundle created at ${outfile}`);
    
    if (result.warnings.length > 0) {
      console.log("Warnings:", result.warnings);
    }
    
  } catch (err) {
    console.error("❌ Failed to build Design Studio client bundle:", err);
    process.exitCode = 1;
  }
}

build();
