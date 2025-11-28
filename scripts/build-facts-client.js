"use strict";

/**
 * Build Facts Client Bundle
 * 
 * Builds the client-side JavaScript for the Facts Server.
 * Uses esbuild to bundle URL facts for browser execution.
 * 
 * Usage:
 *   node scripts/build-facts-client.js
 */

const path = require("path");
const fs = require("fs");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const entryPoint = path.join(rootDir, "src", "ui", "client", "facts-client.js");
const outdir = path.join(rootDir, "public", "assets");
const outfile = path.join(outdir, "facts-client.js");

const isProd = process.env.NODE_ENV === "production";

async function build() {
  fs.mkdirSync(outdir, { recursive: true });
  
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
      metafile: true
    });

    // Log bundle size
    const bundleSize = fs.statSync(outfile).size;
    const sizeKB = (bundleSize / 1024).toFixed(2);
    
    console.log(`Facts client bundle created at ${outfile}`);
    console.log(`  Size: ${sizeKB} KB${isProd ? " (minified)" : ""}`);
    
    // Show what was included
    if (result.metafile) {
      const inputs = Object.keys(result.metafile.inputs);
      console.log(`  Modules bundled: ${inputs.length}`);
    }
    
  } catch (err) {
    console.error("Failed to build facts client bundle:", err.message);
    process.exitCode = 1;
  }
}

build();
