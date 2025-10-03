export function createSseClient({ badgeEl, offlineDelayMs = 5000 } = {}) {
  let source = null;
  let lastEventAt = 0;
  let offlineTimer = null;

  function setBadge(text, className) {
    if (!badgeEl) return;
    if (text != null) {
      badgeEl.textContent = text;
    }
    if (!className) return;
    badgeEl.classList.remove('badge-ok', 'badge-warn', 'badge-bad');
    badgeEl.classList.add(className);
  }

  function clearOfflineTimer() {
    if (!offlineTimer) return;
    clearTimeout(offlineTimer);
    offlineTimer = null;
  }

  function markLive() {
    lastEventAt = Date.now();
    setBadge('SSE: live', 'badge-ok');
    clearOfflineTimer();
  }

  function scheduleOfflineCheck(scheduledAt) {
    clearOfflineTimer();
    offlineTimer = setTimeout(() => {
      if (lastEventAt > scheduledAt) {
        offlineTimer = null;
        return;
      }
      setBadge('SSE: offline', 'badge-bad');
      offlineTimer = null;
    }, offlineDelayMs);
  }

  function attachListeners(evt, listeners = {}) {
    Object.entries(listeners).forEach(([type, handler]) => {
      if (!handler) return;
      if (Array.isArray(handler)) {
        handler.forEach((fn) => {
          if (typeof fn === 'function') {
            evt.addEventListener(type, fn);
          }
        });
      } else if (typeof handler === 'function') {
        evt.addEventListener(type, handler);
      }
    });
  }

  function open({ url, listeners = {} } = {}) {
    if (!url) {
      throw new Error('createSseClient.open requires a URL');
    }
    close();
    source = new EventSource(url);
    try {
      window.evt = source;
      window.__sse_open = false;
    } catch (_) {}

    source.onopen = () => {
      try {
        window.__sse_open = true;
      } catch (_) {}
      markLive();
    };

    source.onerror = () => {
      try {
        window.__sse_open = false;
      } catch (_) {}
      setBadge('SSE: reconnecting…', 'badge-warn');
      scheduleOfflineCheck(Date.now());
    };

    attachListeners(source, listeners);
    return source;
  }

  function close() {
    if (source) {
      try {
        source.close();
      } catch (_) {}
    }
    source = null;
    clearOfflineTimer();
    try {
      window.__sse_open = false;
    } catch (_) {}
  }

  return {
    open,
    close,
    markLive,
    getLastEventAt: () => lastEventAt
  };
}
