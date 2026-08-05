// Copied from Lab 042: exposes RemoteObservableShared on window.
/* eslint-disable */
(function() {
  'use strict';

  function createMiniObservable() {
    const handlers = new Map();
    let closed = false;

    function on(event, fn) {
      if (closed) return api;
      if (typeof fn !== 'function') return api;
      const arr = handlers.get(event) || [];
      arr.push(fn);
      handlers.set(event, arr);
      return api;
    }

    function off(event, fn) {
      const arr = handlers.get(event);
      if (!arr || !arr.length) return api;
      const next = arr.filter((h) => h !== fn);
      if (next.length) handlers.set(event, next);
      else handlers.delete(event);
      return api;
    }

    function emit(event, value) {
      if (closed) return;
      const arr = handlers.get(event);
      if (!arr || !arr.length) return;
      for (const fn of [...arr]) {
        try {
          fn(value);
        } catch (e) {
          try {
            const errHandlers = handlers.get('error');
            if (event !== 'error' && errHandlers && errHandlers.length) {
              for (const eh of [...errHandlers]) {
                try {
                  eh(e);
                } catch (_) { /* a throwing error-handler must not break dispatch (lab snapshot) — reviewed c206 */ }
              }
            }
          } catch (_) { /* handler dispatch guard (lab snapshot) — reviewed c206 */ }
        }
      }
    }

    function close() {
      closed = true;
      handlers.clear();
    }

    const api = {
      on,
      off,
      emit,
      close,
      get closed() {
        return closed;
      }
    };

    return api;
  }

  const MESSAGE_TYPES = {
    NEXT: 'next',
    ERROR: 'error',
    COMPLETE: 'complete',
    INFO: 'info'
  };

  function safeParseJson(text) {
    if (typeof text !== 'string') return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function normalizeEventMessage(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const type = typeof obj.type === 'string' ? obj.type : null;
    if (!type) return null;
    const value = obj.value;
    const message = typeof obj.message === 'string' ? obj.message : null;
    const timestampMs = Number.isFinite(obj.timestampMs) ? obj.timestampMs : Date.now();
    return { type, value, message, timestampMs };
  }

  function normalizeCommand(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name) return null;
    const payload = obj.payload && typeof obj.payload === 'object' ? obj.payload : undefined;
    return { name, payload };
  }

  window.RemoteObservableShared = {
    MESSAGE_TYPES,
    createMiniObservable,
    safeParseJson,
    normalizeEventMessage,
    normalizeCommand
  };
})();
