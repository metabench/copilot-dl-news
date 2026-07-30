'use strict';

const { collectGraph, assignDepths, renderTreeSvg } = require('../techPages');

const BRANCHES = [
  { key: 'agi', color: '#4d9ec8' },
  { key: 'factory', color: '#a678c8' }
];
const B = {
  key: 'factory', label: 'TOOL FACTORY',
  roots: [{ id: 'TF-A', title: 'Root A' }, { id: 'TF-B', title: 'Root B' }],
  grown: [],
  available: [
    { id: 'T1', title: 'First tech', prereqs: [{ id: 'TF-A', branch: 'factory' }, { id: 'AG-X', branch: 'agi' }] },
    { id: 'T2', title: 'Depends on a tech', prereqs: [{ id: 'T1', branch: 'factory' }] }
  ],
  gated: [],
  future: [{ id: 'f-1', title: 'Future Technology' }]
};

describe('drawn tree view (owner 2026-07-28: display as an actual tree)', () => {
  it('collects roots, techs, FOREIGN prereqs as layer-0 nodes, and fog', () => {
    const { nodes, edges } = collectGraph(B);
    const kinds = Object.fromEntries(nodes.map((n) => [n.id, n.kind]));
    expect(kinds['TF-A']).toBe('root');
    expect(kinds['AG-X']).toBe('foreign'); // another branch's tech, drawn dashed
    expect(kinds['T2']).toBe('avail');
    expect(kinds['f-1']).toBe('fog');
    expect(edges).toContainEqual({ from: 'T1', to: 'T2', branch: 'factory' });
  });

  it('layers by prereq depth: foundations 0, tech-on-tech one layer deeper, fog beyond all', () => {
    const { nodes, edges } = collectGraph(B);
    const d = assignDepths(nodes, edges);
    expect(d.get('TF-A')).toBe(0);
    expect(d.get('AG-X')).toBe(0);
    expect(d.get('T1')).toBe(1);
    expect(d.get('T2')).toBe(2);
    expect(d.get('f-1')).toBe(3);
  });

  it('never loses a node to a cycle — the guard parks it rather than dropping it', () => {
    const nodes = [{ id: 'X', kind: 'avail' }, { id: 'Y', kind: 'avail' }];
    const edges = [{ from: 'X', to: 'Y' }, { from: 'Y', to: 'X' }];
    const d = assignDepths(nodes, edges);
    expect(d.has('X')).toBe(true);
    expect(d.has('Y')).toBe(true);
  });

  it('renders an SVG with edges (paths), all node ids, and no NaN coordinates', () => {
    const svg = renderTreeSvg(B, BRANCHES);
    expect(svg).toContain('<path d="M');
    for (const id of ['TF-A', 'TF-B', 'T1', 'T2']) expect(svg).toContain(id);
    expect(svg).toContain('Future Technology');
    expect(svg).not.toContain('NaN');
    // foreign nodes dashed, edges colored by source branch (the intertwine)
    expect(svg).toContain('stroke-dasharray="3,2"');
    expect(svg).toContain('stroke="#4d9ec8"');
  });
});

// ── Cycle 154 (second TECH-APPREVIEW run): answer where the question was asked ──
// The protocol duty from c152 was only half-implemented: a node showed its
// PENDING state but reverted to a plain button the moment a signal was acked,
// so the answer lived only in the factory page's last-8 log. That hurts most on
// the re-runnable review nodes, which never grow and so never show progress any
// other way.
const { renderTechPage, renderNodePage } = require('../techPages');

