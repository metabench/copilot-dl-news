'use strict';

const core = require('../crawlDashboardCore');
const { ThroughputStripControl } = require('../ThroughputStripControl');
const { HostHealthBadgesControl } = require('../HostHealthBadgesControl');
const { renderControl } = require('../../../controls/checks/renderCheckHarness');

describe('ThroughputStripControl (SSR)', () => {
  function throughputFrom(jobs) {
    const totals = core.normalizeThroughput(jobs);
    return { formatted: core.formatThroughput(totals), activeCount: totals.activeCount };
  }

  it('renders the five normalized rates with their data-cdash-stat hooks', () => {
    const throughput = throughputFrom([
      { status: 'running', progress: { docsDownloadedPerSec: 1.2, docsSavedPerSec: 0.6, networkMbPerSec: 0.3, savedMbPerSec: 0.1, queued: 20 } },
    ]);
    const { html } = renderControl(ThroughputStripControl, { throughput });
    expect(html).toContain('data-cdash-throughput-root="true"');
    expect(html).toContain('data-cdash-stat="downloaded"');
    expect(html).toContain('>1.20<');
    expect(html).toContain('>0.60<'); // saved
    expect(html).toContain('>0.30<'); // network
    expect(html).toContain('>20<');   // queue
    expect(html).toContain('1 active job');
  });

  it('an idle model (all terminal jobs) renders zeros and "0 active jobs"', () => {
    const throughput = throughputFrom([
      { status: 'completed', finishedAt: '2026-07-22T00:00:00Z', progress: { docsSavedPerSec: 2.46, queued: 99 } },
    ]);
    const { html } = renderControl(ThroughputStripControl, { throughput });
    expect(html).toContain('0 active jobs');
    // The terminal ghost (2.46 saved, 99 queue) must NOT appear — active-only sum.
    expect(html).not.toContain('2.46');
    expect(html).not.toContain('>99<');
  });

  it('hardcodes no background on the strip (contrast-safe: inherits theme text)', () => {
    const { html } = renderControl(ThroughputStripControl, { throughput: throughputFrom([]) });
    expect(html).not.toContain('background:'); // no bg anywhere -> no contrast trap possible
  });

  it('remove() clears the poll timer and resets the activation guard (no leak)', () => {
    global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ throughput: { formatted: {}, activeCount: 0 } }) });
    try {
      const { control } = renderControl(ThroughputStripControl, { throughput: throughputFrom([]) });
      control.activate();
      expect(control.__active).toBe(true);
      expect(control._timer).toBeTruthy();
      control.activate(); // re-entrancy guard: no second timer
      control.remove();
      expect(control._timer).toBe(null);
      expect(control.__active).toBe(false);
    } finally { delete global.fetch; }
  });
});

describe('HostHealthBadgesControl (SSR)', () => {
  it('renders contrast-safe badges (explicit bg AND fg) from the core host-health model', () => {
    const model = core.normalizeHostHealth({ hosts: [
      { host: 'www.theguardian.com', cls: 'POLITE-THROTTLE', verdict: 'polite', n: 20, gMed: 33, cv: 0.1, mbps: 0.05, kbMed: 60 },
      { host: 'apnews.com', cls: 'FAST', verdict: 'fast', n: 40, gMed: 1, cv: 0.05, mbps: 0.3, kbMed: 55 },
    ] });
    const { html } = renderControl(HostHealthBadgesControl, { hostHealth: model });
    expect(html).toContain('data-cdash-host-health-root="true"');
    expect(html).toContain('data-cdash-host="theguardian.com"');
    expect(html).toContain('data-cdash-cls="POLITE-THROTTLE"');
    // Contrast-trap guard: every badge carries BOTH the dark bg and the light fg.
    expect(html).toContain('background:#241f18');
    expect(html).toContain('color:#ece8e0');
    expect(html).toContain('theguardian.com  33s');
    expect(html).toContain('title='); // hover tooltip present
  });

  it('renders the empty/threshold text when no host qualifies', () => {
    const model = core.normalizeHostHealth({ refreshing: false, hosts: [] });
    const { html } = renderControl(HostHealthBadgesControl, { hostHealth: model });
    expect(html).toContain('no host met the threshold recently');
    expect(html).not.toContain('data-cdash-host=');
  });

  it('renders remote domain-state badges (RUNNING/IDLE), still contrast-safe', () => {
    const model = core.normalizeRemoteDomains([
      { domain: 'bbc.com', state: 'running', isRunning: true },
      { domain: 'www.cnn.com', state: 'idle', isRunning: false },
    ]);
    const { html } = renderControl(HostHealthBadgesControl, { hostHealth: model });
    expect(html).toContain('data-cdash-cls="RUNNING"');
    expect(html).toContain('data-cdash-cls="IDLE"');
    expect(html).toContain('data-cdash-host="cnn.com"');
    expect(html).toContain('color:#ece8e0'); // contrast-safe for remote badges too
  });

  it('remove() clears the poll timer and resets the activation guard (no leak)', () => {
    global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ hostHealth: { badges: [] } }) });
    try {
      const model = core.normalizeHostHealth({ hosts: [] });
      const { control } = renderControl(HostHealthBadgesControl, { hostHealth: model });
      control.activate();
      expect(control._timer).toBeTruthy();
      control.remove();
      expect(control._timer).toBe(null);
      expect(control.__active).toBe(false);
    } finally { delete global.fetch; }
  });

  it('SSR-ESCAPES a malicious host in the label text node (jsgui does not escape text)', () => {
    // jsgui String_Control renders text raw, so an untrusted value must not reach
    // the DOM unescaped. Host names are constrained in practice, but a badge label
    // must never be able to inject a <script> if a malformed value slips through.
    const model = core.normalizeHostHealth({ hosts: [
      { host: 'evil<script>alert(1)</script>', cls: 'FAST', verdict: 'v', n: 1, gMed: 1, cv: 0, mbps: 0, kbMed: 0 },
    ] });
    const { html } = renderControl(HostHealthBadgesControl, { hostHealth: model });
    expect(html).not.toContain('<script>alert(1)');   // no raw injection in the text node
    expect(html).toContain('&lt;script&gt;alert(1)'); // rendered as inert escaped text
  });
});
