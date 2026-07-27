'use strict';

const vm = require('vm');
const { UnifiedShell } = require('../UnifiedShell');

/**
 * cycle 78 — guards the "Recent Crawl Activity" fix + the template-literal
 * regex-backslash trap that nearly broke it. The whole client script is emitted
 * from a backtick template literal, which eats regex backslashes (\/ -> /,
 * \. -> .) — a strip-regex silently became a `//` line comment. These assertions
 * fail loudly if a future edit reintroduces that, or unwires the live hydration.
 */
function emittedClientScript() {
  const html = new UnifiedShell({ activeAppId: 'home', apps: [], categories: [] }).render();
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no <script> found in UnifiedShell render');
  return m[1];
}

describe('UnifiedShell home crawl-activity hydration (cycle 78)', () => {
  const script = emittedClientScript();

  test('the EMITTED client script parses (guards the backtick-template backslash trap)', () => {
    // vm.Script compiles in script mode without running — throws only on a syntax
    // error, e.g. a regex mangled into `replace(//$/, ...)` (a line comment).
    expect(() => new vm.Script(script)).not.toThrow();
  });

  test('activity table is hydrated from the LIVE job registry, not the stale task_events table', () => {
    expect(script).toContain('hydrateHomeActivity');
    expect(script).toContain('/api/v1/crawl/jobs');
    expect(script).toContain('data-home-activity-body');
  });

  test('URL target strip uses backslash-FREE string ops (survives template emission)', () => {
    expect(script).toContain("indexOf('://')");
    // the template-eaten forms that broke it once — must be absent:
    expect(script).not.toMatch(/replace\(\/\/\$\//);        // `//$/` = a line comment
    expect(script).not.toContain('replace(/^https?://');     // mangled protocol strip
  });

  test('status mapping is honest (Active only for running/pending, terminal states distinct)', () => {
    expect(script).toContain("label: 'Active'");
    expect(script).toContain("label: 'Failed'");
    expect(script).toContain("label: 'Complete'");
  });

  // cycle 79 — live throughput strip is the first real consumer of the D4
  // crawl-dash-core endpoint (/api/v1/crawl/dashboard-model).
  test('live throughput strip is hydrated from the crawl-dash-core dashboard-model endpoint', () => {
    expect(script).toContain('hydrateHomeThroughput');
    expect(script).toContain('/api/v1/crawl/dashboard-model');
    const html = new UnifiedShell({ activeAppId: 'home', apps: [], categories: [] }).render();
    expect(html).toContain('data-home-throughput');
  });
});
