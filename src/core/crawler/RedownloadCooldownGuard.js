'use strict';

// P5 of DB-driven crawling (2026-07-20) — guards the on-demand place-hub
// redownload route against re-click storms: a user hammering the button (or
// a script retrying blindly) must not re-trigger a fresh per-host crawl job
// for the same place every time. Deliberately simpler than
// HostRetryBudgetManager (no failure counting — a redownload isn't a
// success/failure signal, just a "don't repeat this too soon" one), but the
// same Map<key, state> + check()/note() shape for consistency.
class RedownloadCooldownGuard {
  constructor(opts = {}) {
    this.cooldownMs = Number.isFinite(opts.cooldownMs) && opts.cooldownMs > 0
      ? opts.cooldownMs
      : 5 * 60 * 1000; // default 5 minutes
    this._state = new Map(); // key -> lastTriggeredAtMs
  }

  check(key) {
    if (!key) return { locked: false, retryAfterMs: 0 };
    const last = this._state.get(key);
    if (last == null) return { locked: false, retryAfterMs: 0 };
    const elapsed = Date.now() - last;
    if (elapsed >= this.cooldownMs) {
      this._state.delete(key);
      return { locked: false, retryAfterMs: 0 };
    }
    return { locked: true, retryAfterMs: this.cooldownMs - elapsed, retryAt: last + this.cooldownMs };
  }

  note(key) {
    if (!key) return;
    this._state.set(key, Date.now());
  }
}

module.exports = RedownloadCooldownGuard;
