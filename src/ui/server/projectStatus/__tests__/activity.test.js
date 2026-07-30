'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const activity = require('../activity');
const { techStateFingerprint } = require('../statusData');

const tmpLog = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tp-activity-')), 'agent-activity.jsonl');

describe('agent activity channel (owner directive 2026-07-30: low frequency by design)', () => {
  it('records a phase boundary and reads it back as CURRENT work', () => {
    const log = tmpLog();
    const t0 = 1_800_000_000_000;
    expect(activity.report({ phase: 'building', note: 'live strip', cycle: 155 }, log, t0).ok).toBe(true);
    const cur = activity.current(log, t0 + 60_000);
    expect(cur.idle).toBe(false);
    expect(cur.phase).toBe('building');
    expect(cur.note).toBe('live strip');
    expect(cur.ageMinutes).toBe(1);
  });

  it('THROTTLES a report arriving inside the minimum interval — flow protection is enforced, not requested', () => {
    const log = tmpLog();
    const t0 = 1_800_000_000_000;
    activity.report({ phase: 'a', note: 'first' }, log, t0);
    const second = activity.report({ phase: 'b', note: 'too soon' }, log, t0 + 5_000);
    expect(second.ok).toBe(false);
    expect(second.throttled).toBe(true);
    expect(second.retryAfterMs).toBeGreaterThan(0);
    // ...and nothing was written, so the strip still shows the first record.
    expect(activity.current(log, t0 + 6_000).note).toBe('first');
  });

  it('accepts the next report once the interval has passed', () => {
    const log = tmpLog();
    const t0 = 1_800_000_000_000;
    activity.report({ phase: 'a', note: 'first' }, log, t0);
    const later = activity.report({ phase: 'verifying', note: 'tests green' }, log, t0 + activity.MIN_INTERVAL_MS + 1);
    expect(later.ok).toBe(true);
    expect(activity.current(log, t0 + activity.MIN_INTERVAL_MS + 2).phase).toBe('verifying');
  });

  it('goes IDLE rather than presenting a stale phase as live (the cycle-150 zombie lesson)', () => {
    const log = tmpLog();
    const t0 = 1_800_000_000_000;
    activity.report({ phase: 'building', note: 'hours ago' }, log, t0);
    const cur = activity.current(log, t0 + activity.STALE_AFTER_MS + 1);
    expect(cur.idle).toBe(true);
    expect(cur.reason).toMatch(/stale/);
    expect(cur.phase).toBe('building'); // still reported, but never as current work
  });

  it('an empty/absent log is idle and never throws', () => {
    const log = tmpLog();
    expect(activity.current(log).idle).toBe(true);
    expect(activity.readAll(log)).toEqual([]);
    expect(activity.newest(log)).toBe(null);
  });

  it('a phase is required; long notes are clamped; whitespace is collapsed', () => {
    const log = tmpLog();
    expect(activity.report({ note: 'no phase' }, log).ok).toBe(false);
    const t0 = 1_800_000_000_000;
    const out = activity.report({ phase: 'x'.repeat(80), note: 'a\n  b\t c' + 'y'.repeat(400) }, log, t0);
    expect(out.record.phase.length).toBe(40);
    expect(out.record.note.length).toBe(240);
    expect(out.record.note.startsWith('a b c')).toBe(true);
  });

  it('a torn JSONL line is skipped rather than crashing the reader', () => {
    const log = tmpLog();
    fs.writeFileSync(log, '{"phase":"ok","atMs":1}\n{not json\n');
    expect(activity.readAll(log)).toHaveLength(1);
  });
});

