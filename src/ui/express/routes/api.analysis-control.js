const express = require('express');
const { EventEmitter } = require('events');
const { fp } = require('lang-tools');

/**
 * Polymorphic truthy flag detection.
 * Uses functional polymorphism (fp) from lang-tools for signature-based dispatch.
 * 
 * Signature handlers:
 * - '[b]': Boolean value returns as-is
 * - '[s]': String checked against truthy literals ('1', 'true', 'yes', 'on')
 */
const isTruthyFlag = fp((a, sig) => {
  // Boolean - return as-is
  if (sig === '[b]') {
    return a[0];
  }
  
  // String - check against truthy literals
  if (sig === '[s]') {
    const v = a[0].trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(v);
  }
  
  // Default: false
  return false;
});

function safeCloneProgress(value) {
  if (!value || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    if (Array.isArray(value)) return value.slice();
    return { ...value };
  }
}

function updateProgressState(state, runId, payload, { final = false } = {}) {
  if (!state || typeof state !== 'object') return payload;
  const enriched = payload && typeof payload === 'object' ? { ...payload } : {};
  if (!enriched.runId) enriched.runId = runId;
  if (!enriched.ts) {
    enriched.ts = new Date().toISOString();
  }
  if (final) {
    if (!enriched.endedAt) {
      enriched.endedAt = new Date().toISOString();
    }
    enriched.final = true;
  }
  state.lastRunId = runId;
  state.lastPayload = safeCloneProgress(enriched);
  const limitRaw = Number.isFinite(state.historyLimit) ? state.historyLimit : 20;
  const limit = Math.max(1, limitRaw);
  if (!Array.isArray(state.history)) state.history = [];
  const stored = safeCloneProgress(enriched);
  if (final) stored.final = true;
  state.history.push(stored);
  if (state.history.length > limit) {
    state.history.splice(0, state.history.length - limit);
  }
  return enriched;
}

