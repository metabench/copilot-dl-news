'use strict';

/**
 * shared/models — the page's view models and text formatting.
 *
 * Pure functions, no framework, no DOM. Each is used by BOTH the server compose
 * and the client repaint, which is the whole point: one definition means the
 * two sides cannot drift into showing different things from the same data.
 */

const CHIP_DEFS = [
  { key: 'cycles', label: 'cycles recorded', fmt: (st) => String(st.cycles) },
  { key: 'preShipPct', label: 'defects caught pre-ship', fmt: (st) => `${st.preShipPct}%` },
  { key: 'defectsPre', label: 'defects found', fmt: (st) => String(st.defectsPre) },
  { key: 'corrections', label: 'corrections issued', fmt: (st) => String(st.corrections) },
  { key: 'pages', label: 'pages archived', fmt: (st) => `${(st.pages / 1000).toFixed(1)}k` }
];

const xpLabelText = (p) =>
  `${p.xpPerLevel - p.xpInLevel} to the next ${p.xpPerLevel}-improvement milestone · data through ${p.dataThrough}`;

const owedText = (q) => `▸ ${q.label} (from cycle ${q.cycle})`;
const recentText = (r) => `${r.correction ? '↺' : '·'} c${r.cycle} — ${r.label}`;

const signalText = (sig) =>
  `⚡ SIGNAL PENDING — ${sig.tech} (clicked ${sig.at.slice(0, 16).replace('T', ' ')}; picked up at the agent's next orient)`;

/**
 * What the agent is doing now, or nothing at all when idle — an empty box beats
 * a line that presents an hours-old phase as if it were live (cycle 150).
 */
const activityLines = (a) => {
  if (!a || a.idle) return [];
  const age = a.ageMinutes === 0 ? 'just now' : `${a.ageMinutes}m ago`;
  return [`⚙ AGENT WORKING — ${a.phase}${a.cycle ? ` (cycle ${a.cycle})` : ''}: ${a.note || 'in progress'} · ${age}`];
};

// The tree is deliberately not fully visible: '❓ Future Technology' is the fog
// of war. Emoji stand in for the branch icons; the branch COLOR carries on the
// card border.
const BRANCH_EMOJI = { iceBulb: '💡', treeMonitor: '🖥️', spiderWeb: '🕷️', factorySpanner: '🏭' };

function branchCardModel(b) {
  return {
    key: b.key,
    href: `/tech/${b.key}`,
    color: b.color,
    title: `${BRANCH_EMOJI[b.icon] || '▣'} ${b.label}`,
    tagline: b.tagline || '',
    counts: `${b.roots.length} foundations · ${b.grown.length + b.available.length} research (${b.available.length} open) · ${b.gated.length} gated · ${b.future.length} beyond`
  };
}

const absorbedText = (n) =>
  `🌱 ${n || 0} pre-tree research items absorbed into the foundations — the deep roots are not displayed`;

function roadCardModels(s) {
  const cards = [];
  const r = (s && s.roadmap) || {};
  if (r.block) cards.push({ cls: 'ps-road__card ps-road__card--now', top: 'NOW', main: r.block.label, sub: r.block.why || '' });
  (r.steps || []).forEach((st, i) => cards.push({ cls: 'ps-road__card', top: `NEXT ${i + 1}`, main: st.label, sub: st.detail || '' }));
  cards.push({ cls: 'ps-road__card ps-road__card--future', top: 'BEYOND', main: '❓ Future Technology', sub: 'not yet conceptualised' });
  return cards;
}

// Signal rows carry VALUES, not pre-formatted sentences, so the grid can sort
// by state or tech and escaping stays structural.
const SIGNAL_COLUMNS = ['state', 'when', 'tech', 'note'];

const signalRow = (r) => ({
  state: r.status === 'pending' ? '⚡ pending' : '✓ answered',
  when: String(r.status === 'pending' ? r.at : (r.ackAt || r.at) || '').slice(0, 16).replace('T', ' '),
  tech: r.tech || '',
  note: (r.status === 'pending' ? (r.requested || '') : (r.ackNote || '')).slice(0, 200)
});

const signalLogRows = (history) => (history || []).slice(-25).reverse().map(signalRow);

const KIND_LABEL = {
  root: 'foundation',
  avail: 'research available',
  gated: 'gated — yours to authorize',
  fog: 'future technology'
};
const kindLabel = (n) =>
  (n.kind === 'grown' ? 'researched' + (n.researchedOn ? ' ' + n.researchedOn : '') : KIND_LABEL[n.kind]) || n.kind;

module.exports = {
  CHIP_DEFS,
  xpLabelText,
  owedText,
  recentText,
  signalText,
  activityLines,
  BRANCH_EMOJI,
  branchCardModel,
  absorbedText,
  roadCardModels,
  SIGNAL_COLUMNS,
  signalRow,
  signalLogRows,
  kindLabel
};
