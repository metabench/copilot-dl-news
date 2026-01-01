'use strict';

const path = require('path');
const { spawn } = require('child_process');

function runDocsViewerCheck() {
  return new Promise((resolve) => {
    const serverPath = path.join(__dirname, '..', 'server.js');
    const docsPath = path.join(process.cwd(), 'docs');

    const child = spawn(
      process.execPath,
      [
        serverPath,
        '--check',
        '--port',
        '3163',
        '--docs',
        docsPath
      ],
      {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: {
          ...process.env,
          SKIP_DOCS_VIEWER_BUNDLE_BUILD: '1'
        }
      }
    );

    child.on('exit', (code) => {
      resolve(typeof code === 'number' ? code : 1);
    });
  });
}

async function main() {
  const code = await runDocsViewerCheck();
  process.exit(code);
}

main().catch((err) => {
  console.error('[docsViewer.check] Unhandled error:', err);
  process.exit(1);
});