function createAnalysisControlRouter({
  analysisRunner,
  analysisRuns,
  urlsDbPath,
  generateRunId,
  broadcast,
  analysisProgress,
  QUIET = false
} = {}) {
  if (!analysisRunner || typeof analysisRunner.start !== 'function') {
    throw new Error('createAnalysisControlRouter requires analysisRunner.start');
  }
  if (!analysisRuns || typeof analysisRuns.set !== 'function') {
    throw new Error('createAnalysisControlRouter requires analysisRuns Map');
  }
  if (typeof urlsDbPath !== 'string' || !urlsDbPath) {
    throw new Error('createAnalysisControlRouter requires urlsDbPath');
  }
  if (typeof broadcast !== 'function') {
    throw new Error('createAnalysisControlRouter requires broadcast function');
  }
  const runIdFactory = typeof generateRunId === 'function' ? generateRunId : (() => `analysis-${Date.now()}`);
  const router = express.Router();
  const progressState = analysisProgress && typeof analysisProgress === 'object' ? analysisProgress : null;

  router.post('/api/analysis/start', (req, res) => {
    const body = req.body || {};
    const runId = runIdFactory(body.runId);
    const args = [];
    if (!args.some((a) => a.startsWith('--db='))) {
      args.push(`--db=${urlsDbPath}`);
    }
    args.push(`--run-id=${runId}`);
    if (body.analysisVersion != null && body.analysisVersion !== '') {
      const v = Number(body.analysisVersion);
      if (Number.isFinite(v)) args.push(`--analysis-version=${v}`);
    }
    if (body.pageLimit != null && body.pageLimit !== '') {
      const v = Number(body.pageLimit);
      if (Number.isFinite(v)) args.push(`--limit=${v}`);
    }
    if (body.domainLimit != null && body.domainLimit !== '') {
      const v = Number(body.domainLimit);
      if (Number.isFinite(v)) args.push(`--domain-limit=${v}`);
    }
    if (isTruthyFlag(body.skipPages)) args.push('--skip-pages');
    if (isTruthyFlag(body.skipDomains)) args.push('--skip-domains');
    if (isTruthyFlag(body.dryRun)) args.push('--dry-run');
    if (isTruthyFlag(body.verbose)) args.push('--verbose');

    try {
      const child = analysisRunner.start(args);
      if (!child || typeof child.on !== 'function') {
        throw new Error('analysis runner did not return a child process');
      }
      if (!child.stdout) child.stdout = new EventEmitter();
      if (!child.stderr) child.stderr = new EventEmitter();
      const startedAt = new Date().toISOString();
      const entry = {
        child,
        runId,
        startedAt,
        stdoutBuf: '',
        stderrBuf: '',
        lastProgress: null,
        status: 'running'
      };
      analysisRuns.set(runId, entry);
      if (progressState) {
        progressState.runs = progressState.runs && typeof progressState.runs.set === 'function' ? progressState.runs : analysisRuns;
        progressState.runs.set(runId, entry);
      }

      const safeBroadcast = (event, data) => {
        try {
          broadcast(event, data);
        } catch (_) {}
      };

      const recordProgress = (payload, { final = false } = {}) => {
        const enriched = updateProgressState(progressState, runId, payload, { final });
        entry.lastProgress = enriched;
        if (enriched && !enriched.startedAt) {
          enriched.startedAt = startedAt;
        }
        if (progressState) {
          progressState.lastPayload = safeCloneProgress(enriched);
        }
        if (enriched) {
          safeBroadcast('analysis-progress', enriched);
        }
      };

      const emitLog = (stream, line) => {
        if (!line) return;
        const payload = {
          stream,
          line: line.endsWith('\n') ? line : `${line}\n`,
          runId
        };
        safeBroadcast('log', payload);
      };

      const handleStdoutLine = (line) => {
        if (!line) return;
        const trimmed = line.trim();
        if (trimmed.startsWith('ANALYSIS_PROGRESS ')) {
          const raw = trimmed.slice('ANALYSIS_PROGRESS '.length);
          try {
            const payload = JSON.parse(raw);
            recordProgress(payload, { final: false });
            return;
          } catch (err) {
            if (!QUIET) {
              try {
                console.warn('[analysis] failed to parse progress payload', err?.message || err);
              } catch (_) {}
            }
            emitLog('analysis', line);
            return;
          }
        }
        emitLog('analysis', line);
      };

      const handleStderrLine = (line) => {
        if (!line) return;
        emitLog('analysis-stderr', line);
      };

      const flushBuffer = (buf, handler) => {
        if (!buf) return;
        handler(buf);
      };

      child.stdout.on('data', (chunk) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        entry.stdoutBuf += text;
        let idx;
        while ((idx = entry.stdoutBuf.indexOf('\n')) !== -1) {
          const line = entry.stdoutBuf.slice(0, idx);
          entry.stdoutBuf = entry.stdoutBuf.slice(idx + 1);
          handleStdoutLine(line);
        }
      });

      child.stderr.on('data', (chunk) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        entry.stderrBuf += text;
        let idx;
        while ((idx = entry.stderrBuf.indexOf('\n')) !== -1) {
          const line = entry.stderrBuf.slice(0, idx);
          entry.stderrBuf = entry.stderrBuf.slice(idx + 1);
          handleStderrLine(line);
        }
      });

      let cleaned = false;
      const finalize = (type, info = {}) => {
        if (cleaned) return;
        cleaned = true;
        try { flushBuffer(entry.stdoutBuf, handleStdoutLine); } catch (_) {}
        try { flushBuffer(entry.stderrBuf, handleStderrLine); } catch (_) {}
        entry.stdoutBuf = '';
        entry.stderrBuf = '';
        analysisRuns.delete(runId);
        if (progressState && progressState.runs && progressState.runs.delete) {
          try { progressState.runs.delete(runId); } catch (_) {}
        }
        const exitPayload = {
          ...(entry.lastProgress || {}),
          runId,
          status: entry.lastProgress?.status || (type === 'error' ? 'failed' : info.code === 0 ? 'completed' : 'failed'),
          stage: entry.lastProgress?.stage || (type === 'error' ? 'errored' : 'completed'),
          endedAt: new Date().toISOString(),
          exit: {
            type,
            code: info.code != null ? info.code : null,
            signal: info.signal != null ? info.signal : null,
            error: info.error ? (info.error.message || String(info.error)) : null
          }
        };
        recordProgress(exitPayload, { final: true });
      };

      child.on('exit', (code, signal) => finalize('exit', { code, signal }));
      child.on('close', (code, signal) => finalize('close', { code, signal }));
      child.on('error', (error) => finalize('error', { error }));

      res.status(202).json({
        runId,
        detailUrl: `/analysis/${runId}/ssr`,
        apiUrl: `/api/analysis/${runId}`
      });
    } catch (err) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  return router;
}

module.exports = {
  createAnalysisControlRouter
};