const HISTORY_TREE = {
  branches: [{
    key: 'agi', label: 'AGI', color: '#4d9ec8', icon: 'iceBulb', tagline: 'cold light',
    roots: [{ id: 'AG-R', title: 'Root', note: 'n' }],
    grown: [],
    available: [
      { id: 'TECH-REVIEW', title: 'Review Op', research: 're-run the review', prereqs: [], signal: 'app-review' },
      { id: 'TECH-PLAIN', title: 'Plain Tech', research: 'do a thing', prereqs: [] }
    ],
    gated: [],
    future: [{ id: 'agi-future-1', title: 'Future Technology' }]
  }],
  absorbed: 0
};
const HISTORY = [
  { id: 'sig-1', tech: 'TECH-REVIEW', at: '2026-07-28T00:28:11.000Z', status: 'done', ackAt: '2026-07-28T00:37:02.000Z', ackNote: 'shipped the probe and the compact buttons' },
  { id: 'sig-2', tech: 'TECH-REVIEW', at: '2026-07-30T12:16:17.000Z', status: 'pending', requested: 'review the app again' },
  { id: 'sig-3', tech: 'OTHER-TECH', at: '2026-07-29T00:00:00.000Z', status: 'done', ackAt: '2026-07-29T01:00:00.000Z', ackNote: 'not this node' }
];

