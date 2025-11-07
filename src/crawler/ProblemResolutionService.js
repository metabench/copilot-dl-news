'use strict';

const { slugify } = require('../tools/placeHubDetector');
const { recordPlaceHubSeed, resolveHandle } = require('./data/placeHubs');

function uniqueByKey(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function defaultGetScheme(host) {
  if (!host) return 'https';
  if (host.startsWith('localhost') || host.endsWith('.local')) return 'http';
  return 'https';
}

function buildTopicCandidates({ hubCandidate, urlPlaceAnalysis }) {
  const candidates = [];
  if (hubCandidate?.topic?.slug) {
    candidates.push({
      slug: slugify(hubCandidate.topic.slug),
      label: hubCandidate.topic.label || hubCandidate.topic.slug,
      source: hubCandidate.topic.source || 'hub-candidate'
    });
  }

  const topics = urlPlaceAnalysis?.topics || null;
  if (topics) {
    const all = [topics.recognized, topics.leading, topics.trailing, topics.all];
    for (const bucket of all) {
      if (!Array.isArray(bucket)) continue;
      for (const entry of bucket) {
        const slug = slugify(entry);
        if (!slug) continue;
        candidates.push({ slug, label: entry, source: 'url-analysis' });
      }
    }
  }

  return uniqueByKey(
    candidates.filter((cand) => cand.slug && cand.slug.length > 1),
    (cand) => cand.slug
  );
}

function buildPlaceChain(urlPlaceAnalysis) {
  if (!urlPlaceAnalysis) return [];
  const chain = [];
  const source = urlPlaceAnalysis.bestChain?.places?.length
    ? urlPlaceAnalysis.bestChain.places
    : urlPlaceAnalysis.matches || [];
  for (const match of source) {
    const place = match?.place || match;
    if (!place) continue;
    const slug = place.canonicalSlug || slugify(place.name || place.slug || '');
    if (!slug) continue;
    chain.push({
      slug,
      kind: place.kind || null,
      placeId: place.place_id || place.id || null,
      countryCode: place.country_code || place.countryCode || null
    });
  }
  if (!chain.length && urlPlaceAnalysis?.bestChain?.places?.length) {
    // fallback if matches lacked place slug
    for (const match of urlPlaceAnalysis.bestChain.places) {
      const slug = slugify(match.segment || match.normalizedToken || '');
      if (!slug) continue;
      chain.push({ slug, kind: match.place?.kind || null, placeId: match.place?.place_id || null });
    }
  }
  return uniqueByKey(chain, (entry) => `${entry.slug}:${entry.placeId ?? ''}`);
}

function computeConfidence({ chain, topics, hubCandidate }) {
  let confidence = 0.4;
  if (chain.length >= 2) confidence += 0.2;
  else if (chain.length === 1) confidence += 0.1;
  if (topics.length) confidence += 0.1;
  if (hubCandidate?.navLinksCount >= 10) confidence += 0.1;
  if (hubCandidate?.articleLinksCount >= 4) confidence += 0.05;
  confidence = Math.min(0.95, Math.max(0.2, confidence));
  return Number(confidence.toFixed(2));
}

function buildCandidateUrls({ host, scheme, chain, topics, sourceUrl }) {
  const root = `${scheme}://${host.replace(/\/$/, '')}`;
  const outputs = [];
  const leaf = chain[chain.length - 1] || null;
  const chainSlugs = chain.map((entry) => entry.slug).filter(Boolean);

  const push = (pathSegments, meta = {}) => {
    const filtered = pathSegments.filter(Boolean);
    if (!filtered.length) return;
    const path = `/${filtered.join('/')}/`;
    outputs.push({
      url: root + path,
      segments: filtered.slice(),
      ...meta
    });
  };

  if (chainSlugs.length) {
    push(chainSlugs, { variant: 'place-chain' });
  }

  if (leaf && topics.length) {
    for (const topic of topics) {
      if (topic.slug === leaf.slug) continue;
      push([topic.slug, leaf.slug], { variant: 'topic+place', topicSlug: topic.slug });
    }
  }

  if (topics.length && !chainSlugs.length) {
    for (const topic of topics) {
      push([topic.slug], { variant: 'topic-only', topicSlug: topic.slug });
    }
  }

  if (chainSlugs.length >= 2) {
    push(chainSlugs.slice(-2), { variant: 'place-tail' });
  }

  if (sourceUrl) {
    try {
      const { pathname } = new URL(sourceUrl);
      const segments = toArray(pathname.split('/').filter(Boolean));
      if (segments.length >= 2) {
        push(segments.slice(0, 2), { variant: 'source-prefix' });
      }
    } catch (_) {
      // ignore bad URLs
    }
  }

  return uniqueByKey(outputs, (entry) => entry.url);
}

function parseEvidence(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }
  if (typeof raw === 'object') {
    return raw;
  }
  return null;
}

