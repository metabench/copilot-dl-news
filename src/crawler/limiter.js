const { sleep, nowMs } = require('./utils');

class DomainLimiter {
  constructor({ pacerJitterMinMs = 25, pacerJitterMaxMs = 50 } = {}) {
    this.states = new Map();
    this._windowMs = 60 * 1000;
    this.pacerJitterMinMs = pacerJitterMinMs;
    this.pacerJitterMaxMs = pacerJitterMaxMs;
  }

  _get(host) {
    let s = this.states.get(host);
    if (!s) {
      s = {
        host,
        isLimited: false,
        rpm: null,
        nextRequestAt: 0,
        backoffUntil: 0,
        lastRequestAt: 0,
        lastSuccessAt: 0,
        last429At: 0,
        successStreak: 0,
        err429Streak: 0,
        rpmLastMinute: 0,
        windowStartedAt: 0,
        windowCount: 0,
        lastHttpStatus: null
      };
      this.states.set(host, s);
    }
    return s;
  }

  getSnapshot(host) {
    const state = this._get(host);
    return { ...state };
  }

  async acquire(host) {
    const now = nowMs();
    const s = this._get(host);
    if (s.backoffUntil > now) {
      await sleep(s.backoffUntil - now);
    }
    if (!s.isLimited) {
      s.lastRequestAt = now;
      return;
    }
    if (s.nextRequestAt > now) {
      await sleep(s.nextRequestAt - now);
    }
    const t = nowMs();
    s.lastRequestAt = t;
    const interval = s.rpm > 0 ? Math.floor(60000 / s.rpm) : 0;
    const min = this.pacerJitterMinMs;
    const max = this.pacerJitterMaxMs;
    const jitter = max > min ? (min + Math.floor(Math.random() * (max - min + 1))) : min;
    s.nextRequestAt = t + interval + jitter;
    if (t - s.windowStartedAt >= this._windowMs) {
      s.rpmLastMinute = s.windowCount;
      s.windowStartedAt = t;
      s.windowCount = 0;
    }
    s.windowCount++;
  }

  note429(host, retryAfterMs) {
    const now = nowMs();
    const s = this._get(host);
    s.isLimited = true;
    s.lastHttpStatus = 429;
    s.last429At = now;
    s.successStreak = 0;
    s.err429Streak++;
    const base = retryAfterMs != null ? Math.max(30000, retryAfterMs) : 45000;
    const jitter = Math.floor(base * ((Math.random() * 0.2) - 0.1));
    let blackout = base + jitter;
    if (s.err429Streak >= 2) blackout = Math.max(blackout, 5 * 60 * 1000);
    if (s.err429Streak >= 3) blackout = Math.max(blackout, 15 * 60 * 1000);
    s.backoffUntil = now + blackout;
    const currentRpm = s.rpm || 60;
    const newRpm = Math.max(1, Math.floor(currentRpm * 0.25));
    s.rpm = newRpm;
    s.nextRequestAt = now + Math.floor(60000 / newRpm);
  }

  noteSuccess(host) {
    const now = nowMs();
    const s = this._get(host);
    s.lastSuccessAt = now;
    s.successStreak++;
    s.err429Streak = 0;
    if (!s.isLimited) {
      s.lastHttpStatus = null;
    }
    if (s.isLimited && s.successStreak > 100) {
      const canProbe = (now - s.last429At) > 5 * 60 * 1000;
      if (canProbe) {
        const current = s.rpm || 10;
        const next = Math.max(1, Math.floor(current * 1.1));
        s.rpm = Math.min(next, 300);
        s.successStreak = 0;
      }
    }
  }
}

module.exports = { DomainLimiter };