describe('per-node request history', () => {
  it('an ANSWERED request shows on the node that was clicked, with its answer', () => {
    const html = renderTechPage('agi', HISTORY_TREE, { pendingSignals: [], signalHistory: HISTORY });
    expect(html).toContain('YOUR PAST REQUESTS');
    expect(html).toContain('shipped the probe and the compact buttons');
    expect(html).toContain('answered 2026-07-28 00:37');
  });

  it('another node&apos;s history never leaks onto this node', () => {
    const html = renderTechPage('agi', HISTORY_TREE, { pendingSignals: [], signalHistory: HISTORY });
    expect(html).not.toContain('not this node');
  });

  it('a node with no history renders no history block (no empty furniture)', () => {
    const html = renderTechPage('agi', HISTORY_TREE, { pendingSignals: [], signalHistory: [] });
    expect(html).not.toContain('YOUR PAST REQUESTS');
  });

  it('the datalinks page lists EVERY request for the node, pending and answered', () => {
    const html = renderNodePage('TECH-REVIEW', HISTORY_TREE, { ledgerTrail: [], signalHistory: HISTORY });
    expect(html).toContain('YOUR REQUESTS — 2 on this node');
    expect(html).toContain('pending — the agent picks it up');
    expect(html).toContain('shipped the probe and the compact buttons');
  });

  it('ack notes are ESCAPED — the cycle-72 contract holds on owner-facing text too', () => {
    const hostile = [{ id: 's', tech: 'TECH-PLAIN', at: '2026-07-30T00:00:00.000Z', status: 'done', ackAt: '2026-07-30T01:00:00.000Z', ackNote: '<script>alert(1)</script>' }];
    const html = renderTechPage('agi', HISTORY_TREE, { pendingSignals: [], signalHistory: hostile });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// The review caught its own first cut being incomplete: history vanished on
// GROWN nodes (the owner's click is often why they grew) and on nodes with a
// NEW request pending (the re-runnable review nodes, precisely where the last
// run's answer matters most).
describe('per-node request history: the two blind spots', () => {
  const GROWN_TREE = {
    branches: [{
      key: 'crawler', label: 'CRAWLER', color: '#b8862e', icon: 'spiderWeb', tagline: 'the product',
      roots: [{ id: 'CR-R', title: 'Root', note: 'n' }],
      grown: [{ id: 'TECH-GREW', title: 'Grew From A Click', researchedOn: '2026-07-30', prereqs: [] }],
      available: [{ id: 'TECH-REVIEW', title: 'Review Op', research: 're-run', prereqs: [], signal: 'app-review' }],
      gated: [], future: []
    }],
    absorbed: 0
  };
  const H = [
    { id: 'g1', tech: 'TECH-GREW', at: '2026-07-30T09:03:00.000Z', status: 'done', ackAt: '2026-07-30T09:46:00.000Z', ackNote: 'delivered and promoted' },
    { id: 'r1', tech: 'TECH-REVIEW', at: '2026-07-28T00:28:00.000Z', status: 'done', ackAt: '2026-07-28T00:37:00.000Z', ackNote: 'first run shipped the probe' },
    { id: 'r2', tech: 'TECH-REVIEW', at: '2026-07-30T12:16:00.000Z', status: 'pending', requested: 'run it again' }
  ];

  it('a GROWN node still shows the request that caused it', () => {
    const html = renderTechPage('crawler', GROWN_TREE, { pendingSignals: [], signalHistory: H });
    expect(html).toContain('delivered and promoted');
  });

  it('a node with a NEW request pending still shows the PREVIOUS run&apos;s answer', () => {
    const html = renderTechPage('crawler', GROWN_TREE, { pendingSignals: [H[2]], signalHistory: H });
    expect(html).toContain('RESEARCH REQUESTED');           // the new click
    expect(html).toContain('first run shipped the probe');   // and the old answer
  });
});

// ── Cycle 155 (owner: "the app did not update after you did the task") ──────
describe('the LIVE strip and its low-frequency poll', () => {
  const html = () => renderTechPage('crawler', {
    branches: [{
      key: 'crawler', label: 'CRAWLER', color: '#b8862e', icon: 'spiderWeb', tagline: 't',
      roots: [{ id: 'CR-R', title: 'R', note: 'n' }], grown: [], available: [], gated: [], future: []
    }],
    absorbed: 0
  }, { pendingSignals: [], signalHistory: [] });

  it('ships the strip container and polls /api/tech-state', () => {
    const h = html();
    expect(h).toContain('id="tp-live"');
    expect(h).toContain("fetch('/api/tech-state'");
  });

  it('polls at LOW frequency and stops while the tab is hidden (the flow-protection constraint)', () => {
    const h = html();
    expect(h).toMatch(/POLL_MS\s*=\s*45000/);
    expect(h).toContain('if (document.hidden) return;');
  });

  it('never force-reloads: it offers a pill instead, so a half-read page is never yanked', () => {
    const h = html();
    expect(h).toContain('id="tp-live-pill"');
    // location.reload appears ONLY inside the pill's click handler.
    expect((h.match(/location\.reload\(\)/g) || []).length).toBe(1);
    expect(h).toContain("el.pill.addEventListener('click'");
  });

  it('treats a server RESTART as a change too — new code cannot arrive via live data', () => {
    expect(html()).toContain('s.serverStartedAt !== started');
  });
});

// ── Cycle 157 (owner: "It still says 'pending pickup' in the UI") ───────────
// The c155 version updated only the strip and offered a pill for everything
// else, so a node card kept showing a stale signal state indefinitely — the
// exact state the owner came to read. A page that hints while displaying
// something false is worse than one that refreshes itself.
describe('a lying page refreshes itself (cycle 157 correction)', () => {
  const h = () => renderTechPage('crawler', {
    branches: [{
      key: 'crawler', label: 'CRAWLER', color: '#b8862e', icon: 'spiderWeb', tagline: 't',
      roots: [{ id: 'CR-R', title: 'R', note: 'n' }], grown: [], available: [], gated: [], future: []
    }],
    absorbed: 0
  }, { pendingSignals: [], signalHistory: [] });

  it('re-renders when the CARDS fingerprint moves', () => {
    expect(h()).toContain('s.fingerprints.cards !== firstCards');
    expect(h()).toContain('if (!dialogOpen()) refreshNow();');
  });

  it('an activity report NEVER triggers a reload — only the strip is patched', () => {
    const src = h();
    // The reload decision reads fingerprints.cards only; activity feeds paint().
    expect(src).not.toMatch(/fingerprints\.activity\s*!==/);
    expect(src).toContain('paint(s); // the strip is always patched in place');
  });

  it('holds the refresh while a dialog is open, then applies it on close', () => {
    const src = h();
    expect(src).toContain("document.querySelector('dialog[open]')");
    expect(src).toContain("document.addEventListener('close'");
    expect(src).toContain('if (staleCards && !dialogOpen()) refreshNow();');
  });

  it('preserves the reading position across its own refresh', () => {
    const src = h();
    expect(src).toContain('sessionStorage.setItem(SCROLL_KEY');
    expect(src).toContain('window.scrollTo(0, Number(saved) || 0)');
  });

  it('the pill says the page is WRONG, not merely that news exists', () => {
    expect(h()).toContain('this page is out of date — refresh now');
  });
});
