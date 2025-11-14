const { execSync } = require('child_process');
const path = require('path');

describe('UI aggregate bench (mini snapshot)', () => {
  test('urls.total_count should pass the freshness target on mini snapshot', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const bench = path.join(repoRoot, 'scripts', 'perf', 'ui-aggregates-bench.js');
    // Run with JSON output for easier parsing
    const out = execSync(`node ${bench} --snapshot mini --iterations 5 --warmup 1 --json`, { encoding: 'utf8' });
    const payload = JSON.parse(out);
    const urlsStat = payload.results.find((r) => r.key === 'urls.total_count');
    if (!urlsStat) throw new Error('urls.total_count missing from mini bench');
    // If status is error, fail the test (missing table or schema)
    if (urlsStat.status === 'error') throw new Error(`urls.total_count bench error: ${urlsStat.error?.message}`);
    // We only fail the test if bench explicitly returns 'fail' status.
    expect(urlsStat.status).not.toBe('fail');
  }, 20000);
});
