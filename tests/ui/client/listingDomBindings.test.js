"use strict";

jest.mock("../../../src/ui/controls/helpers/urlListingDom", () => ({
  applyListingStateToDocument: jest.fn()
}));

const { applyListingStateToDocument } = require("../../../src/ui/controls/helpers/urlListingDom");
const { attachListingDomBindings } = require("../../../src/ui/client/listingDomBindings");

describe("attachListingDomBindings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns null when store missing subscribe", () => {
    expect(attachListingDomBindings(null)).toBeNull();
    expect(attachListingDomBindings({ subscribe: null })).toBeNull();
  });

  test("invokes applyListingStateToDocument with current state", () => {
    const initialState = { meta: { total: 5 } };
    const store = {
      getState: jest.fn(() => initialState),
      subscribe: jest.fn(() => jest.fn())
    };

    const fakeDocument = {};
    const unsubscribe = attachListingDomBindings(store, { document: fakeDocument });

    expect(typeof unsubscribe).toBe("function");
    expect(applyListingStateToDocument).toHaveBeenCalledTimes(1);
    expect(applyListingStateToDocument).toHaveBeenCalledWith(fakeDocument, initialState);
    expect(store.subscribe).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  test("applies subsequent store updates and supports unsubscribe", () => {
    let listener = null;
    const store = {
      getState: jest.fn(() => null),
      subscribe: jest.fn((cb) => {
        listener = cb;
        return () => {
          listener = null;
        };
      })
    };

    const fakeDocument = {};
    const unsubscribe = attachListingDomBindings(store, { document: fakeDocument });
    expect(listener).toBeTruthy();

    const nextState = { meta: { total: 9 } };
    listener(nextState);

    expect(applyListingStateToDocument).toHaveBeenLastCalledWith(fakeDocument, nextState);

    unsubscribe();
    expect(listener).toBeNull();
  });
});
