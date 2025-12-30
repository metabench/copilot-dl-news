"use strict";

const {
  inferTopic,
  getSeverity,
  getTelemetryRenderer,
  renderDefault
} = require("../telemetry/telemetryRenderers");

const {
  getDefaultTelemetryPanels,
  normalizeTelemetryPanels
} = require("../telemetry/telemetryPanels");

function createToolsPanelControl(jsgui) {
  const StringControl = jsgui.String_Control;

  class ToolsPanelControl extends jsgui.Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: "section" });
      this.add_class("cw-tools-panel");
      this._api = spec.api || null;
      this._isOpen = Boolean(spec.isOpen);
      this._getSelectedUrl = typeof spec.getSelectedUrl === 'function' ? spec.getSelectedUrl : () => "";

      this._telemetryPanels =
        normalizeTelemetryPanels(spec.telemetryPanels) || getDefaultTelemetryPanels();
      this._telemetryPanelState = new Map();

      this._placeHubs = [];
      this._hubTelemetry = [];
      this._telemetryEvents = [];
      this._telemetryTopic = "all";
      this._telemetryShowProgress = false;
      if (!spec.el) this.compose();
      this._syncOpenClass();
    }

    compose() {
      const header = new jsgui.Control({ context: this.context, tagName: "div" });
      header.add_class("cw-tools-panel__header");
      header.add(new StringControl({ context: this.context, text: "TOOLS" }));
      this.add(header);

      const body = new jsgui.Control({ context: this.context, tagName: "div" });
      body.add_class("cw-tools-panel__body");

      this._decisionTreesBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._decisionTreesBtn.add_class("cw-tools-panel__btn");
      this._decisionTreesBtn.dom.attributes.title = "Open Decision Trees (Data Explorer)";
      this._decisionTreesBtn.add(new StringControl({ context: this.context, text: "🌳 Decision Trees" }));

      this._dataExplorerBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._dataExplorerBtn.add_class("cw-tools-panel__btn");
      this._dataExplorerBtn.dom.attributes.title = "Open Data Explorer";
      this._dataExplorerBtn.add(new StringControl({ context: this.context, text: "🗂 Data Explorer" }));

      this._telemetryBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._telemetryBtn.add_class("cw-tools-panel__btn");
      this._telemetryBtn.dom.attributes.title = "Open widget telemetry health";
      this._telemetryBtn.add(new StringControl({ context: this.context, text: "📡 Telemetry Health" }));

      const hint = new jsgui.Control({ context: this.context, tagName: "div" });
      hint.add_class("cw-tools-panel__hint");
      hint.add(new StringControl({
        context: this.context,
        text: "Decision Trees requires the Data Explorer server running."
      }));

      body.add(this._decisionTreesBtn);
      body.add(this._dataExplorerBtn);
      body.add(this._telemetryBtn);
      body.add(hint);

      const hubsHeader = new jsgui.Control({ context: this.context, tagName: "div" });
      hubsHeader.add_class("cw-tools-panel__subheader");
      hubsHeader.add(new StringControl({ context: this.context, text: "PLACE HUBS" }));

      this._refreshHubsBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._refreshHubsBtn.add_class("cw-tools-panel__btn");
      this._refreshHubsBtn.dom.attributes.title = "Refresh stored place hubs (filtered by selected URL host)";
      this._refreshHubsBtn.add(new StringControl({ context: this.context, text: "🔄 Refresh Hubs" }));

      this._guessHubsBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._guessHubsBtn.add_class("cw-tools-panel__btn");
      this._guessHubsBtn.dom.attributes.title = "Run place hub guessing for selected URL host";
      this._guessHubsBtn.add(new StringControl({ context: this.context, text: "🧠 Guess Hubs" }));

      this._hubsStatus = new jsgui.Control({ context: this.context, tagName: "div" });
      this._hubsStatus.add_class("cw-tools-panel__status");
      this._hubsStatus.add(new StringControl({ context: this.context, text: "Hubs: (not loaded)" }));

      this._hubsPre = new jsgui.Control({ context: this.context, tagName: "pre" });
      this._hubsPre.add_class("cw-tools-panel__pre");
      this._hubsPre.add(new StringControl({ context: this.context, text: "" }));

      this._hubTelemetryPre = new jsgui.Control({ context: this.context, tagName: "pre" });
      this._hubTelemetryPre.add_class("cw-tools-panel__pre");
      this._hubTelemetryPre.add(new StringControl({ context: this.context, text: "" }));

      const telemetryHeader = new jsgui.Control({ context: this.context, tagName: "div" });
      telemetryHeader.add_class("cw-tools-panel__subheader");
      telemetryHeader.add(new StringControl({ context: this.context, text: "LIVE TELEMETRY" }));

      this._telemetryPanelsHost = new jsgui.Control({ context: this.context, tagName: "div" });
      this._telemetryPanelsHost.add_class("cw-tools-panel__telemetry-panels");

      const telemetryTools = new jsgui.Control({ context: this.context, tagName: "div" });
      telemetryTools.add_class("cw-tools-panel__telemetry-tools");

      this._telemetryTopicSelect = new jsgui.Control({ context: this.context, tagName: "select" });
      this._telemetryTopicSelect.add_class("cw-tools-panel__select");
      this._telemetryTopicSelect.dom.attributes.title = "Filter telemetry by topic";
      this._telemetryTopicSelect.dom.attributes["aria-label"] = "Telemetry topic filter";

      this._telemetryProgressToggle = new jsgui.Control({ context: this.context, tagName: "label" });
      this._telemetryProgressToggle.add_class("cw-tools-panel__checkbox");
      this._telemetryProgressToggle.add(new StringControl({ context: this.context, text: "Show progress" }));

      this._telemetryClearBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._telemetryClearBtn.add_class("cw-tools-panel__btn");
      this._telemetryClearBtn.dom.attributes.title = "Clear live telemetry buffer";
      this._telemetryClearBtn.add(new StringControl({ context: this.context, text: "🗑 Clear" }));

      telemetryTools.add(this._telemetryTopicSelect);
      telemetryTools.add(this._telemetryProgressToggle);
      telemetryTools.add(this._telemetryClearBtn);

      this._telemetryFeed = new jsgui.Control({ context: this.context, tagName: "div" });
      this._telemetryFeed.add_class("cw-tools-panel__telemetry-feed");

      body.add(hubsHeader);
      body.add(this._refreshHubsBtn);
      body.add(this._guessHubsBtn);
      body.add(this._hubsStatus);
      body.add(this._hubsPre);
      body.add(this._hubTelemetryPre);
      body.add(telemetryHeader);
      body.add(this._telemetryPanelsHost);
      body.add(telemetryTools);
      body.add(this._telemetryFeed);

      this.add(body);
    }

    setOpen(isOpen) {
      this._isOpen = Boolean(isOpen);
      this._syncOpenClass();
    }

    toggleOpen() {
      this.setOpen(!this._isOpen);
    }

    _syncOpenClass() {
      const el = this._el();
      if (!el) return;
      el.classList.toggle("cw-tools-panel--open", this._isOpen);
      el.classList.toggle("cw-tools-panel--closed", !this._isOpen);
    }

    _el(ctrl = this) {
      return ctrl?.dom?.el || null;
    }

    activate() {
      if (this.__active) return;
      super.activate();

      this._syncOpenClass();

      this._decisionTreesBtn?.on("click", async () => {
        if (this._api?.openDecisionTrees) {
          await this._api.openDecisionTrees();
        }
      });

      this._dataExplorerBtn?.on("click", async () => {
        if (this._api?.openDataExplorer) {
          await this._api.openDataExplorer();
        }
      });

      this._telemetryBtn?.on("click", async () => {
        if (this._api?.openTelemetryHealth) {
          await this._api.openTelemetryHealth();
        }
      });

      this._refreshHubsBtn?.on('click', async () => {
        await this.refreshPlaceHubs();
      });

      this._guessHubsBtn?.on('click', async () => {
        await this.guessPlaceHubsForSelectedHost();
      });

      void this.refreshPlaceHubs();
      this._renderHubTelemetry();
      this._renderTelemetryPanels();
      this._renderTelemetryFeed();
    }

    _telemetryEl() {
      return this._telemetryFeed?.dom?.el || null;
    }

    _telemetryPanelsEl() {
      return this._telemetryPanelsHost?.dom?.el || null;
    }

    _selectEl() {
      return this._telemetryTopicSelect?.dom?.el || null;
    }

    _checkboxHostEl() {
      return this._telemetryProgressToggle?.dom?.el || null;
    }

    _clearBtnEl() {
      return this._telemetryClearBtn?.dom?.el || null;
    }

    _syncTelemetryFilterOptions() {
      const selectEl = this._selectEl();
      if (!selectEl) return;

      const topics = new Set();
      topics.add("all");
      for (const event of this._telemetryEvents) {
        const topic = inferTopic(event);
        if (topic) topics.add(topic);
      }

      const ordered = Array.from(topics);
      ordered.sort((a, b) => {
        if (a === "all") return -1;
        if (b === "all") return 1;
        return a.localeCompare(b);
      });

      const prev = this._telemetryTopic;
      selectEl.innerHTML = "";
      for (const topic of ordered) {
        const opt = document.createElement("option");
        opt.value = topic;
        opt.textContent = topic === "all" ? "All topics" : topic;
        selectEl.appendChild(opt);
      }
      selectEl.value = ordered.includes(prev) ? prev : "all";
      this._telemetryTopic = selectEl.value;
    }

    _ensureProgressCheckbox() {
      const host = this._checkboxHostEl();
      if (!host) return;
      if (host.querySelector("input")) return;

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(this._telemetryShowProgress);
      input.style.marginRight = "6px";
      host.insertBefore(input, host.firstChild);

      input.addEventListener("change", () => {
        this._telemetryShowProgress = Boolean(input.checked);
        this._renderTelemetryFeed();
      });
    }

    _wireTelemetryTools() {
      const selectEl = this._selectEl();
      if (selectEl && !selectEl.__cw_wired) {
        selectEl.__cw_wired = true;
        selectEl.addEventListener("change", () => {
          this._telemetryTopic = selectEl.value || "all";
          this._renderTelemetryFeed();
        });
      }

      this._ensureProgressCheckbox();

      const clearEl = this._clearBtnEl();
      if (clearEl && !clearEl.__cw_wired) {
        clearEl.__cw_wired = true;
        clearEl.addEventListener("click", () => {
          this._telemetryEvents = [];
          this._telemetryPanelState.clear();
          this._syncTelemetryFilterOptions();
          this._renderTelemetryPanels();
          this._renderTelemetryFeed();
        });
      }
    }

    _updateTelemetryPanels(event) {
      for (const panel of this._telemetryPanels) {
        try {
          if (!panel?.match?.(event)) continue;
          const prev = this._telemetryPanelState.get(panel.id);
          const next = panel.reduce(prev, event);
          this._telemetryPanelState.set(panel.id, next);
        } catch (e) {
          // Panels should never break the widget; record minimal state.
          this._telemetryPanelState.set(panel.id, {
            lastEvent: event,
            error: e?.message || String(e)
          });
        }
      }
    }

    _renderTelemetryPanels() {
      const el = this._telemetryPanelsEl();
      if (!el) return;

      if (!Array.isArray(this._telemetryPanels) || this._telemetryPanels.length === 0) {
        el.innerHTML = "";
        return;
      }

      const panels = this._telemetryPanels.slice().sort((a, b) => {
        return (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id));
      });

      const html = [];
      html.push('<div class="cw-panels">');

      for (const panel of panels) {
        const state = this._telemetryPanelState.get(panel.id);
        let rendered;
        try {
          rendered = panel.render(state, {
            events: this._telemetryEvents,
            topicFilter: this._telemetryTopic
          });
        } catch (e) {
          rendered = {
            summaryHtml: `<span class="cw-panel__empty">(panel render failed: ${String(e?.message || e)})</span>`,
            severity: "error"
          };
        }

        const sev = (rendered && rendered.severity) || "info";
        html.push(
          `<details class="cw-panel cw-panel--${sev}" open>` +
            `<summary class="cw-panel__summary">` +
              `<span class="cw-panel__title">${panel.title}</span>` +
              `<span class="cw-panel__summary-right">${rendered?.summaryHtml || ""}</span>` +
            `</summary>`
        );

        if (rendered?.bodyHtml) {
          html.push(`<div class="cw-panel__body">${rendered.bodyHtml}</div>`);
        }

        html.push("</details>");
      }

      html.push("</div>");
      el.innerHTML = html.join("");
    }

    _shouldIncludeInGenericFeed(event) {
      if (!event || typeof event.type !== "string") return false;
      if (!event.type.startsWith("crawl:")) return false;
      if (!this._telemetryShowProgress && event.type === "crawl:progress") return false;
      return true;
    }

    _deriveSelectedHost() {
      const selectedUrl = (this._getSelectedUrl?.() || '').trim();
      if (!selectedUrl) return '';
      try {
        if (selectedUrl.includes('://')) {
          return new URL(selectedUrl).hostname;
        }
      } catch (_) {
        // ignore
      }
      // Accept raw hosts too.
      return selectedUrl.replace(/^https?:\/\//i, '').replace(/\/.*/, '').trim();
    }

    async refreshPlaceHubs() {
      const host = this._deriveSelectedHost();
      if (!this._api?.listPlaceHubs) {
        this._setStatus(`Hubs: API unavailable`);
        return;
      }

      try {
        const result = await this._api.listPlaceHubs({ host });
        if (!result?.success) {
          this._placeHubs = [];
          this._renderPlaceHubs();
          this._setStatus(`Hubs: error (${result?.message || 'unknown'})`);
          return;
        }

        this._placeHubs = Array.isArray(result.hubs) ? result.hubs : [];
        this._renderPlaceHubs();
        const suffix = host ? ` for ${host}` : '';
        this._setStatus(`Hubs: ${this._placeHubs.length}${suffix}`);
      } catch (err) {
        this._placeHubs = [];
        this._renderPlaceHubs();
        this._setStatus(`Hubs: error (${err?.message || err})`);
      }
    }

    async guessPlaceHubsForSelectedHost() {
      const host = this._deriveSelectedHost();
      if (!host) {
        this._setStatus('Hubs: select a URL/host first');
        return;
      }

      if (!this._api?.guessPlaceHubs) {
        this._setStatus('Hubs: guess API unavailable');
        return;
      }

      try {
        const result = await this._api.guessPlaceHubs({ domain: host, scheme: 'https', apply: false });
        if (!result?.success) {
          this._setStatus(`Hubs: guess failed (${result?.message || 'unknown'})`);
          return;
        }
        this._setStatus(`Hubs: guessing (job ${result.jobId})`);
      } catch (err) {
        this._setStatus(`Hubs: guess failed (${err?.message || err})`);
      }
    }

    handleTelemetryEvent(event) {
      if (!event || typeof event.type !== 'string') return;

      // Premium panels update on all crawl telemetry.
      if (event.type.startsWith('crawl:')) {
        this._updateTelemetryPanels(event);
        this._renderTelemetryPanels();
      }

      if (this._shouldIncludeInGenericFeed(event)) {
        this._telemetryEvents.push(event);
        if (this._telemetryEvents.length > 200) {
          this._telemetryEvents.splice(0, this._telemetryEvents.length - 200);
        }
        this._syncTelemetryFilterOptions();
        this._renderTelemetryFeed();
      }

      if (event.type.startsWith('crawl:place-hubs:')) {
        const timestamp = event.timestamp ? String(event.timestamp).slice(11, 19) : '';
        const line = `${timestamp} ${event.type}${event.message ? ` — ${event.message}` : ''}`;

        this._hubTelemetry.push(line);
        if (this._hubTelemetry.length > 8) {
          this._hubTelemetry.splice(0, this._hubTelemetry.length - 8);
        }

        this._renderHubTelemetry();
      }
    }

    _renderPlaceHubs() {
      const lines = [];
      const hubs = Array.isArray(this._placeHubs) ? this._placeHubs : [];
      for (const hub of hubs.slice(0, 25)) {
        const url = hub?.url || '';
        const place = hub?.place_slug || '';
        const title = hub?.title ? ` — ${hub.title}` : '';
        lines.push(`${place} ${url}${title}`.trim());
      }
      if (hubs.length > 25) {
        lines.push(`… (${hubs.length - 25} more)`);
      }

      const el = this._hubsPre?.dom?.el;
      if (el) el.textContent = lines.join('\n');
    }

    _renderHubTelemetry() {
      const el = this._hubTelemetryPre?.dom?.el;
      if (el) el.textContent = this._hubTelemetry.join('\n');
    }

    _renderTelemetryFeed() {
      this._wireTelemetryTools();
      const el = this._telemetryEl();
      if (!el) return;

      const topicFilter = this._telemetryTopic || "all";
      const events = this._telemetryEvents
        .filter((evt) => topicFilter === "all" || inferTopic(evt) === topicFilter)
        .slice(-120);

      // Group by topic so unknown future topics still look decent.
      const grouped = new Map();
      for (const evt of events) {
        const topic = inferTopic(evt);
        if (!grouped.has(topic)) grouped.set(topic, []);
        grouped.get(topic).push(evt);
      }

      const topics = Array.from(grouped.keys());
      topics.sort((a, b) => a.localeCompare(b));

      if (topics.length === 0) {
        el.innerHTML = "<div class=\"cw-tel__empty\">(no telemetry yet)</div>";
        return;
      }

      const html = [];
      for (const topic of topics) {
        const list = grouped.get(topic) || [];
        const last = list[list.length - 1];
        const sev = getSeverity(last);

        html.push(
          `<details class=\"cw-tel__topic cw-tel__topic--${sev}\" open>` +
          `<summary class=\"cw-tel__summary\">` +
          `<span class=\"cw-tel__summary-topic\">${topic}</span>` +
          `<span class=\"cw-tel__summary-count\">${list.length}</span>` +
          `</summary>`
        );

        html.push("<div class=\"cw-tel__lines\">");
        // show last N for each topic
        const tail = list.slice(-18);
        for (const evt of tail) {
          const renderer = getTelemetryRenderer(evt) || renderDefault;
          const rendered = renderer(evt);
          const fallback = rendered && typeof rendered === "object" ? rendered : renderDefault(evt);
          html.push(fallback.lineHtml);
          if (fallback.detailHtml) {
            html.push(`<div class=\"cw-tel__detail\">${fallback.detailHtml}</div>`);
          }
        }
        html.push("</div>");
        html.push("</details>");
      }

      el.innerHTML = html.join("");
    }

    _setStatus(text) {
      const el = this._hubsStatus?.dom?.el;
      if (el) el.textContent = text;
    }
  }

  return ToolsPanelControl;
}

module.exports = { createToolsPanelControl };
