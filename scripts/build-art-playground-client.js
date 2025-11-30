#!/usr/bin/env node
"use strict";

/**
 * Build Art Playground Client Bundle
 * 
 * Uses esbuild to bundle the client-side code.
 */

const esbuild = require("esbuild");
const path = require("path");

const srcDir = path.join(__dirname, "../src/ui/server/artPlayground");

async function build() {
  try {
    const result = await esbuild.build({
      entryPoints: [path.join(srcDir, "client.js")],
      bundle: true,
      outfile: path.join(srcDir, "client.bundle.js"),
      platform: "browser",
      target: ["es2020"],
      format: "iife",
      sourcemap: true,
      minify: process.env.NODE_ENV === "production",
      
      // Define environment
      define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development")
      },
      
      // Log build info
      logLevel: "info"
    });
    
    console.log("Art Playground client bundle built successfully");
    
    if (result.warnings.length > 0) {
      console.warn("Warnings:", result.warnings);
    }
    
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

build();
