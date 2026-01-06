/**
 * Auto-build components if source files are newer than built files
 * Called automatically when server starts
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const sass = require('sass');

const srcDir = path.resolve(__dirname, 'public', 'components');
const outDir = path.resolve(__dirname, 'public', 'assets', 'components');
const stylesDir = path.resolve(__dirname, 'public', 'styles');

const sassTargets = [
  {
    source: path.resolve(stylesDir, 'crawler.scss'),
    output: path.resolve(__dirname, 'public', 'crawler.css')
  },
  {
    source: path.resolve(stylesDir, 'ui.scss'),
    output: path.resolve(__dirname, 'public', 'ui.css')
  },
  {
    source: path.resolve(stylesDir, 'ui-dark.scss'),
    output: path.resolve(__dirname, 'public', 'ui-dark.css')
  }
];

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
function needsComponentsRebuild() {
  if (!fs.existsSync(srcDir)) {
    return false;
  }

  if (!fs.existsSync(outDir)) {
    return true;
  }

  try {
    const sourceFiles = fs.readdirSync(srcDir)
      .filter((file) => file.endsWith('.js'))
      .map((file) => path.join(srcDir, file));

    for (const sourceFile of sourceFiles) {
      const basename = path.basename(sourceFile);
      const outFile = path.join(outDir, basename);

      if (!fs.existsSync(outFile)) {
        return true;
      }

      const sourceTime = fs.statSync(sourceFile).mtimeMs;
      const outTime = fs.statSync(outFile).mtimeMs;
      if (sourceTime > outTime) {
        return true;
      }
    }

    return false;
  } catch (_) {
    return true;
  }
}

function collectScssFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) {
    return files;
  }

  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.scss')) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function getLatestSassSourceTime() {
  const scssFiles = collectScssFiles(stylesDir);
  let latest = 0;
  for (const file of scssFiles) {
    try {
      const mtime = fs.statSync(file).mtimeMs;
      if (mtime > latest) {
        latest = mtime;
      }
    } catch (_) {
      return Number.MAX_SAFE_INTEGER;
    }
  }
  return latest;
}

function needsSassRebuild() {
  if (!sassTargets.length) {
    return false;
  }

  const latestSourceTime = getLatestSassSourceTime();
  if (latestSourceTime === 0) {
    return false;
  }

  for (const { source, output } of sassTargets) {
    if (!fs.existsSync(source)) {
      continue;
    }
    if (!fs.existsSync(output)) {
      return true;
    }
    try {
      const outTime = fs.statSync(output).mtimeMs;
      if (outTime < latestSourceTime) {
        return true;
      }
    } catch (_) {
      return true;
    }
  }

  return false;
}

function needsRebuild() {
  return needsComponentsRebuild() || needsSassRebuild();
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
      format: 'iife',
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

async function buildSass() {
  const startTime = Date.now();

  for (const { source, output } of sassTargets) {
    if (!fs.existsSync(source)) {
      continue;
    }

    const result = sass.compile(source, {
      style: 'expanded',
      sourceMap: false
    });

    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, result.css);
  }

  return Date.now() - startTime;
}

/**
 * Auto-build components if needed
 * @returns {Promise<{rebuilt: boolean, buildTimeMs?: number}>}
 */
async function autoBuild() {
  const componentsNeeded = needsComponentsRebuild();
  const sassNeeded = needsSassRebuild();

  if (!componentsNeeded && !sassNeeded) {
    console.log(`[auto-build] Build status: ${colors.green}up-to-date${colors.reset} (no rebuild needed)`);
    return { rebuilt: false, components: false, styles: false };
  }

  console.log(`[auto-build] Build status: ${colors.amber}rebuilding${colors.reset}`);

  let componentsTime = 0;
  let sassTime = 0;

  if (componentsNeeded) {
    console.log('[auto-build] Rebuilding component bundles...');
    componentsTime = await buildComponents();
    console.log(`[auto-build] Components built in ${componentsTime}ms`);
  }

  if (sassNeeded) {
    console.log('[auto-build] Rebuilding SASS stylesheets...');
    sassTime = await buildSass();
    console.log(`[auto-build] Styles built in ${sassTime}ms`);
  }

  console.log(`[auto-build] Build status: ${colors.green}built${colors.reset}`);
  return {
    rebuilt: true,
    components: componentsNeeded,
    styles: sassNeeded,
    timings: {
      componentsMs: componentsTime,
      stylesMs: sassTime
    }
  };
}

module.exports = {
  autoBuild,
  needsRebuild,
  buildComponents,
  buildSass,
  needsComponentsRebuild,
  needsSassRebuild
};
