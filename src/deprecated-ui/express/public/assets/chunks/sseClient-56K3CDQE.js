import {
  require_lang
} from "./chunk-BOXXWBMA.js";
import {
  __toESM
} from "./chunk-QU4DACYI.js";

// src/ui/public/index/sseClient.js
var import_lang_tools = __toESM(require_lang());
function createSseClient({ badgeEl, offlineDelayMs = 5e3 } = {}) {
  let source = null;
  let lastEventAt = 0;
  let offlineTimer = null;
  function setBadge(text, className) {
    if (!badgeEl) return;
    if (text != null) {
      badgeEl.textContent = text;
    }
    if (!className) return;
    badgeEl.classList.remove("badge-ok", "badge-warn", "badge-bad");
    badgeEl.classList.add(className);
  }
  function clearOfflineTimer() {
    if (!offlineTimer) return;
    clearTimeout(offlineTimer);
    offlineTimer = null;
  }
  function markLive() {
    lastEventAt = Date.now();
    setBadge("SSE: live", "badge-ok");
    clearOfflineTimer();
  }
  function scheduleOfflineCheck(scheduledAt) {
    clearOfflineTimer();
    offlineTimer = setTimeout(() => {
      if (lastEventAt > scheduledAt) {
        offlineTimer = null;
        return;
      }
      setBadge("SSE: offline", "badge-bad");
      offlineTimer = null;
    }, offlineDelayMs);
  }
  function attachListeners(evt, listeners = {}) {
    (0, import_lang_tools.each)(listeners, (handler, type) => {
      if (!handler) return;
      if ((0, import_lang_tools.is_array)(handler)) {
        (0, import_lang_tools.each)(handler, (fn) => {
          if ((0, import_lang_tools.tof)(fn) === "function") {
            evt.addEventListener(type, fn);
          }
        });
      } else if ((0, import_lang_tools.tof)(handler) === "function") {
        evt.addEventListener(type, handler);
      }
    });
  }
  function open({ url, listeners = {} } = {}) {
    if (!url) {
      throw new Error("createSseClient.open requires a URL");
    }
    close();
    source = new EventSource(url);
    try {
      window.evt = source;
      window.__sse_open = false;
    } catch (_) {
    }
    source.onopen = () => {
      try {
        window.__sse_open = true;
      } catch (_) {
      }
      markLive();
    };
    source.onerror = () => {
      try {
        window.__sse_open = false;
      } catch (_) {
      }
      setBadge("SSE: reconnecting\u2026", "badge-warn");
      scheduleOfflineCheck(Date.now());
    };
    attachListeners(source, listeners);
    return source;
  }
  function close() {
    if (source) {
      try {
        source.close();
      } catch (_) {
      }
    }
    source = null;
    clearOfflineTimer();
    try {
      window.__sse_open = false;
    } catch (_) {
    }
  }
  return {
    open,
    close,
    markLive,
    getLastEventAt: () => lastEventAt
  };
}
export {
  createSseClient
};
