"use strict";

const { createWidgetTitleBarControl } = require("./controls/WidgetTitleBarControl");
const { createCrawlTypeSelectorControl } = require("./controls/CrawlTypeSelectorControl");
const { createStartUrlSelectorControl } = require("./controls/StartUrlSelectorControl");
const { createCrawlControlButtonsControl } = require("./controls/CrawlControlButtonsControl");
const { createCrawlProgressPanelControl } = require("./controls/CrawlProgressPanelControl");
const { createCrawlLogViewerControl } = require("./controls/CrawlLogViewerControl");
const { createProgressBarControl } = require("./ProgressBarControl");

/**
 * Create all crawl widget controls
 * @param {object} jsgui - jsgui3-client instance
 * @returns {object} Control classes and style builder
 */
function createCrawlWidgetControls(jsgui) {
  if (!jsgui) {
    throw new Error("jsgui instance required");
  }

  const WidgetTitleBarControl = createWidgetTitleBarControl(jsgui);
  const CrawlTypeSelectorControl = createCrawlTypeSelectorControl(jsgui);
  const StartUrlSelectorControl = createStartUrlSelectorControl(jsgui);
  const CrawlControlButtonsControl = createCrawlControlButtonsControl(jsgui);
  const ProgressBarControl = createProgressBarControl(jsgui);
  const CrawlProgressPanelControl = createCrawlProgressPanelControl(jsgui, ProgressBarControl);
  const CrawlLogViewerControl = createCrawlLogViewerControl(jsgui);

  class CrawlWidgetAppControl extends jsgui.Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: "div" });
      this.add_class("cw-app");
      this._api = spec.api || null;
      if (!spec.el) this.compose();
    }

    compose() {
      this._titleBar = new WidgetTitleBarControl({
        context: this.context,
        api: this._api
      });
      this.add(this._titleBar);

      this._typeSelector = new CrawlTypeSelectorControl({
        context: this.context,
        crawlTypes: [],
        selectedType: "basic",
        onTypeChange: (typeId) => {
          console.log("[CrawlWidget] Type changed:", typeId);
        }
      });
      this.add(this._typeSelector);

      this._urlSelector = new StartUrlSelectorControl({
        context: this.context,
        sources: [],
        selectedUrl: "",
        api: this._api,
        onUrlChange: (url, source) => {
          console.log("[CrawlWidget] URL changed:", url, source?.label);
        }
      });
      this.add(this._urlSelector);

      this._controlButtons = new CrawlControlButtonsControl({
        context: this.context,
        api: this._api,
        getSelectedType: () => this._typeSelector.getSelectedType(),
        getSelectedUrl: () => this._urlSelector.getSelectedUrl(),
        onStateChange: (state) => {
          console.log("[CrawlWidget] State:", state);
          if (state === "stopped") {
            this._progressPanel.updateProgress({ visited: 0, queued: 0, errors: 0, articles: 0 });
            this._progressPanel.setIdle();
          } else if (state === "started") {
            this._logViewer.clear();
            this._logViewer.addLine("Crawl started", "system");
          }
        }
      });
      this.add(this._controlButtons);

      this._progressPanel = new CrawlProgressPanelControl({
        context: this.context
      });
      this.add(this._progressPanel);

      this._logViewer = new CrawlLogViewerControl({
        context: this.context,
        maxLines: 50,
        visibleLines: 8
      });
      this.add(this._logViewer);
    }

    async init() {
      if (!this._api) {
        console.error("[CrawlWidget] No API available");
        return;
      }

      try {
        const types = await this._api.getCrawlTypes();
        this._typeSelector.setTypes(types);
        this._typeSelector._crawlTypes = types;
        console.log("[CrawlWidget] Loaded crawl types:", types.length);
      } catch (err) {
        console.error("[CrawlWidget] Failed to load types:", err);
      }

      try {
        const result = await this._api.getNewsSources();
        if (result.success && result.sources.length > 0) {
          this._urlSelector.setSources(result.sources);
          console.log("[CrawlWidget] Loaded news sources:", result.sources.length);
        }
      } catch (err) {
        console.error("[CrawlWidget] Failed to load news sources:", err);
      }

      if (this._api.onCrawlLog) {
        this._api.onCrawlLog((data) => {
          this._logViewer.addLine(data.data, data.type);
        });
      }

      if (this._api.onCrawlProgress) {
        this._api.onCrawlProgress((progress) => {
          this._progressPanel.updateProgress(progress);
        });
      }

      if (this._api.onCrawlStopped) {
        this._api.onCrawlStopped((data) => {
          this._controlButtons.setRunning(false);
          this._controlButtons.setPaused(false);
          this._logViewer.addLine(`Crawl stopped (code: ${data.code})`, "system");
        });
      }

      if (this._api.onCrawlError) {
        this._api.onCrawlError((data) => {
          this._logViewer.addLine(`Error: ${data.message}`, "stderr");
        });
      }

      const status = await this._api.getCrawlStatus();
      if (status.isRunning) {
        this._controlButtons.setRunning(true);
      }
    }

    _el(ctrl = this) {
      return ctrl?.dom?.el || null;
    }

    activate() {
      if (this.__active) return;
      super.activate();
      console.log("[CrawlWidgetApp] activate called, children should be activated");
    }
  }

  return {
    WidgetTitleBarControl,
    CrawlTypeSelectorControl,
    StartUrlSelectorControl,
    CrawlControlButtonsControl,
    CrawlProgressPanelControl,
    CrawlLogViewerControl,
    CrawlWidgetAppControl,
    ProgressBarControl
  };
}

module.exports = { createCrawlWidgetControls };
