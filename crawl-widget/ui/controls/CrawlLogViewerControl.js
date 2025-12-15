"use strict";

const { getBodyControl } = require("./controlUtils");

function createCrawlLogViewerControl(jsgui) {
  const StringControl = jsgui.String_Control;
  class CrawlLogViewerControl extends jsgui.Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: "div" });
      this.add_class("cw-log-viewer");
      this._maxLines = spec.maxLines || 50;
      this._visibleLines = spec.visibleLines || 6;
      this._lines = [];

      this._activityTypes = [
        { id: "downloaded", icon: "✓", label: "Downloaded", color: "emerald" },
        { id: "queued", icon: "➕", label: "Queued", color: "sapphire" },
        { id: "skipped", icon: "⏭️", label: "Skipped", color: "dim" },
        { id: "error", icon: "⚠️", label: "Errors", color: "ruby" },
        { id: "throttled", icon: "🔴", label: "Throttled", color: "gold" },
        { id: "discovery", icon: "🔍", label: "Discovery", color: "amethyst" },
        { id: "pagination", icon: "📄", label: "Pagination", color: "sapphire" },
        { id: "started", icon: "▶️", label: "Started", color: "emerald" },
        { id: "finished", icon: "⏹️", label: "Finished", color: "gold" },
        { id: "crawling", icon: "🕷️", label: "Crawling", color: "text" },
        { id: "info", icon: "•", label: "Info", color: "text" }
      ];
      this._activeFilters = new Set(this._activityTypes.map((t) => t.id));
      this._filterPopupVisible = false;

      if (!spec.el) this.compose();
    }

    compose() {
      this._header = new jsgui.Control({ context: this.context, tagName: "div" });
      this._header.add_class("cw-log-viewer__header");
      this.add(this._header);

      const headerLabel = new jsgui.Control({ context: this.context, tagName: "span" });
      headerLabel.add_class("cw-log-viewer__label");
      headerLabel.add(new StringControl({ context: this.context, text: "Log" }));
      this._header.add(headerLabel);

      this._filterBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._filterBtn.add_class("cw-log-filter-btn");
      this._filterBtn.add(new StringControl({ context: this.context, text: "🔽" }));
      this._filterBtn.set("title", "Filter log types");
      this._header.add(this._filterBtn);

      this._copyBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._copyBtn.add_class("cw-log-action-btn");
      this._copyBtn.add_class("cw-log-action-btn--copy");
      this._copyBtn.add(new StringControl({ context: this.context, text: "⧉" }));
      this._copyBtn.dom.attributes.title = "Copy visible log lines";
      this._header.add(this._copyBtn);

      this._clearBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._clearBtn.add_class("cw-log-action-btn");
      this._clearBtn.add_class("cw-log-action-btn--clear");
      this._clearBtn.add(new StringControl({ context: this.context, text: "🗑" }));
      this._clearBtn.dom.attributes.title = "Clear log";
      this._header.add(this._clearBtn);

      this._filterBadge = new jsgui.Control({ context: this.context, tagName: "span" });
      this._filterBadge.add_class("cw-log-filter-badge");
      this._filterBadge.add_class("cw-hidden");
      this._header.add(this._filterBadge);

      this._filterPopup = new jsgui.Control({ context: this.context, tagName: "div" });
      this._filterPopup.add_class("cw-log-filter-popup");
      this._filterPopup.add_class("cw-hidden");
      this.add(this._filterPopup);

      const popupHeader = new jsgui.Control({ context: this.context, tagName: "div" });
      popupHeader.add_class("cw-log-filter-popup__header");
      this._filterPopup.add(popupHeader);

      this._allBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._allBtn.add_class("cw-log-filter-popup__quick-btn");
      this._allBtn.add(new StringControl({ context: this.context, text: "All" }));
      popupHeader.add(this._allBtn);

      this._noneBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._noneBtn.add_class("cw-log-filter-popup__quick-btn");
      this._noneBtn.add(new StringControl({ context: this.context, text: "None" }));
      popupHeader.add(this._noneBtn);

      this._checkboxContainer = new jsgui.Control({ context: this.context, tagName: "div" });
      this._checkboxContainer.add_class("cw-log-filter-popup__list");
      this._filterPopup.add(this._checkboxContainer);

      this._checkboxes = {};
      for (const type of this._activityTypes) {
        const row = new jsgui.Control({ context: this.context, tagName: "label" });
        row.add_class("cw-log-filter-popup__item");
        row.add_class(`cw-log-filter-popup__item--${type.color}`);

        const checkbox = new jsgui.Control({ context: this.context, tagName: "input" });
        checkbox.set("type", "checkbox");
        checkbox.set("checked", true);
        checkbox.set("data-type", type.id);
        row.add(checkbox);
        this._checkboxes[type.id] = checkbox;

        const icon = new jsgui.Control({ context: this.context, tagName: "span" });
        icon.add_class("cw-log-filter-popup__icon");
        icon.add(new StringControl({ context: this.context, text: type.icon }));
        row.add(icon);

        const label = new jsgui.Control({ context: this.context, tagName: "span" });
        label.add(new StringControl({ context: this.context, text: type.label }));
        row.add(label);

        this._checkboxContainer.add(row);
      }

      this._logContainer = new jsgui.Control({ context: this.context, tagName: "div" });
      this._logContainer.add_class("cw-log-viewer__container");
      this.add(this._logContainer);
    }

    _getVisibleLines() {
      const filteredLines = this._lines.filter((line) => this._activeFilters.has(line.activityType));
      const visibleCount = Math.max(3, this._visibleLines || 3);
      return filteredLines.slice(-visibleCount);
    }

    async _copyVisibleLines() {
      const visible = this._getVisibleLines();
      const text = visible
        .map((line) => `[${line.timestamp}] ${line.text}`)
        .join("\n")
        .trim();

      if (!text) return;

      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return;
        }

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "readonly");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch (err) {
        console.warn("[CrawlWidget] Failed to copy log lines:", err?.message || err);
      }
    }

    addLine(text, type = "stdout") {
      const timestamp = new Date().toLocaleTimeString("en-GB", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });

      const activityType = this._detectActivityType(text);

      const line = { timestamp, text: text.trim(), type, activityType };
      this._lines.push(line);

      if (this._lines.length > this._maxLines) {
        this._lines = this._lines.slice(-this._maxLines);
      }

      const containerEl = this._el(this._logContainer);
      if (containerEl) {
        this._renderLines(containerEl);
      }
    }

    _detectActivityType(text) {
      const lower = text.toLowerCase();

      if (lower.includes("downloaded") || lower.includes("saved article")) return "downloaded";
      if (lower.includes("queued") || lower.includes("enqueued") || lower.includes("added to queue")) return "queued";
      if (lower.includes("skipped") || lower.includes("already visited") || lower.includes("filtered")) return "skipped";
      if (lower.includes("error") || lower.includes("failed") || lower.includes("exception")) return "error";
      if (lower.includes("rate limit") || lower.includes("429") || lower.includes("throttle")) return "throttled";
      if (lower.includes("sitemap") || lower.includes("archive")) return "discovery";
      if (lower.includes("page=") || lower.includes("/page/")) return "pagination";
      if (lower.includes("started") || lower.includes("beginning")) return "started";
      if (lower.includes("finished") || lower.includes("completed") || lower.includes("stopped")) return "finished";
      if (lower.includes("crawling") || lower.includes("fetching")) return "crawling";

      return "info";
    }

    _getActivityIcon(activityType) {
      const icons = {
        downloaded: "✓",
        queued: "➕",
        skipped: "⏭️",
        error: "⚠️",
        throttled: "🔴",
        discovery: "🔍",
        pagination: "📄",
        started: "▶️",
        finished: "⏹️",
        crawling: "🕷️",
        info: "•"
      };
      return icons[activityType] || "•";
    }

    _renderLines(containerEl) {
      const visibleLines = this._getVisibleLines();

      while (containerEl.firstChild) {
        containerEl.removeChild(containerEl.firstChild);
      }

      visibleLines.forEach((line) => {
        const lineEl = document.createElement("div");
        lineEl.className = `cw-log-line cw-log-line--${line.type} cw-log-line--${line.activityType}`;

        const iconEl = document.createElement("span");
        iconEl.className = "cw-log-line__icon";
        iconEl.textContent = this._getActivityIcon(line.activityType);
        lineEl.appendChild(iconEl);

        const timeEl = document.createElement("span");
        timeEl.className = "cw-log-line__time";
        timeEl.textContent = line.timestamp;
        lineEl.appendChild(timeEl);

        const textEl = document.createElement("span");
        textEl.className = "cw-log-line__text";
        textEl.textContent = line.text;
        textEl.title = line.text;
        lineEl.appendChild(textEl);

        containerEl.appendChild(lineEl);
      });

      containerEl.scrollTop = containerEl.scrollHeight;
    }

    _updateFilterBadge() {
      const badgeEl = this._el(this._filterBadge);
      if (!badgeEl) return;

      const activeCount = this._activeFilters.size;
      const totalCount = this._activityTypes.length;

      if (activeCount < totalCount) {
        badgeEl.textContent = `${activeCount}/${totalCount}`;
        badgeEl.classList.remove("cw-hidden");
      } else {
        badgeEl.classList.add("cw-hidden");
      }
    }

    _toggleFilterPopup() {
      this._filterPopupVisible = !this._filterPopupVisible;
      const popupEl = this._el(this._filterPopup);
      if (popupEl) {
        popupEl.classList.toggle("cw-hidden", !this._filterPopupVisible);
      }
    }

    _closeFilterPopup() {
      this._filterPopupVisible = false;
      const popupEl = this._el(this._filterPopup);
      if (popupEl) {
        popupEl.classList.add("cw-hidden");
      }
    }

    _setAllFilters(enabled) {
      if (enabled) {
        this._activeFilters = new Set(this._activityTypes.map((t) => t.id));
      } else {
        this._activeFilters.clear();
      }

      for (const type of this._activityTypes) {
        const checkbox = this._checkboxes[type.id];
        const el = this._el(checkbox);
        if (el) el.checked = enabled;
      }

      this._updateFilterBadge();
      const containerEl = this._el(this._logContainer);
      if (containerEl) this._renderLines(containerEl);
    }

    _handleFilterChange(typeId, checked) {
      if (checked) {
        this._activeFilters.add(typeId);
      } else {
        this._activeFilters.delete(typeId);
      }

      this._updateFilterBadge();
      const containerEl = this._el(this._logContainer);
      if (containerEl) this._renderLines(containerEl);
    }

    clear() {
      this._lines = [];
      const containerEl = this._el(this._logContainer);
      if (containerEl) containerEl.innerHTML = "";
    }

    _el(ctrl = this) {
      return ctrl?.dom?.el || null;
    }

    activate() {
      if (this.__active) return;
      super.activate();

      this._filterBtn?.on("click", (e) => {
        e.stopPropagation();
        this._toggleFilterPopup();
      });

      this._copyBtn?.on("click", async (e) => {
        e?.stopPropagation?.();
        await this._copyVisibleLines();
      });

      this._clearBtn?.on("click", (e) => {
        e?.stopPropagation?.();
        this.clear();
      });

      this._allBtn?.on("click", () => this._setAllFilters(true));
      this._noneBtn?.on("click", () => this._setAllFilters(false));

      for (const type of this._activityTypes) {
        const checkbox = this._checkboxes[type.id];
        checkbox?.on("change", (e) => {
          this._handleFilterChange(type.id, e?.target?.checked);
        });
      }

      const bodyCtrl = getBodyControl(this.context);
      const handleBodyClick = (evt) => {
        const popupEl = this._el(this._filterPopup);
        const filterBtnEl = this._el(this._filterBtn);
        const target = evt?.target;
        if (!popupEl || !filterBtnEl) return;
        if (popupEl.contains(target)) return;
        if (filterBtnEl.contains && filterBtnEl.contains(target)) return;
        this._closeFilterPopup();
      };

      if (bodyCtrl?.on) {
        bodyCtrl.on("click", handleBodyClick);
      } else {
        const bodyEl = bodyCtrl?.dom?.el || bodyCtrl || this.context?.document?.body;
        if (bodyEl?.addEventListener) {
          bodyEl.addEventListener("click", handleBodyClick);
        }
      }
    }
  }

  return CrawlLogViewerControl;
}

module.exports = { createCrawlLogViewerControl };
