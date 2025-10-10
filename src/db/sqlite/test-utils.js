const fs = require('fs');
const path = require('path');
const os = require('os');

function createTempDb(name = 'test') {
  const tmpDir = path.join(os.tmpdir(), `copilot-tests-${name}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const unique = `${process.pid}-${Date.now()}-${Math.random()}`;
  return path.join(tmpDir, `test-${unique}.db`);
}

module.exports = { createTempDb };
