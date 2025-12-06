const { spawnSync } = require('child_process');
const path = require('path');

function pick(options) {
  const script = path.resolve(__dirname, 'ui-pick.js');
  // Pass options as JSON to avoid shell issues
  const result = spawnSync('node', [script, '--options', JSON.stringify(options)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit']
  });

  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim().replace(/^"|"$/g, ''); // Remove quotes if JSON stringified
}

console.log('Asking user for input...');
const choice = pick([
  { label: 'Analyze Codebase', description: 'Run js-scan on src/', value: 'analyze' },
  { label: 'Run Tests', description: 'Run all unit tests', value: 'test' },
  { label: 'Deploy', description: 'Deploy to production', value: 'deploy' }
]);

if (choice) {
  console.log(`User selected: ${choice}`);
} else {
  console.log('User cancelled.');
}
