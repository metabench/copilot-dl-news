"use strict";

function normalizeListingState(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const clonedPagination = payload.pagination ? { ...payload.pagination } : undefined;
  const normalized = { ...payload };
  if (clonedPagination) {
    normalized.pagination = clonedPagination;
  }
  if (!normalized.meta && payload.meta) {
    normalized.meta = { ...payload.meta };
  } else if (normalized.meta && payload.meta && normalized.meta !== payload.meta) {
    normalized.meta = { ...payload.meta };
  }
  if (clonedPagination && (!normalized.meta || !normalized.meta.pagination)) {
    normalized.meta = normalized.meta ? { ...normalized.meta } : {};
    normalized.meta.pagination = clonedPagination;
  }
  return normalized;
}

function createListingStateStore(initialState) {
  let state = normalizeListingState(initialState);
  const listeners = new Set();

  const getState = () => state;

  const notify = () => {
    listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[copilot] listing store listener failed", error);
        }
      }
    });
  };

  const setState = (nextState) => {
    state = normalizeListingState(nextState);
    if (typeof window !== "undefined") {
      window.__COPILOT_URL_LISTING_STATE__ = state;
    }
    notify();
  };

  const subscribe = (listener, options = {}) => {
    if (typeof listener !== "function") {
      return () => {};
    }
    listeners.add(listener);
    if (options.immediate !== false) {
      try {
        listener(state);
      } catch (error) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[copilot] listing store immediate subscriber failed", error);
        }
      }
    }
    return () => {
      listeners.delete(listener);
    };
  };

  return { getState, setState, subscribe };
}

function ensureGlobalListingStateStore(initialState) {
  if (typeof window === "undefined") {
    return null;
  }
  if (window.__COPILOT_URL_LISTING_STORE__) {
    if (initialState) {
      window.__COPILOT_URL_LISTING_STORE__.setState(initialState);
    }
    return window.__COPILOT_URL_LISTING_STORE__;
  }
  const store = createListingStateStore(initialState);
  window.__COPILOT_URL_LISTING_STORE__ = store;
  return store;
}

module.exports = {
  createListingStateStore,
  ensureGlobalListingStateStore,
  normalizeListingState
};
