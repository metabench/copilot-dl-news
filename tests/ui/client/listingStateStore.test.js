"use strict";

const {
  normalizeListingState,
  createListingStateStore,
  ensureGlobalListingStateStore
} = require("../../../src/ui/client/listingStateStore");

describe("listingStateStore", () => {
  afterEach(() => {
    delete global.window;
  });

  test("normalizeListingState clones nested meta and pagination", () => {
    const payload = {
      meta: { total: 5 },
      pagination: { page: 2, pageSize: 50 }
    };
    const normalized = normalizeListingState(payload);
    expect(normalized).not.toBe(payload);
    expect(normalized.meta).toEqual({ total: 5, pagination: { page: 2, pageSize: 50 } });
    expect(normalized.meta).not.toBe(payload.meta);
    expect(normalized.meta.pagination).not.toBe(payload.pagination);
  });

  test("createListingStateStore mirrors state to window and notifies subscribers", () => {
    global.window = {};
    const store = createListingStateStore({ meta: { total: 1 } });
    const updates = [];
    const unsubscribe = store.subscribe((state) => {
      updates.push(state);
    });
    store.setState({ meta: { total: 2 }, pagination: { page: 1 } });

    expect(global.window.__COPILOT_URL_LISTING_STATE__).toEqual({
      meta: { total: 2, pagination: { page: 1 } },
      pagination: { page: 1 }
    });
    expect(updates).toHaveLength(2);
    expect(updates[1]).toEqual({
      meta: { total: 2, pagination: { page: 1 } },
      pagination: { page: 1 }
    });
    unsubscribe();
  });

  test("ensureGlobalListingStateStore reuses singleton and hydrates new state", () => {
    global.window = {};
    const first = ensureGlobalListingStateStore({ meta: { total: 3 } });
    const second = ensureGlobalListingStateStore({ meta: { total: 4 } });
    expect(first).toBe(second);
    expect(second.getState()).toEqual({
      meta: { total: 4 },
      pagination: undefined
    });
  });
});
