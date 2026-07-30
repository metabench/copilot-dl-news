'use strict';

/**
 * Tests for the project-status control set (cycle 163).
 *
 * Two kinds of assertion here, deliberately:
 *
 *  1. BEHAVIOUR — the page composes from a status payload, every part that the
 *     live refresh talks to is findable, and the models format what they claim.
 *  2. STRUCTURAL AXES — one class per file, no hand-built DOM, no module-level
 *     mutables, CSS on the control. These are the measured axes stage 2 moved,
 *     and without a guard the next cycle can walk them back without noticing.
 *     Each has a monotonic direction, so a failure here is a regression, not a
 *     style opinion.
 */

const fs = require('fs');
const path = require('path');
const jsgui = require('jsgui3-html');

const CONTROLS_DIR = path.join(__dirname, '..', 'controls');
const { Project_Status_Page, APP_CONTROLS } = require('../controls/index.js');
const models = require('../controls/shared/models');
const { buildNodeIndexFromTree, treeBoardModel } = require('../controls/shared/tree-layout');

const jsFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? jsFiles(path.join(dir, e.name)) : (e.name.endsWith('.js') ? [path.join(dir, e.name)] : [])));

const branch = (key, label, color) => ({
  key,
  label,
  color,
  icon: 'iceBulb',
  tagline: `${label} tagline`,
  roots: [{ id: `${key}-ROOT`, title: 'a foundation' }],
  grown: [{ id: `${key}-G1`, title: 'grown one', researchedOn: '2026-07-01', prereqs: [{ id: `${key}-ROOT` }] }],
  available: [{ id: `${key}-A1`, title: 'open one', research: 'what researching it means', priority: 'High', prereqs: [{ id: `${key}-G1` }] }],
  gated: [{ id: `${key}-X1`, title: 'gated one', prereqs: [] }],
  future: [{ id: `${key}-F1`, title: '❓ Future Technology' }]
});

const STATUS = {
  player: { xpTotal: 84, xpInLevel: 4, xpPerLevel: 10, dataThrough: '2026-07-30' },
  stats: { cycles: 163, preShipPct: 71, defectsPre: 42, corrections: 9, pages: 290144 },
  mainQuest: { cycle: 163, label: 'one control per file' },
  sideQuests: [{ cycle: 149, label: 'restore lost coverage' }],
  playerInput: ['approve the Defender exclusion'],
  recent: [{ cycle: 162, label: 'adopted stock controls' }, { cycle: 161, label: 'mis-stated', correction: true }],
  agentActivity: { idle: false, phase: 'building', cycle: 163, note: 'splitting controls', ageMinutes: 0 },
  pendingSignals: [{ tech: 'TECH-X', at: '2026-07-30T13:21:59.383Z' }],
  party: [
    { name: 'copilot-dl-news', role: 'the app', status: 'ACTIVE', condition: 'healthy', lastCommit: 'abc1234' },
    { name: 'news-crawler-itself', role: 'the engine', status: 'IDLE', condition: 'wedged', danger: true }
  ],
  roadmap: { block: { label: 'Workflow v3', why: 'owner directive' }, steps: [{ label: 'lanes', detail: 'per repo' }] },
  techTree: { absorbed: 31, branches: [branch('agi', 'AGI', '#b8862e'), branch('crawler', 'CRAWLER', '#4d9ec8')] },
  signalHistory: [
    { tech: 'TECH-X', at: '2026-07-30T13:21:59.383Z', status: 'pending', requested: 'do the thing' },
    { tech: 'TECH-Y', at: '2026-07-29T10:00:00.000Z', ackAt: '2026-07-29T11:00:00.000Z', status: 'done', ackNote: 'delivered' }
  ],
  achievements: [{ icon: '🏅', label: 'FIRST LIGHT', detail: 'the loop closed' }]
};

const render = (status) => {
  Project_Status_Page.get_status = () => status;
  const page = new Project_Status_Page({ context: new jsgui.Page_Context() });
  return page.all_html_render();
};

describe('project-status controls — composition', () => {
  let html;
  beforeAll(() => { html = render(STATUS); });

  test('SSRs the whole page without client activation', () => {
    expect(html.length).toBeGreaterThan(10000);
    expect(html).toContain('PROJECT STATUS — news-crawler ecosystem');
  });

  test('every part the live refresh talks to is findable by role', () => {
    // _apply dispatches by role; a missing mark means that part silently stops
    // updating, which is precisely how the signal log went stale unnoticed.
    for (const role of [
      'page', 'live_strip', 'settings', 'player_bar', 'stat_chips', 'work_panel',
      'modules_panel', 'road_strip', 'tree', 'detail_panel', 'branch_cards',
      'signal_log', 'history_panel', 'milestones_panel', 'status_footer'
    ]) {
      expect(html).toContain(`data-ps-role="${role}"`);
    }
  });

  test('renders one node per technology, with band anchors for the deep links', () => {
    const index = buildNodeIndexFromTree(STATUS.techTree);
    expect((html.match(/data-node-id=/g) || []).length).toBe(Object.keys(index).length);
    expect(html).toContain('data-band="agi"');
    expect(html).toContain('data-band="crawler"');
  });

  test('renders a stat card per chip definition and one progress bar', () => {
    expect((html.match(/data-ps-chip=/g) || []).length).toBe(models.CHIP_DEFS.length);
    expect((html.match(/role="progressbar"/g) || []).length).toBe(1);
  });

  test('renders a card per module and an SSR signal-log grid', () => {
    expect((html.match(/data-ps-card=/g) || []).length).toBe(STATUS.party.length);
    expect(html).toContain('data-ps-siglog');
  });

  test('escapes through the framework rather than string concatenation', () => {
    const nasty = JSON.parse(JSON.stringify(STATUS));
    nasty.mainQuest.label = '<img src=x onerror=alert(1)>';
    const out = render(nasty);
    expect(out).not.toContain('<img src=x onerror=alert(1)>');
    expect(out).toContain('&lt;img');
  });

  test('survives a missing tech tree rather than throwing', () => {
    const bare = { ...STATUS, techTree: { error: 'ledger unreadable', branches: [] } };
    expect(() => render(bare)).not.toThrow();
    expect(render(bare)).toContain('tech tree unavailable: ledger unreadable');
  });

  test('says so plainly when there is no status at all', () => {
    expect(render(null)).toContain('No status data');
  });
});

