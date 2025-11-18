"use strict";

const { applyListingStateToDocument } = require("../controls/helpers/urlListingDom");

function attachListingDomBindings(store, options = {}) {
  if (!store || typeof store.subscribe !== "function") {
    return null;
  }
  const doc = options.document || (typeof document !== "undefined" ? document : null);
  if (!doc) {
    return null;
  }
  const applyState = (state) => {
    if (!state) {
      return;
    }
    applyListingStateToDocument(doc, state);
  };
  applyState(store.getState ? store.getState() : null);
  return store.subscribe(applyState);
}

module.exports = {
  attachListingDomBindings
};
