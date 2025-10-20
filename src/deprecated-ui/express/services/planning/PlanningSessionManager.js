'use strict';

const { randomUUID } = require('crypto');

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_CLEANUP_INTERVAL_MS = 30 * 1000; // 30 seconds
const DEFAULT_TERMINAL_TTL_MS = 2 * 60 * 1000; // 2 minutes
const DEFAULT_MAX_STAGE_EVENTS = 200;

class PlanningSessionError extends Error {
  constructor(message, code = 'planning-session-error', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    if (details) {
      this.details = details;
    }
    Error.captureStackTrace?.(this, this.constructor);
  }
}

class PlanningSessionConflictError extends PlanningSessionError {
  constructor(message, sessionId, details = null) {
    super(message, 'planning-session-conflict', { sessionId, ...details });
    this.sessionId = sessionId;
  }
}

class PlanningSessionNotFoundError extends PlanningSessionError {
  constructor(sessionId) {
    super(`Planning session not found: ${sessionId}`, 'planning-session-not-found', { sessionId });
    this.sessionId = sessionId;
  }
}

class PlanningSessionManager {
  constructor(options = {}) {
    this.ttlMs = this._positiveOrDefault(options.ttlMs, DEFAULT_TTL_MS);
    this.terminalTtlMs = this._positiveOrDefault(options.terminalTtlMs, DEFAULT_TERMINAL_TTL_MS);
    this.cleanupIntervalMs = this._positiveOrDefault(options.cleanupIntervalMs, DEFAULT_CLEANUP_INTERVAL_MS);
    this.maxStageEvents = this._positiveOrDefault(options.maxStageEvents, DEFAULT_MAX_STAGE_EVENTS);
    this.clock = typeof options.clock === 'function' ? options.clock : () => Date.now();
    this.idFactory = typeof options.idFactory === 'function' ? options.idFactory : () => randomUUID();
    this.logger = options.logger || console;

    this.sessions = new Map();
    this.sessionKeys = new Map();
    this.listeners = new Set();

    this._cleanupTimer = null;
  }

  /**
   * Create a new planning session.
   * @param {Object} options - Original planning request payload
   * @param {Object} extras
   * @param {string|null} extras.sessionKey - Optional unique key (e.g., domain) to prevent duplicates
   * @param {Object} extras.metadata - Additional metadata to store with session
   * @returns {Object} snapshot of the created session
   */
  createSession(options = {}, extras = {}) {
    this._purgeExpired();

    const {
      sessionKey = null,
      metadata = {},
      tags = null
    } = extras || {};

    if (sessionKey) {
      const existingId = this.sessionKeys.get(sessionKey);
      if (existingId) {
        const existingSession = this.sessions.get(existingId);
        if (existingSession && !this._isTerminal(existingSession.status)) {
          throw new PlanningSessionConflictError(
            `An active planning session already exists for key: ${sessionKey}`,
            existingId,
            { sessionKey }
          );
        }
      }
    }

    const id = this.idFactory();
    const now = this.clock();
    const expiresAt = now + this.ttlMs;

    const session = {
      id,
      status: 'planning',
      createdAt: now,
      updatedAt: now,
      expiresAt,
      options: this._clone(options),
      metadata: this._clone({ ...(metadata || {}), sessionKey: sessionKey || undefined }),
      tags: tags ? this._clone(tags) : undefined,
      stageEvents: [],
      statusHistory: [this._statusRecord('planning', now)],
      blueprint: null,
      summary: null,
      error: null,
      confirmation: null
    };

    this.sessions.set(id, session);
    if (sessionKey) {
      this.sessionKeys.set(sessionKey, id);
    }

    this._scheduleExpiry(session);
    this._ensureCleanupLoop();
    this._notifyListeners('created', session);

    return this._snapshot(session);
  }

  /**
   * Append planner stage telemetry to a session.
   */
  appendStageEvent(sessionId, event = {}) {
    const session = this._requireSession(sessionId);
    const now = this.clock();
    const entry = this._normaliseStageEvent(event, now);
    session.stageEvents.push(entry);
    if (session.stageEvents.length > this.maxStageEvents) {
      session.stageEvents.splice(0, session.stageEvents.length - this.maxStageEvents);
    }
    session.updatedAt = now;
    this._notifyListeners('stage-event', session, { event: entry });
    return entry;
  }

