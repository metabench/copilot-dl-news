/* eslint-disable */
(function (root, factory) {
  'use strict';
  const api = factory(root);

  try {
    root.createRemoteObservableClient = api.createRemoteObservableClient;
  } catch (_) {}

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
  'use strict';

  const shared = (root && root.RemoteObservableShared) ? root.RemoteObservableShared : null;

  function createRemoteObservableClient({ url, EventSourceImpl, fetchImpl } = {}) {
    if (!url || typeof url !== 'string') {
      throw new Error('createRemoteObservableClient requires url');
    }

    const createMiniObservable = shared && shared.createMiniObservable;
    const safeParseJson = shared && shared.safeParseJson;
    const normalizeEventMessage = shared && shared.normalizeEventMessage;

    if (typeof createMiniObservable !== 'function') {
      throw new Error('RemoteObservableShared missing (RemoteObservableClient requires RemoteObservableShared loaded first)');
    }

    const obs = createMiniObservable();
    const ES = EventSourceImpl || (typeof EventSource === 'function' ? EventSource : null);
    const fetchFn = fetchImpl || (typeof fetch === 'function' ? fetch : null);

    let es = null;
    let latest = null;

    function connect() {
      if (!ES) {
        obs.emit('error', new Error('EventSource not available'));
        return;
      }

      if (es) {
        try { es.close(); } catch (_) {}
        es = null;
      }

      es = new ES(url);
      obs.emit('info', { type: 'connecting', url, timestampMs: Date.now() });

      es.onopen = () => {
        obs.emit('info', { type: 'open', timestampMs: Date.now() });
      };

      es.onerror = () => {
        obs.emit('error', new Error('sse-error'));
      };

      es.onmessage = (evt) => {
        const parsed = safeParseJson(evt && evt.data);
        const msg = normalizeEventMessage(parsed);
        if (!msg) return;

        if (msg.type === 'next') {
          latest = msg.value;
          obs.emit('next', latest);
        } else if (msg.type === 'complete') {
          obs.emit('complete');
        } else if (msg.type === 'error') {
          obs.emit('error', new Error(msg.message || 'remote-error'));
        } else if (msg.type === 'info') {
          obs.emit('info', msg);
        }
      };
    }

    async function command(commandUrl, name, payload) {
      if (!fetchFn) throw new Error('fetch not available');
      const res = await fetchFn(commandUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, payload })
      });
      if (!res.ok) {
        throw new Error(`command failed: ${res.status}`);
      }
      return await res.json();
    }

    function close() {
      if (es) {
        try { es.close(); } catch (_) {}
      }
      es = null;
      obs.close();
    }

    return {
      obs,
      connect,
      close,
      getLatest: () => latest,
      command
    };
  }

  return {
    createRemoteObservableClient
  };
});
