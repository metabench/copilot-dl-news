/**
 * Auto-build components if source files are newer than built files
 * Called automatically when server starts
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const srcDir = path.resolve(__dirname, 'public', 'components');
const outDir = path.resolve(__dirname, 'public', 'assets', 'components');

// ANSI color codes for console output
const colors = {
  green: '\x1b[32m',
  amber: '\x1b[33m',
  reset: '\x1b[0m'
};

/**
 * Check if components need rebuilding
 * @returns {boolean} true if rebuild needed
 */
function needsRebuild() {
  // If output directory doesn't exist, needs rebuild
  if (!fs.existsSync(outDir)) {
    return true;
  }

  try {
    // Get all source .js files
    const sourceFiles = fs.readdirSync(srcDir)
      .filter(file => file.endsWith('.js'))
      .map(file => path.join(srcDir, file));

    // Check if any source file is missing corresponding output file
    for (const sourceFile of sourceFiles) {
      const basename = path.basename(sourceFile);
      const outFile = path.join(outDir, basename);
      
      if (!fs.existsSync(outFile)) {
        return true; // Output file missing
      }

      // Check if source is newer than output
      const sourceTime = fs.statSync(sourceFile).mtime;
      const outTime = fs.statSync(outFile).mtime;
      
      if (sourceTime > outTime) {
        return true; // Source is newer
      }
    }

    return false; // All outputs are up to date
  } catch (err) {
    // If error checking, rebuild to be safe
    return true;
  }
}

/**
 * Build all components
 * @returns {Promise<number>} build time in milliseconds
 */
async function buildComponents() {
  const startTime = Date.now();
  
  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Get all source files
  const sourceFiles = fs.readdirSync(srcDir)
    .filter(file => file.endsWith('.js'))
    .map(file => path.join(srcDir, file));

  // Build all components in parallel
  await Promise.all(sourceFiles.map(async (file) => {
    const basename = path.basename(file);
    const outFile = path.join(outDir, basename);
    
    await esbuild.build({
      entryPoints: [file],
      bundle: true,
      format: 'esm',
      outfile: outFile,
      minify: false,
      sourcemap: true,
      target: 'es2020',
      platform: 'browser',
      external: [],
      logLevel: 'error', // Only show errors
    });
  }));

  const buildTime = Date.now() - startTime;
  return buildTime;
}

/**
 * Auto-build components if needed
 * @returns {Promise<{rebuilt: boolean, buildTimeMs?: number}>}
 */
async function autoBuild() {
  if (needsRebuild()) {
    // Amber status: rebuilding needed
    console.log(`[auto-build] Build status: ${colors.amber}rebuilding${colors.reset}`);
    console.log('[auto-build] Beginning component rebuild...');
    
    const buildTimeMs = await buildComponents();
    
    // Green status: build complete
    console.log(`[auto-build] Build status: ${colors.green}built${colors.reset} (${buildTimeMs}ms)`);
    return { rebuilt: true, buildTimeMs };
  } else {
    // Green status: up to date
    console.log(`[auto-build] Build status: ${colors.green}up-to-date${colors.reset} (no rebuild needed)`);
    return { rebuilt: false };
  }
}

module.exports = {
  autoBuild,
  needsRebuild,
  buildComponents,
};
