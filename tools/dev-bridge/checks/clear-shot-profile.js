'use strict';
// Remove the isolated ui-screenshot Electron profile so cached responses
// from earlier page versions can't contaminate visual verification.
const path = require('path');
const fs = require('fs');
const dir = path.join(__dirname, '..', 'state', 'ui-shot-profile');
try {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('[clear] removed', dir);
} catch (err) {
  console.log('[clear]', err.message);
}
