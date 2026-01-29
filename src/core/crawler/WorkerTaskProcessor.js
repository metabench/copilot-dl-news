const { URL } = require('url');

function safeHostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return null;
  }
}

async function processTaskResult({
  result,
  item,
  queue,
  getQueueSize,
  retryLimit = 3,
  backoffBaseMs = 500,
  backoffMaxMs = 5 * 60 * 1000,
  computePriority,
  nowMs = () => Date.now(),
  jitter = (ms) => ms,
  telemetry = null
} = {}) {
  if (!result || !item) return;
  if (result.status === 'failed') {
    const currentRetries = typeof item.retries === 'number' ? item.retries : 0;
    const retriable = !!result.retriable && currentRetries < retryLimit;
    if (retriable) {
      item.retries = currentRetries + 1;
      const baseDelay = result.retryAfterMs != null ? result.retryAfterMs : Math.min(backoffBaseMs * Math.pow(2, item.retries - 1), backoffMaxMs);
      item.nextEligibleAt = nowMs() + jitter(baseDelay);
      item.priority = computePriority({ type: item.type, depth: item.depth, discoveredAt: item.discoveredAt, bias: item.priorityBias || 0 });
      if (queue && typeof queue.reschedule === 'function') queue.reschedule(item);
      try {
        const host = safeHostFromUrl(item.url);
        const sizeNow = (typeof getQueueSize === 'function') ? getQueueSize() : (queue && typeof queue.size === 'function' ? queue.size() : null);
        telemetry?.queueEvent?.({ action: 'retry', url: item.url, depth: item.depth, host, reason: 'retriable-error', queueSize: sizeNow });
      } catch (_) {}
    }
  }
}

module.exports = {
  processTaskResult
};