describe('techStateFingerprint (the cheap poll target)', () => {
  it('is stable over unchanged inputs and splits cards from activity', () => {
    expect(techStateFingerprint()).toEqual(techStateFingerprint());
    const fp = techStateFingerprint();
    expect(typeof fp.cards).toBe('string');
    expect(typeof fp.activity).toBe('string');
  });

  // The split IS the cycle-157 fix: a progress note must not reload the owner's
  // page, and a changed card must not be left showing a false state.
  it('the activity log is NOT part of the cards fingerprint', () => {
    expect(techStateFingerprint().cards).not.toMatch(/agent-activity/);
    expect(techStateFingerprint().activity).toMatch(/agent-activity/);
  });

  it('a progress report moves ONLY the activity fingerprint, never cards', () => {
    const target = path.resolve(__dirname, '..', '..', '..', '..', '..', 'data', 'agent-activity.jsonl');
    const existed = fs.existsSync(target);
    const original = existed ? fs.readFileSync(target) : null;
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const before = techStateFingerprint();
      fs.appendFileSync(target, JSON.stringify({ phase: 'split-test', atMs: Date.now() }) + '\n');
      const after = techStateFingerprint();
      expect(after.activity).not.toBe(before.activity);
      expect(after.cards).toBe(before.cards);
    } finally {
      if (existed) fs.writeFileSync(target, original);
      else if (fs.existsSync(target)) fs.unlinkSync(target);
    }
  });

  it('an answered signal MOVES the cards fingerprint — the page must know it is lying', () => {
    const target = path.resolve(__dirname, '..', '..', '..', '..', '..', 'data', 'agi-signals.jsonl');
    const existed = fs.existsSync(target);
    const original = existed ? fs.readFileSync(target) : null;
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const before = techStateFingerprint();
      fs.appendFileSync(target, JSON.stringify({ id: 'sig-cards-test', status: 'done', ackAt: new Date().toISOString() }) + '\n');
      expect(techStateFingerprint().cards).not.toBe(before.cards);
    } finally {
      if (existed) fs.writeFileSync(target, original);
      else if (fs.existsSync(target)) fs.unlinkSync(target);
    }
  });

  it('names every input it watches, so a missed file is visible in review not runtime', () => {
    const { FINGERPRINT_INPUTS } = require('../statusData');
    const names = FINGERPRINT_INPUTS.map((segs) => segs[segs.length - 1]);
    // The files a cycle touches when it lands work — tree spec, states, roadmap,
    // the record, the picture, the owner's clicks, the agent's progress.
    expect(names).toEqual(expect.arrayContaining([
      'tech-tree.json', 'roadmap.json', 'RESEARCH_BACKLOG.md',
      'IMPROVEMENT_LEDGER.md', 'progress.svg', 'agi-signals.jsonl', 'agent-activity.jsonl'
    ]));
  });

  it('CHANGES when a watched file changes — the whole point', () => {
    const before = techStateFingerprint();
    const target = path.resolve(__dirname, '..', '..', '..', '..', '..', 'data', 'agent-activity.jsonl');
    const existed = fs.existsSync(target);
    const original = existed ? fs.readFileSync(target) : null;
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, JSON.stringify({ phase: 'fingerprint-test', atMs: Date.now() }) + '\n');
      expect(techStateFingerprint()).not.toEqual(before);
    } finally {
      if (existed) fs.writeFileSync(target, original);
      else fs.unlinkSync(target);
    }
  });
});

// Caught by live verification, not by unit tests (cycle 155): buildStatus caches
// for 30s, so the hub served a stale activity line — the very "did not update"
// class this cycle exists to fix. The cheap channels must be exempt.
describe('buildStatus cache must never staleize the live channels', () => {
  const { buildStatus } = require('../statusData');
  const realLog = path.resolve(__dirname, '..', '..', '..', '..', '..', 'data', 'agent-activity.jsonl');

  it('a cache HIT still returns freshly-read activity', () => {
    const existed = fs.existsSync(realLog);
    const original = existed ? fs.readFileSync(realLog) : null;
    try {
      fs.mkdirSync(path.dirname(realLog), { recursive: true });
      const write = (note) => fs.writeFileSync(realLog,
        JSON.stringify({ phase: 'building', note, cycle: 155, at: new Date().toISOString(), atMs: Date.now() }) + '\n');

      write('first');
      expect(buildStatus().agentActivity.note).toBe('first');   // populates the cache
      write('second');
      // Same call within the 30s window — the cached ledger work is reused, but
      // the activity line must reflect the newer record.
      expect(buildStatus().agentActivity.note).toBe('second');
    } finally {
      if (existed) fs.writeFileSync(realLog, original);
      else if (fs.existsSync(realLog)) fs.unlinkSync(realLog);
    }
  });
});
