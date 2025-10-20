// SSE broadcaster with log truncation and simple per-second rate limiting for 'log' events.

function createBroadcaster(sseClients, opts = {}) {
  // Options with env fallbacks
  const LOGS_MAX_PER_SEC = Number.isFinite(opts.logsMaxPerSec)
    ? Math.max(1, opts.logsMaxPerSec)
    : Math.max(50, parseInt(process.env.UI_LOGS_MAX_PER_SEC || '200', 10) || 200);
  const LOG_LINE_MAX_CHARS = Number.isFinite(opts.logLineMaxChars)
    ? Math.max(128, opts.logLineMaxChars)
    : Math.max(512, parseInt(process.env.UI_LOG_LINE_MAX_CHARS || '8192', 10) || 8192);

  let logRate = { windowStart: 0, count: 0, dropped: 0 };

  function writeToClients(ev, obj) {
    const payload = `event: ${ev}\ndata: ${JSON.stringify(obj)}\n\n`;
    for (const client of sseClients) {
      if (ev === 'log' && client.logsEnabled === false) continue;
      // If a job filter is set, only deliver events that match
      if (client.jobFilter && obj && typeof obj === 'object' && obj.jobId && obj.jobId !== client.jobFilter) continue;
      try {
        client.res.write(payload);
        client.res.flush?.();
      } catch (_) { /* ignore broken pipe */ }
    }
  }

  function broadcast(event, data, forcedJobId = null) {
    // Attach jobId tag when provided
    try {
      const jid = forcedJobId || (data && typeof data === 'object' && data.jobId) || null;
      if (jid && data && typeof data === 'object' && data !== null && !Object.prototype.hasOwnProperty.call(data, 'jobId')) {
        data = { ...data, jobId: String(jid) };
      }
    } catch (_) { /* ignore enrich errors */ }

    if (event === 'log') {
      // Truncate overly long log lines
      try {
        if (data && typeof data.line === 'string' && data.line.length > LOG_LINE_MAX_CHARS) {
          const over = data.line.length - LOG_LINE_MAX_CHARS;
          data = { ...data, line: data.line.slice(0, LOG_LINE_MAX_CHARS) + `… [truncated ${over} chars]\n` };
        }
      } catch (_) {}
      const now = Date.now();
      // New window: emit drop notice if needed, then reset
      if (now - logRate.windowStart >= 1000) {
        if (logRate.dropped > 0) {
          writeToClients('log', { stream: 'server', line: `[server] log rate limit: dropped ${logRate.dropped} lines in last second\n` });
        }
        logRate = { windowStart: now, count: 0, dropped: 0 };
      }
      if (logRate.count >= LOGS_MAX_PER_SEC) {
        logRate.dropped++;
        // Emit an immediate one-time notice the first time we drop in this window
        if (logRate.dropped === 1) {
          writeToClients('log', { stream: 'server', line: `[server] log rate limit: dropping logs (max ${LOGS_MAX_PER_SEC}/s)\n` });
        }
        return; // drop this log event
      }
      logRate.count++;
      return writeToClients(event, data);
    }

    // Default path for non-log events
    writeToClients(event, data);
  }

  return { broadcast };
}

module.exports = { createBroadcaster };
