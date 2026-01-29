const path = require('path');
const fs = require('fs');

// Find the repository/project root by walking up from a start directory
// until we find a directory containing a package.json. If none is found,
// fall back to the provided start directory.
function findProjectRoot(startDir) {
  try {
    const explicit = process.env.COPILOT_DL_NEWS_ROOT || process.env.PROJECT_ROOT;
    if (explicit && fs.existsSync(explicit)) return path.resolve(explicit);

    let dir = path.resolve(startDir || process.cwd());
    const { root } = path.parse(dir);
    while (true) {
      const pkg = path.join(dir, 'package.json');
      if (fs.existsSync(pkg)) return dir;
      if (dir === root) break;
      dir = path.dirname(dir);
    }
  } catch (_) {}
  return path.resolve(startDir || process.cwd());
}

module.exports = { findProjectRoot };
