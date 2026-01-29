/**
 * Bundler for Remote Crawler
 * 
 * Uses esbuild to bundle the crawler server into a single file,
 * resolving all local imports from the monorepo while keeping
 * node_modules external.
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const deployDir = path.join(__dirname, '../../deploy/remote-crawler');
const distDir = path.join(deployDir, 'dist');
const entryPoint = path.join(deployDir, 'server.js');

// Ensure dist directory
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

console.log('📦 Bundling remote crawler...');

esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: path.join(distDir, 'server.js'),
    external: [
        // Mark all packages in package.json as external
        // We install them on the server via npm install
        'better-sqlite3', 'express', 'lang-tools',
        'body-parser', 'cors', 'node-fetch', // commonly used
        // Add others if needed
    ],
    logLevel: 'info',
}).then(() => {
    console.log('✅ Build complete: deploy/remote-crawler/dist/server.js');

    // Also copy package.json to dist
    const pkgJson = require(path.join(deployDir, 'package.json'));
    fs.writeFileSync(
        path.join(distDir, 'package.json'),
        JSON.stringify(pkgJson, null, 2)
    );
    console.log('✅ Copied package.json');

}).catch((e) => {
    console.error('❌ Build failed:', e);
    process.exit(1);
});
