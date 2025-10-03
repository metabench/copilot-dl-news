export function createEventHub() {
  const listeners = new Map();
  let counter = 0;

  function on(event, handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new TypeError('Event handler must be a function');
    }
    const key = `${event}:${++counter}`;
    if (!listeners.has(event)) {
      listeners.set(event, new Map());
    }
    const bucket = listeners.get(event);
    let wrapped = handler;
    if (options.once) {
      wrapped = (payload, meta) => {
        off();
        handler(payload, meta);
      };
    }
    bucket.set(key, wrapped);
    let active = true;
    function off() {
      if (!active) return;
      active = false;
      if (!listeners.has(event)) return;
      const store = listeners.get(event);
      store.delete(key);
      if (store.size === 0) {
        listeners.delete(event);
      }
    }
    return off;
  }

  function emit(event, payload, meta = {}) {
    const store = listeners.get(event);
    if (!store || store.size === 0) return;
    const txFromMeta = (() => {
      if (meta && typeof meta === 'object' && meta.tx !== undefined) {
        return meta.tx;
      }
      if (payload && typeof payload === 'object' && payload.tx !== undefined) {
        return payload.tx;
      }
      return undefined;
    })();
    const preparedPayload = (() => {
      if (payload && typeof payload === 'object') {
        if (txFromMeta !== undefined && payload.tx !== txFromMeta) {
          return { ...payload, tx: txFromMeta };
        }
        return payload;
      }
      if (txFromMeta === undefined) {
        return payload;
      }
      return { value: payload, tx: txFromMeta };
    })();
    const descriptor = {
      event,
      tx: txFromMeta,
      payload: preparedPayload
    };
    // Copy to guard against mutation while iterating
    for (const handler of Array.from(store.values())) {
      try {
        handler(preparedPayload, descriptor);
      } catch (err) {
        console.error('[eventHub] handler error', err);
      }
    }
  }

  function clear() {
    listeners.clear();
  }

  return {
    on,
    emit,
    clear
  };
}