function normalizeHost(host) {
  if (!host && host !== 0) return null;
  const value = String(host).trim().toLowerCase();
  if (!value) return null;
  const withoutScheme = value.replace(/^https?:\/\//, '');
  return withoutScheme.replace(/\/.*$/, '');
}

class ProblemResolutionService {
  constructor({
    db = null,
    taskWriter = null,
    recordSeed = null,
    getScheme = defaultGetScheme,
    logger = console,
    onResolved = null
  } = {}) {
    this.db = db;
    this.logger = logger || console;
    this.taskWriter = typeof taskWriter === 'function' ? taskWriter : this._defaultTaskWriter.bind(this);
    this.recordSeed = typeof recordSeed === 'function' ? recordSeed : ((handle, payload) => {
      try { return recordPlaceHubSeed(handle, payload); } catch (_) { return false; }
    });
    this.getScheme = typeof getScheme === 'function' ? getScheme : defaultGetScheme;
    this._seenCandidates = new Set();
    this._resolvedCache = new Map();
    this._dbHandle = null;
    this.onResolved = typeof onResolved === 'function' ? onResolved : null;
  }

  buildResolutionCandidates({ host, sourceUrl, urlPlaceAnalysis = null, hubCandidate = null }) {
    if (!host) return [];
    const chain = buildPlaceChain(urlPlaceAnalysis);
    const topics = buildTopicCandidates({ hubCandidate, urlPlaceAnalysis });
    const scheme = this.getScheme(host);
    const candidateUrls = buildCandidateUrls({ host, scheme, chain, topics, sourceUrl });
    const confidence = computeConfidence({ chain, topics, hubCandidate });

    return candidateUrls.map((entry, index) => ({
      ...entry,
      host,
      scheme,
      confidence: Math.max(0.2, Math.min(0.95, confidence - index * 0.05)),
      placeChain: chain,
      topics,
      source: 'problem-resolution'
    }));
  }

  resolveMissingHub({
    jobId = null,
    host,
    sourceUrl,
    urlPlaceAnalysis = null,
    hubCandidate = null,
    emitTask = null
  } = {}) {
    if (!host) {
      throw new Error('resolveMissingHub requires a host');
    }
    const normalizedHost = normalizeHost(host) || host;
    const candidates = this.buildResolutionCandidates({ host, sourceUrl, urlPlaceAnalysis, hubCandidate });
    const created = [];
    const errors = [];

    for (const candidate of candidates) {
      const key = candidate.url;
      if (this._seenCandidates.has(key)) {
        continue;
      }
      this._seenCandidates.add(key);

      try {
        if (this.db) {
          try {
            this.recordSeed(this.db, { host: normalizedHost, url: candidate.url, evidence: {
              confidence: candidate.confidence,
              placeChain: candidate.placeChain,
              topics: candidate.topics,
              variant: candidate.variant
            } });
          } catch (seedError) {
            this._log('warn', 'ProblemResolutionService failed to record place hub seed', seedError);
          }
        }

        const writer = typeof emitTask === 'function' ? emitTask : this.taskWriter;
        const task = writer ? writer({
          jobId,
          host,
          url: candidate.url,
          kind: 'hub-resolution',
          payload: {
            confidence: candidate.confidence,
            placeChain: candidate.placeChain,
            topics: candidate.topics,
            variant: candidate.variant,
            sourceUrl
          }
        }) : null;

        created.push({ candidate, task });
        this._rememberResolutionCandidate(normalizedHost, candidate);
        this._notifyResolved({
          jobId,
          host,
          normalizedHost,
          url: candidate.url,
          candidate,
          sourceUrl
        });
      } catch (error) {
        errors.push({ candidate, error });
        this._log('warn', 'ProblemResolutionService failed to resolve candidate', error);
      }
    }

    return {
      created,
      errors,
      attempted: candidates.length
    };
  }

  _defaultTaskWriter(task) {
    if (!this.db || !this.db.createTask) return null;
    try {
      return this.db.createTask({
        jobId: task.jobId,
        url: task.url,
        host: task.host,
        kind: task.kind,
        status: 'pending',
        payload: task.payload
      });
    } catch (error) {
      this._log('warn', 'ProblemResolutionService failed to create task via db', error);
      return null;
    }
  }

  _log(level, message, details) {
    if (!this.logger || typeof this.logger[level] !== 'function') return;
    try {
      this.logger[level](message, details);
    } catch (_) {
      // ignore logging errors
    }
  }

  _rememberResolutionCandidate(host, candidate) {
    if (!host || !candidate?.url) {
      return;
    }
    const key = host;
    if (!this._resolvedCache.has(key)) {
      this._resolvedCache.set(key, new Map());
    }
    const cache = this._resolvedCache.get(key);
    cache.set(candidate.url.toLowerCase(), {
      url: candidate.url,
      candidate,
      recordedAt: Date.now()
    });
  }

  _notifyResolved(payload) {
    if (!this.onResolved) {
      return;
    }
    try {
      this.onResolved(payload);
    } catch (error) {
      this._log('warn', 'ProblemResolutionService resolution observer failed', error);
    }
  }

  _getDbHandle() {
    if (!this.db) {
      return null;
    }
    if (this._dbHandle) {
      return this._dbHandle;
    }
    try {
      this._dbHandle = resolveHandle(this.db);
    } catch (_) {
      this._dbHandle = null;
    }
    return this._dbHandle;
  }

  setResolutionObserver(handler) {
    this.onResolved = typeof handler === 'function' ? handler : null;
  }

  getKnownHubSeeds({ host, limit = 50, minConfidence = 0 } = {}) {
    const normalizedHost = normalizeHost(host);
    if (!normalizedHost) {
      return [];
    }

    const handle = this._getDbHandle();
    let stmt = null;
    if (handle) {
      const fallbackSql = `
          SELECT host, url, evidence, last_seen_at AS lastSeenAt
            FROM place_hubs
           WHERE LOWER(host) = ?
           ORDER BY last_seen_at DESC
           LIMIT ?
        `;
      try {
        stmt = handle.prepare(`
          SELECT host, url, evidence, last_seen_at AS lastSeenAt
            FROM place_hubs_with_urls
           WHERE LOWER(host) = ?
           ORDER BY last_seen_at DESC
           LIMIT ?
        `);
      } catch (viewError) {
        this._log('debug', 'ProblemResolutionService falling back to place_hubs for known hub query', viewError?.message || viewError);
        try {
          stmt = handle.prepare(fallbackSql);
        } catch (tableError) {
          this._log('warn', 'ProblemResolutionService failed to prepare known hub query', tableError?.message || tableError);
          stmt = null;
        }
      }
    }

    const entries = new Map();
    const pushEntry = (url, payload) => {
      if (!url) return;
      const key = url.toLowerCase();
      if (entries.has(key)) return;
      const confidence = typeof payload?.confidence === 'number' ? payload.confidence : null;
      if (minConfidence && confidence != null && confidence < minConfidence) {
        return;
      }
      entries.set(key, {
        url,
        confidence,
        evidence: payload || null,
        lastSeenAt: payload?.lastSeenAt || null
      });
    };

    if (stmt) {
      const variants = new Set([normalizedHost]);
      if (!normalizedHost.startsWith('www.')) {
        variants.add(`www.${normalizedHost}`);
      }
      const rawHost = typeof host === 'string' ? host.trim().toLowerCase() : null;
      if (rawHost && rawHost !== normalizedHost) {
        variants.add(rawHost);
      }

      for (const candidateHost of variants) {
        try {
          const rows = stmt.all(candidateHost, Math.max(limit, 50));
          for (const row of rows) {
            const payload = parseEvidence(row?.evidence) || {};
            payload.lastSeenAt = row?.lastSeenAt || null;
            pushEntry(row?.url, payload);
            if (entries.size >= limit) {
              break;
            }
          }
        } catch (error) {
          this._log('warn', 'ProblemResolutionService failed to load known hub seeds', error?.message || error);
        }
        if (entries.size >= limit) {
          break;
        }
      }
    }

    const cache = this._resolvedCache.get(normalizedHost);
    if (cache) {
      for (const entry of cache.values()) {
        pushEntry(entry.url, entry.candidate);
        if (entries.size >= limit) {
          break;
        }
      }
    }

    return Array.from(entries.values()).slice(0, limit);
  }

}

module.exports = {
  ProblemResolutionService,
  buildPlaceChain,
  buildTopicCandidates
};
