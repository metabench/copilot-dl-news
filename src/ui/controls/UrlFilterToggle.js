"use strict";

const jsgui = require("jsgui3-html");
const { registerControlType } = require("./controlRegistry");
const { installBindingPlugin } = require("../jsgui/bindingPlugin");
const { emitUrlFilterDebug } = require("./urlFilterDiagnostics");
const { applyListingStateToDocument } = require("./helpers/urlListingDom");

installBindingPlugin(jsgui);

const CONTROL_TYPE = "url_filter_toggle";

function encodeQueryPayload(query = {}) {
  try {
    return encodeURIComponent(JSON.stringify(query));
  } catch (_) {
    return encodeURIComponent("{}");
  }
}

function decodeQueryPayload(value) {
  if (!value) return {};
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch (_) {
    return {};
  }
}

function buildSearchParams(query = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, rawValue]) => {
    if (rawValue == null) return;
    if (Array.isArray(rawValue)) {
      rawValue.forEach((entry) => {
        if (entry == null) return;
        params.append(key, String(entry));
      });
      return;
    }
    params.append(key, String(rawValue));
  });
  return params;
}

class UrlFilterToggleControl extends jsgui.Control {
  constructor(spec = {}) {
    const normalized = {
      ...spec,
      tagName: "div",
      __type_name: CONTROL_TYPE
    };
    super(normalized);
    this.add_class("filter-toggle");
    this._config = {
      apiPath: spec.apiPath || "/api/urls",
      basePath: spec.basePath || "/urls",
      query: spec.query || {},
      label: spec.label || "Show fetched URLs only",
      defaultPage: Number.isFinite(spec.defaultPage) ? Math.max(1, Math.trunc(spec.defaultPage)) : 1
    };
    this._state = {
      hasFetches: !!spec.hasFetches
    };
    this._lastDiagnostics = null;
    this._listingStore = null;
    this._storeUnsubscribe = null;
    this._lastHistoryHref = null;
    if (!spec.el) {
      this.compose();
    }
    this._applyDataAttributes();
  }

  compose() {
    const label = new jsgui.label({ context: this.context, class: "filter-toggle__label" });
    const switchWrap = new jsgui.span({ context: this.context, class: "filter-toggle__switch" });
    const checkbox = new jsgui.input({ context: this.context, class: "filter-toggle__checkbox" });
    checkbox.dom.attributes.type = "checkbox";
    checkbox.dom.attributes.value = "1";
    if (this._state.hasFetches) {
      checkbox.dom.attributes.checked = "checked";
    }
    const slider = new jsgui.span({ context: this.context, class: "filter-toggle__slider" });
    switchWrap.add(checkbox);
    switchWrap.add(slider);
    const copy = new jsgui.span({ context: this.context, class: "filter-toggle__text" });
    copy.add_text(this._config.label);
    label.add(switchWrap);
    label.add(copy);
    this.add(label);
  }

  _applyDataAttributes() {
    const attrs = this.dom.attributes;
    attrs["data-api-path"] = this._config.apiPath;
    attrs["data-base-path"] = this._config.basePath;
    attrs["data-query"] = encodeQueryPayload(this._config.query);
    attrs["data-default-page"] = String(this._config.defaultPage || 1);
    attrs["data-has-fetches"] = this._state.hasFetches ? "1" : "0";
  }

  activate(el) {
    super.activate(el);
    if (this.__activatedOnce) return;
    this.__activatedOnce = true;
    this._rootEl = el || this.dom.el;
    this._checkbox = this._rootEl ? this._rootEl.querySelector(".filter-toggle__checkbox") : null;
    if (this._checkbox) {
      this._checkbox.addEventListener("change", () => this.handleToggle(this._checkbox.checked));
    }
    this._initListingStore();
  }

  async handleToggle(enabled) {
    if (this._pending) return;
    const nextQuery = this._buildQuery(enabled);
    this._state.hasFetches = !!enabled;
    this._syncDomState();
    this._setBusy(true);
    let diagnostics = null;
    try {
      const result = await this._fetchListing(nextQuery);
      diagnostics = result.diagnostics || null;
      this._publishListingPayload(result.payload, nextQuery);
      this._emitDebugEvent({
        status: "success",
        diagnostics,
        query: nextQuery,
        meta: result.payload ? result.payload.meta : null
      });
    } catch (error) {
      diagnostics = error && error.diagnostics ? error.diagnostics : diagnostics;
      console.error("Failed to refresh URL listing:", error);
      if (this._checkbox) {
        this._checkbox.checked = !enabled;
      }
      this._state.hasFetches = !enabled;
      this._syncDomState();
      this._emitDebugEvent({
        status: "error",
        diagnostics,
        query: nextQuery,
        error: {
          message: error && error.message ? error.message : "Unknown error"
        }
      });
    } finally {
      this._setBusy(false);
    }
  }

  _syncDomState() {
    if (this._rootEl) {
      this._rootEl.setAttribute("data-has-fetches", this._state.hasFetches ? "1" : "0");
    }
  }

  _setBusy(state) {
    this._pending = state;
    if (!this._rootEl) return;
    if (state) {
      this._rootEl.classList.add("is-loading");
    } else {
      this._rootEl.classList.remove("is-loading");
    }
  }

  _buildQuery(enabled) {
    const snapshot = this._decodeQuery();
    const next = { ...snapshot };
    if (enabled) {
      next.hasFetches = "1";
    } else {
      delete next.hasFetches;
    }
    next.page = String(this._config.defaultPage || 1);
    return next;
  }

