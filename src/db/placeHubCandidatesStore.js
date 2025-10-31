'use strict';

const DEFAULT_LIMIT = 50;

function normalizeDomain(input) {
  if (!input) return null;
  return String(input).trim().toLowerCase();
}

function normalizeUrl(input) {
  if (!input) return null;
  try {
    const url = new URL(input);
    return url.href;
  } catch (_) {
    return String(input).trim();
  }
}

function serializeSignals(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function createPlaceHubCandidatesStore(db) {
  if (!db) {
    throw new Error('createPlaceHubCandidatesStore requires a database connection');
  }

  const insertCandidateStmt = db.prepare(`
    INSERT INTO place_hub_candidates (
      domain,
      candidate_url,
      normalized_url,
      place_kind,
      place_name,
      place_code,
      place_id,
      analyzer,
      strategy,
      score,
      confidence,
      pattern,
      signals_json,
      attempt_id,
      attempt_started_at,
      status,
      validation_status,
      source,
      last_seen_at,
      created_at,
      updated_at
    ) VALUES (
      @domain,
      @candidate_url,
      @normalized_url,
      @place_kind,
      @place_name,
      @place_code,
      @place_id,
      @analyzer,
      @strategy,
      @score,
      @confidence,
      @pattern,
      @signals_json,
      @attempt_id,
      @attempt_started_at,
      @status,
      @validation_status,
      @source,
      @last_seen_at,
      @created_at,
      @updated_at
    )
    ON CONFLICT(domain, candidate_url)
    DO UPDATE SET
      normalized_url = excluded.normalized_url,
      place_kind = COALESCE(excluded.place_kind, place_hub_candidates.place_kind),
      place_name = COALESCE(excluded.place_name, place_hub_candidates.place_name),
      place_code = COALESCE(excluded.place_code, place_hub_candidates.place_code),
      place_id = COALESCE(excluded.place_id, place_hub_candidates.place_id),
      analyzer = COALESCE(excluded.analyzer, place_hub_candidates.analyzer),
      strategy = COALESCE(excluded.strategy, place_hub_candidates.strategy),
      score = COALESCE(excluded.score, place_hub_candidates.score),
      confidence = COALESCE(excluded.confidence, place_hub_candidates.confidence),
      pattern = COALESCE(excluded.pattern, place_hub_candidates.pattern),
      signals_json = COALESCE(excluded.signals_json, place_hub_candidates.signals_json),
      attempt_id = COALESCE(excluded.attempt_id, place_hub_candidates.attempt_id),
      attempt_started_at = COALESCE(excluded.attempt_started_at, place_hub_candidates.attempt_started_at),
      status = COALESCE(excluded.status, place_hub_candidates.status),
      validation_status = COALESCE(excluded.validation_status, place_hub_candidates.validation_status),
      source = COALESCE(excluded.source, place_hub_candidates.source),
      last_seen_at = COALESCE(excluded.last_seen_at, place_hub_candidates.last_seen_at),
      updated_at = excluded.updated_at
  `);

  const listRecentStmt = db.prepare(`
    SELECT *
      FROM place_hub_candidates
     WHERE domain = ?
     ORDER BY updated_at DESC, id DESC
     LIMIT ?
  `);

  const markStatusStmt = db.prepare(`
    UPDATE place_hub_candidates
       SET status = COALESCE(@status, status),
           validation_status = COALESCE(@validation_status, validation_status),
           last_seen_at = COALESCE(@last_seen_at, last_seen_at),
           updated_at = @updated_at
     WHERE domain = @domain
       AND candidate_url = @candidate_url
  `);

  const findCandidateStmt = db.prepare(`
    SELECT *
      FROM place_hub_candidates
     WHERE domain = ?
       AND candidate_url = ?
     LIMIT 1
  `);

  // Task 4.4: Add validation metrics persistence
  const updateValidationMetricsStmt = db.prepare(`
    UPDATE place_hub_candidates
       SET validation_status = COALESCE(@validation_status, validation_status),
           signals_json = COALESCE(@signals_json, signals_json),
           updated_at = @updated_at
     WHERE domain = @domain
       AND candidate_url = @candidate_url
  `);

  return {
    saveCandidate(candidate) {
      const domain = normalizeDomain(candidate?.domain);
      const candidateUrl = normalizeUrl(candidate?.candidateUrl || candidate?.candidate_url);
      if (!domain || !candidateUrl) {
        return null;
      }

      const normalizedUrl = normalizeUrl(candidate?.normalizedUrl || candidateUrl);
      const now = nowIso();

      insertCandidateStmt.run({
        domain,
        candidate_url: candidateUrl,
        normalized_url: normalizedUrl,
        place_kind: candidate?.placeKind || candidate?.place_kind || null,
        place_name: candidate?.placeName || candidate?.place_name || null,
        place_code: candidate?.placeCode || candidate?.place_code || null,
        place_id: candidate?.placeId || candidate?.place_id || null,
        analyzer: candidate?.analyzer || null,
        strategy: candidate?.strategy || null,
        score: Number.isFinite(candidate?.score) ? candidate.score : null,
        confidence: Number.isFinite(candidate?.confidence) ? candidate.confidence : null,
        pattern: candidate?.pattern || null,
        signals_json: serializeSignals(candidate?.signals),
        attempt_id: candidate?.attemptId || candidate?.attempt_id || null,
        attempt_started_at: candidate?.attemptStartedAt || candidate?.attempt_started_at || now,
        status: candidate?.status || 'pending',
        validation_status: candidate?.validationStatus || candidate?.validation_status || null,
        source: candidate?.source || 'guess-place-hubs',
        last_seen_at: candidate?.lastSeenAt || candidate?.last_seen_at || now,
        created_at: now,
        updated_at: now
      });

      return findCandidateStmt.get(domain, candidateUrl) || null;
    },

    listRecent(domain, { limit = DEFAULT_LIMIT } = {}) {
      const normalized = normalizeDomain(domain);
      if (!normalized) return [];
      const safeLimit = Math.max(1, Math.min(500, Number(limit) || DEFAULT_LIMIT));
      return listRecentStmt.all(normalized, safeLimit);
    },

    markStatus({ domain, candidateUrl, status = null, validationStatus = null, lastSeenAt = null }) {
      const normalizedDomain = normalizeDomain(domain);
      const normalizedUrl = normalizeUrl(candidateUrl);
      if (!normalizedDomain || !normalizedUrl) return 0;
      const now = nowIso();
      const info = markStatusStmt.run({
        domain: normalizedDomain,
        candidate_url: normalizedUrl,
        status,
        validation_status: validationStatus,
        last_seen_at: lastSeenAt || now,
        updated_at: now
      });
      return info?.changes || 0;
    },

    getCandidate(domain, candidateUrl) {
      const normalizedDomain = normalizeDomain(domain);
      const normalizedUrl = normalizeUrl(candidateUrl);
      if (!normalizedDomain || !normalizedUrl) return null;
      return findCandidateStmt.get(normalizedDomain, normalizedUrl) || null;
    },

    // Task 4.4: Update validation metrics and evidence
    updateValidationMetrics({ domain, candidateUrl, validationStatus = null, signals = null }) {
      const normalizedDomain = normalizeDomain(domain);
      const normalizedUrl = normalizeUrl(candidateUrl);
      if (!normalizedDomain || !normalizedUrl) return 0;
      const now = nowIso();
      const info = updateValidationMetricsStmt.run({
        domain: normalizedDomain,
        candidate_url: normalizedUrl,
        validation_status: validationStatus,
        signals_json: serializeSignals(signals),
        updated_at: now
      });
      return info?.changes || 0;
    }
  };
}

module.exports = {
  createPlaceHubCandidatesStore
};