  completeSession(sessionId, blueprint, summary = null) {
    const session = this._requireSession(sessionId);
    this._setStatus(session, 'ready');
    session.blueprint = this._clone(blueprint);
    session.summary = summary ? this._clone(summary) : null;
    this._shortenTtl(session);
    this._notifyListeners('status', session);
    return this._snapshot(session);
  }

  failSession(sessionId, error) {
    const session = this._requireSession(sessionId);
    session.error = this._normaliseError(error);
    this._setStatus(session, 'failed');
    this._shortenTtl(session);
    this._notifyListeners('status', session);
    return this._snapshot(session);
  }

  cancelSession(sessionId, reason = 'cancelled') {
    const session = this._requireSession(sessionId);
    session.error = reason ? { message: reason } : null;
    this._setStatus(session, 'cancelled');
    this._shortenTtl(session);
    this._notifyListeners('status', session);
    return this._snapshot(session);
  }

  confirmSession(sessionId, confirmation = {}) {
    const session = this._requireSession(sessionId);
    if (session.status !== 'ready') {
      throw new PlanningSessionError(
        `Cannot confirm session ${sessionId} in status ${session.status}`,
        'planning-session-invalid-state',
        { status: session.status }
      );
    }
    session.confirmation = {
      confirmedAt: this._isoNow(),
      ...this._clone(confirmation || {})
    };
    this._setStatus(session, 'confirmed');
    this._shortenTtl(session);
    this._notifyListeners('status', session);
    return this._snapshot(session);
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    return this._snapshot(session);
  }

