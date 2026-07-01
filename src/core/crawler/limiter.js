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
        rpm: 30,  // Default conservative RPM for new domains to prevent 429 errors
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
        lastHttpStatus: null,
        politenessFloorMs: 0,
        politenessSource: null,
        crawlDelaySeconds: null
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
    const politenessFloorMs = Math.max(0, Number(s.politenessFloorMs) || 0);
    if (!s.isLimited && politenessFloorMs <= 0) {
      s.lastRequestAt = now;
      return;
    }
    if (s.nextRequestAt > now) {
      await sleep(s.nextRequestAt - now);
    }
    const t = nowMs();
    s.lastRequestAt = t;
    const rateInterval = s.isLimited && s.rpm > 0 ? Math.floor(60000 / s.rpm) : 0;
    const interval = Math.max(rateInterval, politenessFloorMs);
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

  setPolitenessFloor(host, intervalMs, { source = 'robots-crawl-delay', crawlDelaySeconds = null } = {}) {
    const s = this._get(host);
    const floor = Math.max(0, Math.floor(Number(intervalMs) || 0));
    s.politenessFloorMs = floor;
    s.politenessSource = floor > 0 ? source : null;
    s.crawlDelaySeconds = floor > 0
      ? (Number.isFinite(Number(crawlDelaySeconds)) ? Number(crawlDelaySeconds) : floor / 1000)
      : null;
    if (s.rpm > 0 && floor > 0) {
      const floorRpm = Math.max(1, Math.floor(60000 / floor));
      s.rpm = Math.min(s.rpm, floorRpm);
    }
    return { ...s };
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
    const floorRpm = s.politenessFloorMs > 0 ? Math.max(1, Math.floor(60000 / s.politenessFloorMs)) : Infinity;
    const newRpm = Math.min(floorRpm, Math.max(1, Math.floor(currentRpm * 0.25)));
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
        const floorRpm = s.politenessFloorMs > 0 ? Math.max(1, Math.floor(60000 / s.politenessFloorMs)) : 300;
        s.rpm = Math.min(next, 300, floorRpm);
        s.successStreak = 0;
      }
    }
  }
}

module.exports = { DomainLimiter };
