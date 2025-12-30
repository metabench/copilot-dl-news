/* eslint-disable */
(function (root, factory) {
  'use strict';
  const api = factory(root);

  try {
    root.RemoteObservableClientAdapters = api;
  } catch (_) {}

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
  'use strict';

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function createRemoteObservableConnection({ basePath, autoConnect = true } = {}) {
    if (!basePath || typeof basePath !== 'string') {
      throw new Error('createRemoteObservableConnection requires basePath');
    }

    const createRemoteObservableClient = root && root.createRemoteObservableClient
      ? root.createRemoteObservableClient
      : null;

    if (typeof createRemoteObservableClient !== 'function') {
      throw new Error('createRemoteObservableClient missing (RemoteObservableClientAdapters requires RemoteObservableClient loaded first)');
    }

    const base = basePath.replace(/\/$/, '');
    const sseUrl = base + '/events';
    const commandUrl = base + '/command';

    const client = createRemoteObservableClient({ url: sseUrl });
    if (autoConnect) client.connect();

    async function command(name, payload) {
      return await client.command(commandUrl, name, payload);
    }

    function close() {
      client.close();
    }

    return {
      client,
      basePath: base,
      sseUrl,
      commandUrl,
      command,
      close
    };
  }

  // 1) Evented-style adapter (jsgui3 controls use .on/.off/.raise)
  function toEvented(connection) {
    const obs = connection && connection.client && connection.client.obs;
    if (!obs) throw new Error('toEvented requires a connection created by createRemoteObservableConnection');

    const api = {
      on(eventName, handler) {
        obs.on(eventName, handler);
        return api;
      },
      off(eventName, handler) {
        obs.off(eventName, handler);
        return api;
      },
      raise(eventName, data) {
        // Local raise (does not send to server)
        obs.emit(eventName, data);
        return api;
      },
      raise_event(eventName, data) {
        return api.raise(eventName, data);
      },
      next(handler) {
        return api.on('next', handler);
      },
      error(handler) {
        return api.on('error', handler);
      },
      complete(handler) {
        return api.on('complete', handler);
      },
      info(handler) {
        return api.on('info', handler);
      },
      async command(name, payload) {
        return await connection.command(name, payload);
      },
      async pause() {
        return await api.command('pause');
      },
      async resume() {
        return await api.command('resume');
      },
      async cancel() {
        return await api.command('cancel');
      },
      close() {
        connection.close();
      }
    };

    return api;
  }

  // 2) Rx-like adapter: { subscribe({next,error,complete}) -> {unsubscribe} }
  function toRx(connection) {
    const obs = connection && connection.client && connection.client.obs;
    if (!obs) throw new Error('toRx requires a connection');

    return {
      subscribe(observer) {
        const next = observer && typeof observer.next === 'function' ? observer.next : null;
        const error = observer && typeof observer.error === 'function' ? observer.error : null;
        const complete = observer && typeof observer.complete === 'function' ? observer.complete : null;

        if (next) obs.on('next', next);
        if (error) obs.on('error', error);
        if (complete) obs.on('complete', complete);

        return {
          unsubscribe() {
            if (next) obs.off('next', next);
            if (error) obs.off('error', error);
            if (complete) obs.off('complete', complete);
            connection.close();
          }
        };
      }
    };
  }

  // 3) Async-iterator adapter: for await (const value of iter) { ... }
  // By default yields "next" payloads.
  function toAsyncIterator(connection, { yieldMode = 'next' } = {}) {
    const obs = connection && connection.client && connection.client.obs;
    if (!obs) throw new Error('toAsyncIterator requires a connection');

    let done = false;
    let pendingResolve = null;
    const queue = [];
    let terminalError = null;

    function push(value) {
      if (done) return;
      if (pendingResolve) {
        const r = pendingResolve;
        pendingResolve = null;
        r({ value, done: false });
      } else {
        queue.push(value);
      }
    }

    const onNext = (value) => {
      if (yieldMode === 'next') push(value);
      else push({ type: 'next', value });
    };

    const onInfo = (value) => {
      if (yieldMode === 'all') push({ type: 'info', value });
    };

    const onComplete = () => {
      done = true;
      if (pendingResolve) {
        const r = pendingResolve;
        pendingResolve = null;
        r({ value: undefined, done: true });
      }
    };

    const onError = (err) => {
      terminalError = err || new Error('observable error');
      done = true;
      if (pendingResolve) {
        const r = pendingResolve;
        pendingResolve = null;
        r({ value: undefined, done: true });
      }
    };

    obs.on('next', onNext);
    obs.on('info', onInfo);
    obs.on('complete', onComplete);
    obs.on('error', onError);

    function cleanup() {
      obs.off('next', onNext);
      obs.off('info', onInfo);
      obs.off('complete', onComplete);
      obs.off('error', onError);
      connection.close();
    }

    const iterator = {
      async next() {
        if (terminalError) {
          const err = terminalError;
          terminalError = null;
          cleanup();
          throw err;
        }

        if (queue.length) {
          return { value: queue.shift(), done: false };
        }

        if (done) {
          cleanup();
          return { value: undefined, done: true };
        }

        return await new Promise((resolve) => {
          pendingResolve = resolve;
        });
      },
      async return() {
        done = true;
        cleanup();
        return { value: undefined, done: true };
      },
      [Symbol.asyncIterator]() {
        return iterator;
      }
    };

    return iterator;
  }

  async function waitFor(predicate, { timeoutMs = 8000, pollMs = 50 } = {}) {
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (predicate()) return true;
      if (Date.now() - start > timeoutMs) return false;
      await sleep(pollMs);
    }
  }

  return {
    createRemoteObservableConnection,
    toEvented,
    toRx,
    toAsyncIterator,
    waitFor
  };
});
