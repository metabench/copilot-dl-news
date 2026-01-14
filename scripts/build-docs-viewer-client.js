"use strict";

/**
 * Build script for Documentation Viewer client bundle
 * 
 * Uses esbuild to bundle the jsgui3 client code for browser delivery.
 * 
 * Usage:
 *   node scripts/build-docs-viewer-client.js
 */

const path = require("path");
const fs = require("fs");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const entryPoint = path.join(rootDir, "src", "ui", "server", "docsViewer", "client", "index.js");
const outdir = path.join(rootDir, "src", "ui", "server", "docsViewer", "public");
const outfile = path.join(outdir, "docs-viewer-client.js");
const shimsDir = path.join(rootDir, "src", "ui", "server", "docsViewer", "client", "shims");

// Use vendor jsgui3-client which has proper global scope handling
const vendorClientPath = path.join(rootDir, "vendor", "jsgui3-client", "client.js");

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
      globalName: "DocsViewerClient",
      target: ["es2019"],
      sourcemap: true,
      minify: isProd,
      // Alias vendor jsgui3-client and shim htmlparser
      // jsgui3-html is bundled directly from npm - it's truly isomorphic
      alias: {
        "jsgui3-client": vendorClientPath,
        "htmlparser": htmlparserShimPath
      },
      // Externalize nothing - bundle everything for browser
      external: [],
      // Handle Node.js globals
      define: {
        "global": "window",
        "process.env.NODE_ENV": JSON.stringify(isProd ? "production" : "development")
      }
    });
    
    console.log(`✅ Docs viewer client bundle created at ${outfile}`);
    
    if (result.warnings.length > 0) {
      console.log("Warnings:", result.warnings);
    }
    
  } catch (err) {
    console.error("❌ Failed to build docs viewer client bundle:", err);
    process.exitCode = 1;
  }
}

build();
