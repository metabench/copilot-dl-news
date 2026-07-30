'use strict';

/**
 * liveEvents.js — event-driven change propagation (owner directive 2026-07-30,
 * cycle 158: "I don't want 45s delays. I want changes to be shown immediately.
 * There should be an event driven architecture.").
 *
 * Replaces the cycle-155 poll. Two halves:
 *
 *   WATCH   fs.watch on the DIRECTORIES holding the inputs (never on individual
 *           files — an editor or a tool that writes via rename/replace breaks a
 *           per-file watch, and both `ack-signal.js` and the ledger tooling do
 *           exactly that). Any filesystem event recomputes the fingerprint and
 *           broadcasts ONLY when it actually changed, so unrelated churn in the
 *           same directory costs one stat() sweep and no traffic.
 *
 *   PUSH    an SSE hub. Server→client only, which is all this needs; it rides
 *           plain HTTP through the existing router, and EventSource reconnects
 *           by itself, so a server restart heals without the page knowing how.
 *
 * The cards/activity split from cycle 157 is preserved and is now the EVENT
 * TYPE: `cards` means the page is displaying something false and must
 * re-render; `activity` means only the progress strip moved and must never
 * reload anything. Conflating them would reintroduce both bugs at once.
 *
 * Out-of-band writers are the reason this watches the filesystem rather than
 * hooking the HTTP handlers alone: `node tools/agi/ack-signal.js` runs in a
 * terminal and never touches this process, yet answering a request MUST reach
 * an open page instantly — that is the exact case the owner reported.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const { techStateFingerprint } = require('./statusData');

/** Coalesce the burst of events a single save produces. */
const DEBOUNCE_MS = 80;
/** Comment frames keep proxies and idle timeouts from dropping the stream. */
const HEARTBEAT_MS = 25000;
/**
 * A slow backstop sweep. NOT the delivery path — watches deliver in
 * milliseconds — but fs.watch is documented as best-effort and can miss events
 * on network drives and some editors' atomic saves. Silent divergence is the
 * one failure this whole cycle exists to prevent, so a cheap 7-stat sweep runs
 * occasionally to catch what a watch dropped.
 */
const BACKSTOP_MS = 120000;

/** Directories that contain the watched inputs (see statusData FINGERPRINT_INPUTS). */
const WATCH_DIRS = [
  ['config'],
  ['docs', 'agi'],
  ['docs', 'agi', 'progress'],
  ['data']
];

class LiveEvents extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.root = opts.root || ROOT;
    this.fingerprint = opts.fingerprint || techStateFingerprint;
    this.debounceMs = opts.debounceMs != null ? opts.debounceMs : DEBOUNCE_MS;
    this.last = this.fingerprint();
    this.watchers = [];
    this.timer = null;
    this.backstop = null;
    this.started = false;
  }

  /** Recompute and emit only what genuinely changed. Safe to call at any rate. */
  check(reason = 'watch') {
    let now;
    try { now = this.fingerprint(); } catch (_) { return null; }
    const changed = {
      cards: now.cards !== this.last.cards,
      activity: now.activity !== this.last.activity
    };
    this.last = now;
    if (changed.cards) this.emit('cards', { reason });
    if (changed.activity) this.emit('activity', { reason });
    return changed;
  }

  _schedule(reason) {
    if (this.timer) return; // already coalescing this burst
    this.timer = setTimeout(() => {
      this.timer = null;
      this.check(reason);
    }, this.debounceMs);
    if (this.timer.unref) this.timer.unref();
  }

  start() {
    if (this.started) return this;
    this.started = true;
    for (const segs of WATCH_DIRS) {
      const dir = path.join(this.root, ...segs);
      try {
        // Non-recursive: every watched input sits directly in one of these dirs,
        // and recursive watching is unsupported on some platforms.
        const w = fs.watch(dir, { persistent: false }, () => this._schedule('watch'));
        w.on('error', () => { /* a vanished dir must never take the server down */ });
        this.watchers.push(w);
      } catch (_) { /* missing dir: the backstop still covers it */ }
    }
    this.backstop = setInterval(() => this.check('backstop'), BACKSTOP_MS);
    if (this.backstop.unref) this.backstop.unref();
    return this;
  }

  stop() {
    for (const w of this.watchers) { try { w.close(); } catch (_) {} }
    this.watchers = [];
    if (this.timer) clearTimeout(this.timer);
    if (this.backstop) clearInterval(this.backstop);
    this.timer = this.backstop = null;
    this.started = false;
  }
}

/**
 * SSE hub. Holds the open responses and writes framed events to all of them.
 * A dead socket is dropped on first write failure rather than tracked — the
 * client reconnects on its own, so pruning is cheaper than bookkeeping.
 */
class SseHub {
  constructor() { this.clients = new Set(); }

  add(res, hello) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no' // never let a proxy buffer an event stream
    });
    // retry: tells EventSource how fast to come back after a restart.
    res.write('retry: 1500\n\n');
    this.clients.add(res);
    if (hello) this.send(res, 'hello', hello);
    return res;
  }

  remove(res) { this.clients.delete(res); }

  send(res, event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch (_) {
      this.clients.delete(res);
      return false;
    }
  }

  broadcast(event, data) {
    let delivered = 0;
    for (const res of [...this.clients]) if (this.send(res, event, data)) delivered += 1;
    return delivered;
  }

  heartbeat() {
    for (const res of [...this.clients]) {
      try { res.write(': ping\n\n'); } catch (_) { this.clients.delete(res); }
    }
  }

  get size() { return this.clients.size; }
}

module.exports = { LiveEvents, SseHub, WATCH_DIRS, DEBOUNCE_MS, HEARTBEAT_MS, BACKSTOP_MS };