  getActiveSessionByKey(sessionKey) {
    if (!sessionKey) return null;
    const id = this.sessionKeys.get(sessionKey);
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session) {
      this.sessionKeys.delete(sessionKey);
      return null;
    }
    if (this._isTerminal(session.status) && this._isExpired(session)) {
      this.sessionKeys.delete(sessionKey);
      return null;
    }
    return this._snapshot(session);
  }

  listSessions() {
    this._purgeExpired();
    return Array.from(this.sessions.values()).map((session) => this._snapshot(session));
  }

  touchSession(sessionId, { extend = false } = {}) {
    const session = this._requireSession(sessionId);
    const now = this.clock();
    session.updatedAt = now;
    if (extend && !this._isTerminal(session.status)) {
      session.expiresAt = now + this.ttlMs;
      this._scheduleExpiry(session);
    }
    this._notifyListeners('touched', session);
    return this._snapshot(session);
  }

  removeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.sessions.delete(sessionId);
    const sessionKey = session.metadata?.sessionKey;
    if (sessionKey && this.sessionKeys.get(sessionKey) === sessionId) {
      this.sessionKeys.delete(sessionKey);
    }
    if (session._ttlTimer) {
      clearTimeout(session._ttlTimer);
      session._ttlTimer = null;
    }
    this._notifyListeners('removed', session);
    return true;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('PlanningSessionManager.subscribe requires a function listener');
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Force purge of expired sessions. Useful for tests.
   */
  purgeExpired() {
    this._purgeExpired(true);
  }

  _requireSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new PlanningSessionNotFoundError(sessionId);
    }
    return session;
  }

  _setStatus(session, status) {
    if (!status || session.status === status) {
      session.updatedAt = this.clock();
      return;
    }
    if (this._isTerminal(session.status) && !this._isTerminal(status)) {
      throw new PlanningSessionError(
        `Cannot transition session ${session.id} from terminal status ${session.status} to ${status}`,
        'planning-session-invalid-transition',
        { from: session.status, to: status }
      );
    }
    const now = this.clock();
    session.status = status;
    session.updatedAt = now;
    session.statusHistory.push(this._statusRecord(status, now));
    if (this._isTerminal(status)) {
      this._detachSessionKey(session);
    }
  }

  _detachSessionKey(session) {
    const sessionKey = session.metadata?.sessionKey;
    if (sessionKey && this.sessionKeys.get(sessionKey) === session.id) {
      this.sessionKeys.delete(sessionKey);
    }
  }

  _shortenTtl(session) {
    const now = this.clock();
    const ttl = Math.min(this.terminalTtlMs, this.ttlMs);
    session.expiresAt = now + ttl;
    this._scheduleExpiry(session);
  }

  _scheduleExpiry(session) {
    if (session._ttlTimer) {
      clearTimeout(session._ttlTimer);
    }
    const delay = Math.max(0, session.expiresAt - this.clock());
    session._ttlTimer = setTimeout(() => {
      this._handleExpiry(session.id);
    }, delay);
    session._ttlTimer.unref?.();
  }

  _handleExpiry(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (!this._isExpired(session)) {
      this._scheduleExpiry(session);
      return;
    }
    this.removeSession(sessionId);
    this._notifyListeners('expired', session);
  }

  _ensureCleanupLoop() {
    if (this._cleanupTimer || this.cleanupIntervalMs <= 0) {
      return;
    }
    this._cleanupTimer = setInterval(() => {
      try {
        this._purgeExpired();
      } catch (error) {
        this.logger?.warn?.('[PlanningSessionManager] cleanup failed', error);
      }
    }, this.cleanupIntervalMs);
    this._cleanupTimer.unref?.();
  }

  _purgeExpired(force = false) {
    const now = this.clock();
    for (const [id, session] of this.sessions.entries()) {
      if (force || now >= session.expiresAt) {
        this.removeSession(id);
        this._notifyListeners('expired', session);
      }
    }
    if (this.sessions.size === 0 && this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  _isExpired(session) {
    return this.clock() >= session.expiresAt;
  }

  _isTerminal(status) {
    return status === 'failed' || status === 'cancelled' || status === 'confirmed';
  }

  _normaliseStageEvent(event, now) {
    const snapshot = this._clone(event || {});
    if (!snapshot || typeof snapshot !== 'object') {
      return {
        receivedAt: this._isoFromMs(now)
      };
    }
    if (!snapshot.receivedAt) {
      snapshot.receivedAt = this._isoFromMs(now);
    }
    return snapshot;
  }

  _normaliseError(err) {
    if (!err) return null;
    if (typeof err === 'string') {
      return { message: err };
    }
    if (err instanceof Error) {
      const out = { message: err.message };
      if (err.code) out.code = err.code;
      if (err.details) out.details = this._clone(err.details);
      return out;
    }
    if (typeof err === 'object') {
      const safe = { ...err };
      if (!safe.message && err.reason) safe.message = err.reason;
      return this._clone(safe);
    }
    return { message: String(err) };
  }

  _statusRecord(status, atMs) {
    return {
      status,
      at: this._isoFromMs(atMs)
    };
  }

  _notifyListeners(type, session, payload = {}) {
    if (!this.listeners.size) return;
    const snapshot = this._snapshot(session);
    for (const listener of this.listeners) {
      try {
        listener({ type, session: snapshot, ...payload });
      } catch (error) {
        this.logger?.warn?.('[PlanningSessionManager] listener error', error);
      }
    }
  }

  _snapshot(session) {
    if (!session) return null;
    return {
      id: session.id,
      status: session.status,
      createdAt: this._isoFromMs(session.createdAt),
      updatedAt: this._isoFromMs(session.updatedAt),
      expiresAt: this._isoFromMs(session.expiresAt),
      options: this._clone(session.options),
      metadata: this._clone(session.metadata),
      tags: this._clone(session.tags),
      stageEvents: session.stageEvents.map((entry) => this._clone(entry)),
      statusHistory: session.statusHistory.map((entry) => ({ ...entry })),
      blueprint: this._clone(session.blueprint),
      summary: this._clone(session.summary),
      error: this._clone(session.error),
      confirmation: this._clone(session.confirmation)
    };
  }

  _clone(value) {
    if (value == null) return value;
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      return value.map((item) => this._clone(item));
    }
    return { ...value };
  }

  _positiveOrDefault(value, fallback) {
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return value;
  }

  _isoFromMs(ms) {
    if (!Number.isFinite(ms)) return null;
    try {
      return new Date(ms).toISOString();
    } catch (_) {
      return null;
    }
  }

  _isoNow() {
    return this._isoFromMs(this.clock());
  }
}

module.exports = {
  PlanningSessionManager,
  PlanningSessionError,
  PlanningSessionConflictError,
  PlanningSessionNotFoundError
};
