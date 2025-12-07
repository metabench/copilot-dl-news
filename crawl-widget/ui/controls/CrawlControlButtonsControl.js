"use strict";

function createCrawlControlButtonsControl(jsgui) {
  const StringControl = jsgui.String_Control;

  class CrawlControlButtonsControl extends jsgui.Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: "div" });
      this.add_class("cw-control-buttons");
      this._api = spec.api || null;
      this._onStateChange = spec.onStateChange || null;
      this._isRunning = false;
      this._isPaused = false;
      this._getSelectedType = spec.getSelectedType || (() => "standard");
      this._getSelectedUrl = spec.getSelectedUrl || (() => "");
      if (!spec.el) this.compose();
    }

    compose() {
      this._startBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._startBtn.add_class("cw-btn", "cw-btn--start");
      this._startBtn.add(new StringControl({ context: this.context, text: "▶ CRAWL" }));

      this._pauseBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._pauseBtn.add_class("cw-btn", "cw-btn--pause");
      this._pauseBtn.dom.attributes.disabled = "disabled";
      this._pauseBtn.add(new StringControl({ context: this.context, text: "⏸ PAUSE" }));

      this._stopBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._stopBtn.add_class("cw-btn", "cw-btn--stop");
      this._stopBtn.dom.attributes.disabled = "disabled";
      this._stopBtn.add(new StringControl({ context: this.context, text: "■ STOP" }));

      this.add(this._startBtn);
      this.add(this._pauseBtn);
      this.add(this._stopBtn);
    }

    setRunning(running) {
      this._isRunning = running;
      this._updateButtonStates();
    }

    setPaused(paused) {
      this._isPaused = paused;
      this._updateButtonStates();
    }

    _updateButtonStates() {
      const startEl = this._el(this._startBtn);
      const pauseEl = this._el(this._pauseBtn);
      const stopEl = this._el(this._stopBtn);

      if (startEl) {
        startEl.disabled = this._isRunning;
        startEl.classList.toggle("cw-btn--disabled", this._isRunning);
      }

      if (pauseEl) {
        pauseEl.disabled = !this._isRunning;
        pauseEl.classList.toggle("cw-btn--disabled", !this._isRunning);
        pauseEl.textContent = this._isPaused ? "▶ RESUME" : "⏸ PAUSE";
      }

      if (stopEl) {
        stopEl.disabled = !this._isRunning;
        stopEl.classList.toggle("cw-btn--disabled", !this._isRunning);
      }
    }

    _el(ctrl = this) {
      return ctrl?.dom?.el || null;
    }

    activate() {
      if (this.__active) return;
      super.activate();

      console.log("[ControlButtons] activate - start:", !!this._startBtn, "pause:", !!this._pauseBtn, "stop:", !!this._stopBtn);

      this._startBtn?.on("click", async () => {
        if (this._api?.startCrawl) {
          const crawlType = this._getSelectedType();
          const startUrl = this._getSelectedUrl();
          const result = await this._api.startCrawl({ crawlType, startUrl });
          if (result.success) {
            this.setRunning(true);
            this.setPaused(false);
            if (this._onStateChange) {
              this._onStateChange({ running: true, paused: false });
            }
          }
        }
      });

      this._pauseBtn?.on("click", async () => {
        if (this._api?.togglePause) {
          await this._api.togglePause();
          this._isPaused = !this._isPaused;
          this._updateButtonStates();
          if (this._onStateChange) {
            this._onStateChange({ running: this._isRunning, paused: this._isPaused });
          }
        }
      });

      this._stopBtn?.on("click", async () => {
        if (this._api?.stopCrawl) {
          await this._api.stopCrawl();
          this.setRunning(false);
          this.setPaused(false);
          if (this._onStateChange) {
            this._onStateChange({ running: false, paused: false });
          }
        }
      });
    }
  }

  return CrawlControlButtonsControl;
}

module.exports = { createCrawlControlButtonsControl };
