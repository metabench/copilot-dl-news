#!/usr/bin/env node
/**
 * Build script for browser components
 * Uses esbuild to bundle ES6 modules with dependencies (like lang-tools)
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const srcDir = path.join(__dirname, '..', 'src', 'ui', 'express', 'public', 'components');
const outDir = path.join(__dirname, '..', 'src', 'ui', 'express', 'public', 'assets', 'components');

// Ensure output directory exists
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Get all .js files in components directory
const componentFiles = fs.readdirSync(srcDir)
  .filter(file => file.endsWith('.js'))
  .map(file => path.join(srcDir, file));

console.log(`Building ${componentFiles.length} component(s)...`);

// Build all components
Promise.all(componentFiles.map(async (file) => {
  const basename = path.basename(file);
  const outFile = path.join(outDir, basename);
  
  try {
    await esbuild.build({
      entryPoints: [file],
      bundle: true,
      format: 'esm',
      outfile: outFile,
      minify: false, // Keep readable for debugging
      sourcemap: true,
      target: 'es2024',
      platform: 'browser',
      external: [], // Bundle everything including lang-tools
    });
    console.log(`✓ Built ${basename}`);
  } catch (err) {
    console.error(`✗ Failed to build ${basename}:`, err);
    throw err;
  }
}))
.then(() => {
  console.log(`\n✓ All components built successfully!`);
  console.log(`Output: ${outDir}`);
})
.catch(err => {
  console.error('\n✗ Build failed:', err);
  process.exit(1);
});
