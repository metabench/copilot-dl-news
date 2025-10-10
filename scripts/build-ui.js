#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

function getProjectRoot() {
  return path.resolve(__dirname, '..');
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function build() {
  const projectRoot = getProjectRoot();
  const outDir = path.join(projectRoot, 'src', 'ui', 'express', 'public', 'assets');

  await ensureDir(outDir);

  const entryPoints = [
    path.join(projectRoot, 'src', 'ui', 'public', 'index.js'),
    path.join(projectRoot, 'src', 'ui', 'public', 'global-nav.js'),
    path.join(projectRoot, 'src', 'ui', 'public', 'theme', 'init.js'),
    path.join(projectRoot, 'src', 'ui', 'public', 'theme', 'browserController.js'),
    path.join(projectRoot, 'src', 'ui', 'public', 'components', 'geographyFlowchart.js')
  ];

  await esbuild.build({
    entryPoints,
    bundle: true,
    outdir: outDir,
    outbase: path.join(projectRoot, 'src', 'ui', 'public'),
    format: 'esm',
    platform: 'browser',
    target: ['es2024'],
    splitting: true,
    sourcemap: false,
    minify: false,
    treeShaking: true,
    chunkNames: 'chunks/[name]-[hash]',
  entryNames: '[dir]/[name]',
    assetNames: 'assets/[name]-[hash]',
    logLevel: 'info'
  });

  console.log(`[build-ui] Bundled assets → ${path.relative(projectRoot, outDir)}`);
}

build().catch((err) => {
  console.error('[build-ui] Failed to bundle UI assets');
  console.error(err);
  process.exitCode = 1;
});
