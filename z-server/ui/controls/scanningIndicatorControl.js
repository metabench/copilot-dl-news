"use strict";

function createScanningIndicatorControl(jsgui, { StringControl }) {
  class ScanningIndicatorControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "div",
        __type_name: "scanning_indicator"
      };
      super(normalized);
      this.add_class("zs-scanning");
      
      this._total = 0;
      this._current = 0;
      this._currentFile = "";
      this._isCounting = false;
      this._countTick = 0;
      
      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      const ctx = this.context;
      
      const svg = new jsgui.Control({ context: ctx, tagName: "svg" });
      svg.dom.attributes.viewBox = "0 0 100 100";
      svg.add_class("zs-scanning__svg");
      
      const ring = new jsgui.Control({ context: ctx, tagName: "circle" });
      ring.dom.attributes.cx = "50";
      ring.dom.attributes.cy = "50";
      ring.dom.attributes.r = "45";
      ring.dom.attributes.class = "zs-scanning__ring";
      svg.add(ring);
      
      const innerRing = new jsgui.Control({ context: ctx, tagName: "circle" });
      innerRing.dom.attributes.cx = "50";
      innerRing.dom.attributes.cy = "50";
      innerRing.dom.attributes.r = "30";
      innerRing.dom.attributes.class = "zs-scanning__ring-inner";
      svg.add(innerRing);
      
      const sweep = new jsgui.Control({ context: ctx, tagName: "path" });
      sweep.dom.attributes.d = "M50 50 L50 5 A45 45 0 0 1 95 50 Z";
      sweep.dom.attributes.class = "zs-scanning__sweep";
      svg.add(sweep);
      
      const dot = new jsgui.Control({ context: ctx, tagName: "circle" });
      dot.dom.attributes.cx = "50";
      dot.dom.attributes.cy = "50";
      dot.dom.attributes.r = "4";
      dot.dom.attributes.class = "zs-scanning__dot";
      svg.add(dot);
      
      this.add(svg);
      
      const text = new jsgui.div({ context: ctx, class: "zs-scanning__text" });
      text.add(new StringControl({ context: ctx, text: "SCANNING FOR SERVERS..." }));
      this.add(text);
      this._textEl = text;
      
      const progressContainer = new jsgui.div({ context: ctx, class: "zs-scanning__progress-container" });
      
      const progressBg = new jsgui.div({ context: ctx, class: "zs-scanning__progress-bg" });
      
      const progressFill = new jsgui.div({ context: ctx, class: "zs-scanning__progress-fill" });
      progressBg.add(progressFill);
      this._progressFillEl = progressFill;
      
      progressContainer.add(progressBg);
      
      const progressText = new jsgui.div({ context: ctx, class: "zs-scanning__progress-text" });
      progressText.add(new StringControl({ context: ctx, text: "Counting files..." }));
      progressContainer.add(progressText);
      this._progressTextEl = progressText;
      
      this.add(progressContainer);
      
      const subtitle = new jsgui.div({ context: ctx, class: "zs-scanning__subtitle" });
      subtitle.add(new StringControl({ context: ctx, text: "Analyzing JavaScript files in repository" }));
      this.add(subtitle);
      this._subtitleEl = subtitle;
    }

    setTotal(total) {
      this._total = total;
      this._current = 0;
      // Once we know the total, we can switch from counting (indeterminate)
      // to determinate progress immediately.
      this._isCounting = false;
      this._updateProgress();
    }

    startCounting() {
      this._isCounting = true;
      this._current = 0;
      this._total = 0;
      this._currentFile = "";
      this._countTick = 0;
      this._updateCountingProgress();
    }

    setCountingProgress(current, file) {
      this._isCounting = true;
      this._current = current;
      this._currentFile = file || "";
      this._countTick++;
      this._updateCountingProgress();
    }

    setProgress(current, total, file) {
      this._isCounting = false;
      this._current = current;
      this._total = total || this._total;
      this._currentFile = file || "";
      this._updateProgress();
    }

    _updateProgress() {
      if (this._isCounting) {
        this._updateCountingProgress();
        return;
      }
      const percent = this._total > 0 ? (this._current / this._total) * 100 : 0;
      
      if (!this._progressFillEl?.dom?.el && this.dom.el) {
        this.ensureDomRefs();
      }
      
      if (this._progressFillEl && this._progressFillEl.dom.el) {
        this._progressFillEl.dom.el.style.width = `${percent}%`;
      }
      
      if (this._progressTextEl && this._progressTextEl.dom.el) {
        if (this._total > 0) {
          this._progressTextEl.dom.el.textContent = `${this._current} / ${this._total} files`;
        } else {
          this._progressTextEl.dom.el.textContent = "Counting files...";
        }
      }
      
      if (this._subtitleEl && this._subtitleEl.dom.el && this._currentFile) {
        const displayFile = this._currentFile.length > 50 
          ? "..." + this._currentFile.slice(-47) 
          : this._currentFile;
        this._subtitleEl.dom.el.textContent = displayFile;
      } else if (this._subtitleEl && this._subtitleEl.dom.el && !this._currentFile) {
        this._subtitleEl.dom.el.textContent = "Analyzing JavaScript files in repository";
      }
    }

    _updateCountingProgress() {
      // Indeterminate-style progress during counting with a pulsing width
      const percent = ((this._countTick % 40) / 40) * 100;
      if (this._progressFillEl && this._progressFillEl.dom.el) {
        this._progressFillEl.dom.el.style.width = `${percent}%`;
      }
      if (this._progressTextEl && this._progressTextEl.dom.el) {
        const countLabel = this._current > 0 ? `Counting files (${this._current})...` : "Counting files...";
        this._progressTextEl.dom.el.textContent = countLabel;
      }
      if (this._subtitleEl && this._subtitleEl.dom.el) {
        if (this._currentFile) {
          const displayFile = this._currentFile.length > 50 
            ? "..." + this._currentFile.slice(-47) 
            : this._currentFile;
          this._subtitleEl.dom.el.textContent = displayFile;
        } else {
          this._subtitleEl.dom.el.textContent = "Scanning repository...";
        }
      }
    }

    reset() {
      this._total = 0;
      this._current = 0;
      this._currentFile = "";
      this._isCounting = false;
      this._countTick = 0;
      
      if (this._progressFillEl && this._progressFillEl.dom.el) {
        this._progressFillEl.dom.el.style.width = "0%";
      }
      if (this._progressTextEl && this._progressTextEl.dom.el) {
        this._progressTextEl.dom.el.textContent = "Counting files...";
      }
      if (this._subtitleEl && this._subtitleEl.dom.el) {
        this._subtitleEl.dom.el.textContent = "Analyzing JavaScript files in repository";
      }
    }

    ensureDomRefs() {
      const rootEl = this.dom.el;
      if (!rootEl) return;
      
      if (this._progressFillEl && !this._progressFillEl.dom.el) {
        const fillEl = rootEl.querySelector('.zs-scanning__progress-fill');
        if (fillEl) this._progressFillEl.dom.el = fillEl;
      }
      
      if (this._progressTextEl && !this._progressTextEl.dom.el) {
        const textEl = rootEl.querySelector('.zs-scanning__progress-text');
        if (textEl) this._progressTextEl.dom.el = textEl;
      }
      
      if (this._subtitleEl && !this._subtitleEl.dom.el) {
        const subEl = rootEl.querySelector('.zs-scanning__subtitle');
        if (subEl) this._subtitleEl.dom.el = subEl;
      }
      
      console.log("[ScanningIndicator] ensureDomRefs: progressFill=", !!this._progressFillEl?.dom?.el,
                  "progressText=", !!this._progressTextEl?.dom?.el,
                  "subtitle=", !!this._subtitleEl?.dom?.el);
    }
  }

  return ScanningIndicatorControl;
}

module.exports = { createScanningIndicatorControl };
