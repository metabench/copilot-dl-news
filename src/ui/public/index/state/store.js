import { nanoid } from './utils.js';

export function createStore(initialState = {}) {
  let state = Object.freeze({ ...initialState });
  const listeners = new Map();
  const reducers = new Map();

  function getState() {
    return state;
  }

  function setState(updater, meta = null) {
    const nextState = typeof updater === 'function'
      ? Object.freeze({ ...state, ...updater(state) })
      : Object.freeze({ ...state, ...updater });
    if (nextState === state) {
      return state;
    }
    state = nextState;
    const payload = { state: nextState, meta };
    for (const [, subscription] of listeners) {
      try {
        subscription(payload);
      } catch (err) {
        console.error('[store] subscriber error', err);
      }
    }
    return state;
  }

  function subscribe(listener) {
    const id = nanoid();
    listeners.set(id, listener);
    return () => listeners.delete(id);
  }

  function register(type, reducer) {
    if (typeof type !== 'string' || !type) {
      throw new TypeError('Action type must be a non-empty string');
    }
    if (typeof reducer !== 'function') {
      throw new TypeError('Reducer must be a function');
    }
    reducers.set(type, reducer);
    return () => reducers.delete(type);
  }

  function dispatch(type, payload) {
    const reducer = reducers.get(type);
    if (!reducer) {
      console.warn(`[store] missing reducer for action "${type}"`);
      return state;
    }
    const partial = reducer(state, payload);
    if (partial == null) {
      return state;
    }
    return setState((prev) => ({ ...prev, ...partial }), { type, payload });
  }

  return {
    getState,
    setState,
    subscribe,
    register,
    dispatch
  };
}