describe('project-status models', () => {
  test('signal rows carry values, newest first', () => {
    const rows = models.signalLogRows(STATUS.signalHistory);
    expect(rows).toHaveLength(2);
    expect(rows[0].tech).toBe('TECH-Y');       // reversed: newest at the top
    expect(rows[0].state).toBe('✓ answered');
    expect(rows[0].note).toBe('delivered');
    expect(rows[1].state).toBe('⚡ pending');
    expect(rows[1].note).toBe('do the thing');
  });

  test('an idle agent produces no activity line at all', () => {
    // An empty box beats a line presenting an hours-old phase as if it were live.
    expect(models.activityLines({ idle: true, reason: 'between cycles' })).toEqual([]);
    expect(models.activityLines(null)).toEqual([]);
    expect(models.activityLines(STATUS.agentActivity)[0]).toContain('AGENT WORKING');
  });

  test('the road always ends in the fog of war', () => {
    const cards = models.roadCardModels(STATUS);
    expect(cards[0].top).toBe('NOW');
    expect(cards[cards.length - 1].main).toBe('❓ Future Technology');
  });

  test('kind labels name the state a person would recognise', () => {
    expect(models.kindLabel({ kind: 'avail' })).toBe('research available');
    expect(models.kindLabel({ kind: 'grown', researchedOn: '2026-07-01' })).toBe('researched 2026-07-01');
    expect(models.kindLabel({ kind: 'gated' })).toContain('yours to authorize');
  });
});

describe('project-status tree layout', () => {
  test('indexes every node of every branch with its kind', () => {
    const index = buildNodeIndexFromTree(STATUS.techTree);
    expect(index['agi-A1'].kind).toBe('avail');
    expect(index['agi-G1'].kind).toBe('grown');
    expect(index['agi-F1'].kind).toBe('fog');
    expect(index['agi-A1'].branchLabel).toBe('AGI');
  });

  test('lays prerequisites out left of their dependants', () => {
    const m = treeBoardModel(STATUS.techTree);
    const at = (id) => m.nodes.find((n) => n.id === id);
    expect(at('agi-ROOT').x).toBeLessThan(at('agi-G1').x);
    expect(at('agi-G1').x).toBeLessThan(at('agi-A1').x);
    expect(m.edges.length).toBeGreaterThan(0);
    expect(m.width).toBeGreaterThan(0);
    expect(m.height).toBeGreaterThan(0);
  });

  test('an empty tree lays out without throwing', () => {
    expect(() => treeBoardModel({ branches: [] })).not.toThrow();
    expect(() => treeBoardModel(null)).not.toThrow();
  });
});

describe('project-status structure — the axes stage 2 moved', () => {
  const files = jsFiles(CONTROLS_DIR);
  const controlFiles = files.filter((f) => /[\\/](hub|work|tree|detail|app)[\\/]/.test(f));

  test('one class per file', () => {
    for (const f of controlFiles) {
      const classes = (fs.readFileSync(f, 'utf8').match(/^class /gm) || []).length;
      expect([f, classes]).toEqual([f, 1]);
    }
  });

  test('no hand-built DOM anywhere in the control set', () => {
    // createElement always works and is always available, which is exactly how
    // the retired string pages were born. Controls compose; they do not patch.
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      expect([f, /createElement|innerHTML/.test(src)]).toEqual([f, false]);
    }
  });

  test('no module-level mutable state', () => {
    // Module state is shared by every page the process renders and is reachable
    // only from inside its own file; view state belongs on the control.
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      expect([f, /^let\s/m.test(src)]).toEqual([f, false]);
    }
  });

  test('each control carries its own CSS, the documented static hook', () => {
    for (const f of controlFiles) {
      if (f.endsWith('Project_Status_Page.js')) continue; // the document, not a styled control
      expect([f, /\.css = `/.test(fs.readFileSync(f, 'utf8'))]).toEqual([f, true]);
    }
  });

  test('every control is registered under both key casings for reattachment', () => {
    // Reattachment resolves data-jsgui-type through jsgui.controls; a missing
    // registration renders fine and never activates — a proven silent no-op.
    for (const [snake, Ctrl] of Object.entries(APP_CONTROLS)) {
      expect(jsgui.controls[snake]).toBe(Ctrl);
      expect(jsgui.controls[Ctrl.name]).toBe(Ctrl);
    }
    expect(Object.keys(APP_CONTROLS).length).toBe(controlFiles.length);
  });
});
