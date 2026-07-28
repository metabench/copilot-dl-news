'use strict';

/**
 * build-dashboard-bundle.js — bundle the D4 remote-dashboard client (slice 2b,
 * cycle 149) into an IIFE, mirroring build-ui-client.js (same htmlparser shim —
 * jsgui3-html's transitive legacy dep needs `this`→globalThis in strict bundles).
 *
 * The artifact is written INTO news-crawler-itself/public/ and committed there:
 * built on Windows where node_modules is healthy, shipped as a file — jsgui3 is
 * NEVER installed on the Linux box (registry tarballs are case-broken there; see
 * the jsgui3-npm-tarball-case-rot memory).
 *
 *   node scripts/build-dashboard-bundle.js
 */

const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const rootDir = path.resolve(__dirname, '..');
const entryPoint = path.join(rootDir, 'src', 'ui', 'shared', 'crawl-dash-core', 'dashboard-client-entry.js');
const outdir = path.resolve(rootDir, '..', 'news-crawler-itself', 'public');
const outfile = path.join(outdir, 'dashboard-client.js');

function legacyHtmlparserGlobalThisShim() {
  const matcher = /[\\/]node_modules[\\/]htmlparser[\\/]lib[\\/]htmlparser\.js$/;
  return {
    name: 'legacy-htmlparser-globalthis-shim',
    setup(build) {
      build.onLoad({ filter: matcher }, async (args) => {
        const source = await fs.promises.readFile(args.path, 'utf8');
        return { contents: source.replace(/\bthis\.Tautologistics\b/g, 'globalThis.Tautologistics'), loader: 'js' };
      });
    }
  };
}

async function main() {
  fs.mkdirSync(outdir, { recursive: true });
  await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    outfile,
    platform: 'browser',
    format: 'iife',
    target: ['es2019'],
    sourcemap: false,
    minify: true,
    plugins: [legacyHtmlparserGlobalThisShim()]
  });
  const bytes = fs.statSync(outfile).size;
  console.log(`dashboard bundle: ${path.relative(rootDir, outfile)} (${(bytes / 1024).toFixed(1)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
