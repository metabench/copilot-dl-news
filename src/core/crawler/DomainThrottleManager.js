const { sleep, nowMs, safeHostFromUrl, safeCall, safeCallAsync } = require('./utils');

class DomainThrottleManager {
  constructor({
    state,
    pacerJitterMinMs,
    pacerJitterMaxMs,
    getDbAdapter = () => null,
    limiterFactory = null,
    // 2026-07-26 (owner decision #2, cycle 14): stored domain_rate_limits rows are
    // honoured as a pacing floor. Injected as a function so this class stays
    // DB-agnostic (host -> { rpm?, crawlDelaySeconds? } | null); the caller owns the
    // query. Absent provider => behaviour is exactly as before.
    storedRateLimitProvider = null
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
    this._politenessFloors = new Map();
    this.storedRateLimitProvider = typeof storedRateLimitProvider === 'function' ? storedRateLimitProvider : null;
    // Stored (domain_rate_limits) floors, keyed by NORMALISED host. Kept separate from
    // the robots floors so the two can be combined by max() rather than overwriting.
    this._storedFloors = new Map();
    this._storedLookedUp = new Set();
    // Degraded-limiter visibility (2026-07-21, distributed-crawl plan v2 D2a): a
    // limiter construction/acquire failure previously fell back to
    // CrawlerState-cached pacing SILENTLY — an operator had no signal that
    // politeness had degraded from the real DomainLimiter (robots-informed,
    // 429-adaptive) to the coarser cached floor. Count + log it loudly; the
    // fallback pacing itself is unchanged (still degrades gracefully, never
    // throws), this only removes the silence.
    this.degradedLimiterAcquireFailures = 0;
  }

  /**
   * Safely extract hostname from URL. Delegates to shared utility.
   * @param {string} url - URL to parse
   * @returns {string|null} Hostname or null if invalid
   */
  safeHostFromUrl(url) {
    return safeHostFromUrl(url);
  }

  getDomainState(host) {
    if (!host) return null;
    let state = this.state.getDomainLimitState(host);
    if (!state) {
      state = {
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

  /**
   * Externally imposed backoff (e.g. host retry-budget lockout). Makes
   * getHostResumeTime honor the lock so QueueManager defers the host's
   * queued URLs instead of dequeuing each into a synthetic error. Never
   * shortens an existing backoff.
   */
  applyHostBackoff(host, untilMs) {
    if (!host || !Number.isFinite(untilMs)) return;
    const state = this.getDomainState(host);
    if (!state) return;
    if ((state.backoffUntil || 0) < untilMs) {
      state.backoffUntil = untilMs;
      this.state.setDomainLimitState(host, state);
    }
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
    const limiter = safeCall(() => this._ensureLimiter(), null);
    this._ensureStoredRateLimit(host);
    this._applyStoredPolitenessFloor(host, limiter, state);
    if (limiter) {
      const acquired = await safeCallAsync(async () => {
        await limiter.acquire(host);
        this._syncFromLimiter(limiter, host, state);
        return true;
      }, false);
      if (acquired) {
        return;
      }
    }
    // Reached only when the real DomainLimiter is unavailable or threw —
    // degrading to CrawlerState-cached pacing. Loud on purpose (see the
    // degradedLimiterAcquireFailures comment in the constructor).
    this.degradedLimiterAcquireFailures += 1;
    safeCall(() => console.warn(
      `[DomainThrottleManager] degraded pacing for ${host}: DomainLimiter unavailable/failed ` +
      `(count=${this.degradedLimiterAcquireFailures}) — falling back to cached-state floor`
    ), undefined);
    const now = nowMs();
    if ((state.backoffUntil || 0) > now) {
      await sleep(state.backoffUntil - now);
    }
    if ((state.nextRequestAt || 0) > now) {
      await sleep(state.nextRequestAt - now);
    }
    const t = nowMs();
    state.lastRequestAt = t;
    const floorMs = Math.max(0, Number(state.politenessFloorMs) || 0);
    if (floorMs > 0) {
      state.nextRequestAt = t + floorMs;
    }
    this._persist(host, state);
  }

  note429(host, retryAfterMs) {
    const state = this.getDomainState(host);
    if (!state) return;
    const limiter = safeCall(() => this._ensureLimiter(), null);
    if (limiter) {
      const handled = safeCall(() => {
        limiter.note429(host, retryAfterMs);
        this._syncFromLimiter(limiter, host, state);
        return true;
      }, false);
      if (handled) {
        return;
      }
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
    const floorRpm = state.politenessFloorMs > 0 ? Math.max(1, Math.floor(60000 / state.politenessFloorMs)) : Infinity;
    const newRpm = Math.min(floorRpm, Math.max(1, Math.floor(currentRpm * 0.25)));
    state.rpm = newRpm;
    state.nextRequestAt = now + Math.floor(60000 / newRpm);
    this._persist(host, state);
  }

  noteSuccess(host) {
    const state = this.getDomainState(host);
    if (!state) return;
    const limiter = safeCall(() => this._ensureLimiter(), null);
    if (limiter) {
      const handled = safeCall(() => {
        limiter.noteSuccess(host);
        this._syncFromLimiter(limiter, host, state);
        return true;
      }, false);
      if (handled) {
        return;
      }
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
        const floorRpm = state.politenessFloorMs > 0 ? Math.max(1, Math.floor(60000 / state.politenessFloorMs)) : 300;
        state.rpm = Math.min(nextRpm, 300, floorRpm);
        state.successStreak = 0;
      }
    }
    if (!state.isLimited) {
      state.lastHttpStatus = null;
    }
    this._persist(host, state);
  }

  setRobotsCrawlDelay(host, crawlDelaySeconds, { source = 'robots-crawl-delay' } = {}) {
    const state = this.getDomainState(host);
    if (!state) return null;
    const seconds = Number(crawlDelaySeconds);
    const floorMs = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds * 1000) : 0;
    const payload = {
      floorMs,
      source: floorMs > 0 ? source : null,
      crawlDelaySeconds: floorMs > 0 ? seconds : null
    };
    this._politenessFloors.set(DomainThrottleManager.normalizeHostKey(host), payload);
    const limiter = safeCall(() => this._ensureLimiter(), null);
    this._applyStoredPolitenessFloor(host, limiter, state);
    this._persist(host, state);
    return { ...state };
  }

  _ensureLimiter() {
    if (this._limiterInitialized) {
      return this._domainLimiter;
    }
    this._limiterInitialized = true;
    if (this.limiterFactory) {
      this._domainLimiter = safeCall(() => this.limiterFactory({
        pacerJitterMinMs: this.pacerJitterMinMs,
        pacerJitterMaxMs: this.pacerJitterMaxMs
      }) || null, null);
      return this._domainLimiter;
    }
    this._domainLimiter = safeCall(() => {
      // Lazy require to avoid circular timing
      const { DomainLimiter } = require('./limiter');
      return new DomainLimiter({
        pacerJitterMinMs: this.pacerJitterMinMs,
        pacerJitterMaxMs: this.pacerJitterMaxMs
      });
    }, null);
    return this._domainLimiter;
  }

  /**
   * Normalise a host to one key. `domain_rate_limits` holds rows under BOTH bare and
   * `www.` forms (measured 2026-07-26: `telegraph.co.uk` preset vs `www.irishtimes.com`
   * learned), so an exact-string lookup silently misses half of them. Lowercase + strip
   * a single leading `www.`.
   */
  static normalizeHostKey(host) {
    if (!host) return '';
    return String(host).trim().toLowerCase().replace(/^www\./, '');
  }

  /**
   * Convert a stored domain_rate_limits row into a floor in ms. An explicit
   * crawl_delay_seconds wins over an rpm, since it is the more direct statement.
   */
  static storedRowToFloorMs(row) {
    if (!row) return 0;
    const secs = Number(row.crawlDelaySeconds ?? row.crawl_delay_seconds);
    if (Number.isFinite(secs) && secs > 0) return Math.floor(secs * 1000);
    const rpm = Number(row.rpm ?? row.safe_rpm ?? row.safeRpm ?? row.learned_rpm ?? row.learnedRpm);
    if (Number.isFinite(rpm) && rpm > 0) return Math.floor(60000 / rpm);
    return 0;
  }

  /**
   * Lazily consult the injected provider once per normalised host and cache the result.
   * A provider that throws or returns nothing leaves pacing exactly as it was.
   */
  _ensureStoredRateLimit(host) {
    const key = DomainThrottleManager.normalizeHostKey(host);
    if (!key || this._storedLookedUp.has(key)) return;
    this._storedLookedUp.add(key);
    if (!this.storedRateLimitProvider) return;
    const row = safeCall(() => this.storedRateLimitProvider(key), null);
    const floorMs = DomainThrottleManager.storedRowToFloorMs(row);
    if (floorMs > 0) {
      this._storedFloors.set(key, {
        floorMs,
        source: `stored-rate-limit:${(row && row.source) || 'domain_rate_limits'}`,
        crawlDelaySeconds: floorMs / 1000
      });
    }
  }

  /**
   * The floor actually applied = the MAX of the robots crawl-delay and any stored limit.
   *
   * Owner decision 2026-07-26 #2 was "be more polite, accept slower", so the two floors
   * COMBINE rather than one overwriting the other: taking the max can only ever slow us
   * down, and it satisfies "robots crawl-delay is an absolute floor" in the direction
   * that matters — we never fetch faster than robots.txt permits, and if a stored limit
   * is stricter still we honour that too.
   */
  _effectiveFloor(host) {
    const key = DomainThrottleManager.normalizeHostKey(host);
    const robots = this._politenessFloors.get(key) || this._politenessFloors.get(host) || null;
    const stored = this._storedFloors.get(key) || null;
    if (!robots && !stored) return null;
    if (robots && !stored) return robots;
    if (stored && !robots) return stored;
    return (robots.floorMs >= stored.floorMs) ? robots : stored;
  }

  _applyStoredPolitenessFloor(host, limiter, state) {
    const floor = this._effectiveFloor(host);
    if (!floor || !(floor.floorMs > 0)) return;
    if (limiter && typeof limiter.setPolitenessFloor === 'function') {
      safeCall(() => limiter.setPolitenessFloor(host, floor.floorMs, {
        source: floor.source,
        crawlDelaySeconds: floor.crawlDelaySeconds
      }));
    }
    state.politenessFloorMs = floor.floorMs;
    state.politenessSource = floor.source;
    state.crawlDelaySeconds = floor.crawlDelaySeconds;
    if (state.rpm > 0 && floor.floorMs > 0) {
      const floorRpm = Math.max(1, Math.floor(60000 / floor.floorMs));
      state.rpm = Math.min(state.rpm, floorRpm);
    }
  }

  _syncFromLimiter(limiter, host, state) {
    if (!limiter || typeof limiter.getSnapshot !== 'function') {
      return;
    }
    const snapshot = limiter.getSnapshot(host);
    if (snapshot) {
      const prevStatus = state.lastHttpStatus;
      const politenessFloorMs = state.politenessFloorMs || 0;
      const politenessSource = state.politenessSource || null;
      const crawlDelaySeconds = state.crawlDelaySeconds != null ? state.crawlDelaySeconds : null;
      Object.assign(state, snapshot);
      if (state.lastHttpStatus == null && prevStatus != null) {
        state.lastHttpStatus = prevStatus;
      }
      if (state.politenessFloorMs == null) state.politenessFloorMs = politenessFloorMs;
      if (state.politenessSource == null) state.politenessSource = politenessSource;
      if (state.crawlDelaySeconds == null) state.crawlDelaySeconds = crawlDelaySeconds;
    }
    this._persist(host, state);
  }

  _persist(host, state) {
    if (!host || !state) return;
    const adapter = this.getDbAdapter();
    if (!adapter || typeof adapter.isEnabled !== 'function' || !adapter.isEnabled()) {
      return;
    }
    safeCall(() => {
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
        politenessFloorMs: state.politenessFloorMs || 0,
        politenessSource: state.politenessSource || null,
        crawlDelaySeconds: state.crawlDelaySeconds != null ? state.crawlDelaySeconds : null,
        recordedAt: new Date().toISOString()
      };
      adapter.upsertDomain(host, JSON.stringify(payload));
      return true;
    });
  }
}

module.exports = {
  DomainThrottleManager
};