  _decodeQuery() {
    if (this._rootEl) {
      return decodeQueryPayload(this._rootEl.getAttribute("data-query"));
    }
    return JSON.parse(JSON.stringify(this._config.query || {}));
  }

  async _fetchListing(query) {
    const params = buildSearchParams(query);
    const qs = params.toString();
    const apiPath = this._rootEl ? this._rootEl.getAttribute("data-api-path") || this._config.apiPath : this._config.apiPath;
    const target = qs ? `${apiPath}?${qs}` : apiPath;
    const response = await fetch(target, {
      headers: { accept: "application/json" },
      credentials: "same-origin"
    });
    const diagnostics = this._extractResponseDiagnostics(response, { query });
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      const parseError = new Error("Failed to parse /api/urls response");
      parseError.cause = error;
      parseError.diagnostics = diagnostics;
      throw parseError;
    }
    if (!response.ok || (payload && payload.ok === false)) {
      const fallbackMessage = payload && payload.error && payload.error.message
        ? payload.error.message
        : `Refresh failed (${response.status})`;
      const apiError = new Error(fallbackMessage);
      apiError.diagnostics = {
        ...diagnostics,
        ...(payload && payload.diagnostics ? payload.diagnostics : {})
      };
      apiError.payload = payload;
      throw apiError;
    }
    const mergedDiagnostics = {
      ...diagnostics,
      ...(payload && payload.diagnostics ? payload.diagnostics : {})
    };
    return { payload, diagnostics: mergedDiagnostics };
  }

  _publishListingPayload(payload, query) {
    if (!payload || payload.ok === false) {
      return;
    }
    if (!this._listingStore) {
      this._initListingStore();
    }
    if (this._listingStore) {
      this._listingStore.setState(payload);
      return;
    }
    applyListingStateToDocument(this._getDocument(), payload);
    const nextQuery = payload.query || query || {};
    this._state.hasFetches = !!(payload.filters && payload.filters.hasFetches);
    this._syncDomState();
    this._updateQueryState(nextQuery);
    this._updateBasePath(payload.basePath);
    this._syncHistory(nextQuery, payload.basePath);
  }

  _updateBasePath(basePath) {
    if (!basePath) {
      return;
    }
    this._config.basePath = basePath;
    if (this._rootEl) {
      this._rootEl.setAttribute("data-base-path", basePath);
    }
  }

  _resolveListingStore() {
    if (typeof window === "undefined") {
      return null;
    }
    const store = window.__COPILOT_URL_LISTING_STORE__;
    if (!store || typeof store.subscribe !== "function" || typeof store.setState !== "function") {
      return null;
    }
    return store;
  }

  _initListingStore() {
    if (this._listingStore || this._storeUnsubscribe) {
      return;
    }
    const store = this._resolveListingStore();
    if (!store) {
      return;
    }
    this._listingStore = store;
    this._storeUnsubscribe = store.subscribe((state) => this._handleStoreState(state), { immediate: true });
  }

  _handleStoreState(state) {
    if (!state || typeof state !== "object") {
      return;
    }
    const hasFetches = !!(state.filters && state.filters.hasFetches);
    this._state.hasFetches = hasFetches;
    this._syncDomState();
    if (this._checkbox) {
      this._checkbox.checked = hasFetches;
    }
    const query = state.query || {};
    this._updateQueryState(query);
    this._updateBasePath(state.basePath);
    this._syncHistory(query, state.basePath);
  }

  _updateQueryState(query) {
    this._config.query = { ...query };
    if (this._rootEl) {
      this._rootEl.setAttribute("data-query", encodeQueryPayload(this._config.query));
    }
  }

  _syncHistory(query, basePathOverride) {
    if (typeof window === "undefined" || !window.history || typeof window.history.replaceState !== "function") {
      return;
    }
    const params = buildSearchParams(query);
    const basePath = basePathOverride
      || (this._rootEl ? this._rootEl.getAttribute("data-base-path") : null)
      || this._config.basePath;
    if (!basePath) {
      return;
    }
    const qs = params.toString();
    const nextUrl = qs ? `${basePath}?${qs}` : basePath;
    if (nextUrl === this._lastHistoryHref) {
      return;
    }
    window.history.replaceState({}, document.title, nextUrl);
    this._lastHistoryHref = nextUrl;
  }

  _getDocument() {
    if (this.context && this.context.document) {
      return this.context.document;
    }
    if (typeof document !== "undefined") {
      return document;
    }
    return null;
  }

  _extractResponseDiagnostics(response, context = {}) {
    if (!response || typeof response.headers?.get !== "function") {
      return { ...context };
    }
    const durationHeader = response.headers.get("x-copilot-duration-ms");
    const durationMs = durationHeader != null ? Number(durationHeader) : null;
    return {
      ...context,
      requestId: response.headers.get("x-copilot-request-id") || null,
      durationMs: Number.isFinite(durationMs) ? durationMs : null,
      source: response.headers.get("x-copilot-api") || "dataExplorer",
      status: response.status
    };
  }

  _emitDebugEvent(detail) {
    this._lastDiagnostics = detail || null;
    emitUrlFilterDebug({
      control: CONTROL_TYPE,
      ...detail
    });
  }
}

registerControlType(CONTROL_TYPE, UrlFilterToggleControl);

module.exports = {
  UrlFilterToggleControl
};
