const { sleep, nowMs } = require('./utils');

class DomainThrottleManager {
  constructor({
    state,
    pacerJitterMinMs,
    pacerJitterMaxMs,
    getDbAdapter = () => null,
    limiterFactory = null
  } = {}) {
    if (!state) {
      throw new Error('DomainThrottleManager requires a state instance');
    }
    this.state = state;
    this.pacerJitterMinMs = typeof pacerJitterMinMs === 'number' ? Math.max(0, pacerJitterMinMs) : 25;
    this.pacerJitterMaxMs = typeof pacerJitterMaxMs === 'number' ? Math.max(this.pacerJitterMinMs, pacerJitterMaxMs) : 50;
    this.getDbAdapter = typeof getDbAdapter === 'function' ? getDbAdapter : () => null;
    this.limiterFactory = typeof limiterFactory === 'function' ? limiterFactory : null;
    this._domainLimiter = null;
    this._limiterInitialized = false;
  }

  safeHostFromUrl(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch (_) {
      return null;
    }
  }

  getDomainState(host) {
    if (!host) return null;
    let state = this.state.getDomainLimitState(host);
    if (!state) {
      state = {
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
      this.state.setDomainLimitState(host, state);
    }
    return state;
  }

  getHostResumeTime(host) {
    if (!host) return null;
    const state = this.state.getDomainLimitState(host);
    if (!state) return null;
    const resumeAt = Math.max(state.backoffUntil || 0, state.nextRequestAt || 0);
    return resumeAt > 0 ? resumeAt : null;
  }

  isHostRateLimited(host) {
    if (!host) return false;
    const state = this.state.getDomainLimitState(host);
    if (!state) return false;
    const now = nowMs();
    if ((state.backoffUntil || 0) > now) return true;
    if (state.isLimited && (state.nextRequestAt || 0) > now) return true;
    return false;
  }

  async acquireToken(host) {
    const state = this.getDomainState(host);
    if (!state) return;
    try {
      const limiter = this._ensureLimiter();
      if (limiter) {
        await limiter.acquire(host);
        this._syncFromLimiter(limiter, host, state);
        return;
      }
    } catch (_) {
      // Fallback logic handled below
    }
    const now = nowMs();
    if ((state.backoffUntil || 0) > now) {
      await sleep(state.backoffUntil - now);
    }
    state.lastRequestAt = now;
    this._persist(host, state);
  }

  note429(host, retryAfterMs) {
    const state = this.getDomainState(host);
    if (!state) return;
    try {
      const limiter = this._ensureLimiter();
      if (limiter) {
        limiter.note429(host, retryAfterMs);
        this._syncFromLimiter(limiter, host, state);
        return;
      }
    } catch (_) {
      // Fallback logic handled below
    }
    const now = nowMs();
    state.isLimited = true;
    state.lastHttpStatus = 429;
    state.last429At = now;
    state.successStreak = 0;
    state.err429Streak += 1;
    const baseBlackout = retryAfterMs != null ? Math.max(30000, retryAfterMs) : 45000;
    const jitterV = Math.floor(baseBlackout * ((Math.random() * 0.2) - 0.1));
    let blackout = baseBlackout + jitterV;
    if (state.err429Streak >= 2) blackout = Math.max(blackout, 5 * 60 * 1000);
    if (state.err429Streak >= 3) blackout = Math.max(blackout, 15 * 60 * 1000);
    state.backoffUntil = now + blackout;
    const currentRpm = state.rpm || 60;
    const newRpm = Math.max(1, Math.floor(currentRpm * 0.25));
    state.rpm = newRpm;
    state.nextRequestAt = now + Math.floor(60000 / newRpm);
    this._persist(host, state);
  }

  noteSuccess(host) {
    const state = this.getDomainState(host);
    if (!state) return;
    try {
      const limiter = this._ensureLimiter();
      if (limiter) {
        limiter.noteSuccess(host);
        this._syncFromLimiter(limiter, host, state);
        return;
      }
    } catch (_) {
      // Fallback logic handled below
    }
    const now = nowMs();
    state.lastSuccessAt = now;
    state.successStreak += 1;
    state.err429Streak = 0;
    if (state.isLimited && state.successStreak > 100) {
      const canProbe = (now - (state.last429At || 0)) > 5 * 60 * 1000;
      if (canProbe) {
        const currentRpm = state.rpm || 10;
        const nextRpm = Math.max(1, Math.floor(currentRpm * 1.1));
        state.rpm = Math.min(nextRpm, 300);
        state.successStreak = 0;
      }
    }
    if (!state.isLimited) {
      state.lastHttpStatus = null;
    }
    this._persist(host, state);
  }

  _ensureLimiter() {
    if (this._limiterInitialized) {
      return this._domainLimiter;
    }
    this._limiterInitialized = true;
    if (this.limiterFactory) {
      try {
        this._domainLimiter = this.limiterFactory({
          pacerJitterMinMs: this.pacerJitterMinMs,
          pacerJitterMaxMs: this.pacerJitterMaxMs
        }) || null;
      } catch (_) {
        this._domainLimiter = null;
      }
      return this._domainLimiter;
    }
    try {
      // Lazy require to avoid circular timing
      const { DomainLimiter } = require('./limiter');
      this._domainLimiter = new DomainLimiter({
        pacerJitterMinMs: this.pacerJitterMinMs,
        pacerJitterMaxMs: this.pacerJitterMaxMs
      });
    } catch (_) {
      this._domainLimiter = null;
    }
    return this._domainLimiter;
  }

  _syncFromLimiter(limiter, host, state) {
    if (!limiter || typeof limiter.getSnapshot !== 'function') {
      return;
    }
    const snapshot = limiter.getSnapshot(host);
    if (snapshot) {
      const prevStatus = state.lastHttpStatus;
      Object.assign(state, snapshot);
      if (state.lastHttpStatus == null && prevStatus != null) {
        state.lastHttpStatus = prevStatus;
      }
    }
    this._persist(host, state);
  }

  _persist(host, state) {
    if (!host || !state) return;
    const adapter = this.getDbAdapter();
    if (!adapter || typeof adapter.isEnabled !== 'function' || !adapter.isEnabled()) {
      return;
    }
    try {
      const payload = {
        host,
        isLimited: !!state.isLimited,
        rpm: state.rpm != null ? state.rpm : null,
        nextRequestAt: state.nextRequestAt || null,
        backoffUntil: state.backoffUntil || null,
        lastRequestAt: state.lastRequestAt || null,
        lastSuccessAt: state.lastSuccessAt || null,
        last429At: state.last429At || null,
        successStreak: state.successStreak || 0,
        err429Streak: state.err429Streak || 0,
        rpmLastMinute: state.rpmLastMinute || 0,
        windowStartedAt: state.windowStartedAt || 0,
        windowCount: state.windowCount || 0,
        lastHttpStatus: state.lastHttpStatus != null ? state.lastHttpStatus : null,
        recordedAt: new Date().toISOString()
      };
      adapter.upsertDomain(host, JSON.stringify(payload));
    } catch (_) {
      // Persisting domain state is best effort
    }
  }
}

module.exports = {
  DomainThrottleManager
};
