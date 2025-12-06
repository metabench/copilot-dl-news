"use strict";

/**
 * Build the Decision Tree Viewer client bundle.
 * Uses esbuild for fast bundling with proper shims for jsgui3-client.
 */

const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const srcDir = __dirname;
const outDir = path.join(srcDir, "public");

// Create shim directory and files for server-only modules
const shimDir = path.join(__dirname, "../../../../tmp/esbuild-shims");
fs.mkdirSync(shimDir, { recursive: true });

// Create empty shims for htmlparser (not used in browser)
fs.writeFileSync(path.join(shimDir, "htmlparser.js"), "module.exports = {};\n");
fs.writeFileSync(path.join(shimDir, "htmlparser2.js"), "module.exports = {};\n");

async function build() {
  try {
    const result = await esbuild.build({
      entryPoints: [path.join(srcDir, "client.js")],
      bundle: true,
      outfile: path.join(outDir, "decision-tree-client.js"),
      format: "iife",
      globalName: "DecisionTreeViewer",
      platform: "browser",
      target: ["es2020"],
      minify: process.env.NODE_ENV === "production",
      sourcemap: process.env.NODE_ENV !== "production",
      
      // Alias server-only modules to empty shims
      alias: {
        "htmlparser": path.join(shimDir, "htmlparser.js"),
        "htmlparser2": path.join(shimDir, "htmlparser2.js")
      },
      
      define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development")
      },
      logLevel: "info"
    });
    
    console.log("✅ Decision Tree Viewer client bundle built successfully");
    return result;
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  build();
}

module.exports = { build };
