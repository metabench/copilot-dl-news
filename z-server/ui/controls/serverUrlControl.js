"use strict";

function createServerUrlControl(jsgui, { StringControl }) {
  class ServerUrlControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "div",
        __type_name: "server_url"
      };
      super(normalized);
      this.add_class("zs-server-url");
      this.add_class("zs-server-url--hidden");
      
      this._url = spec.url || null;
      this._onClick = spec.onClick || null;
      this._visible = spec.visible || false;
      this._clickHandlerAttached = false;
      
      if (!spec.el) {
        this.compose();
      }
      this._syncState();
    }

    compose() {
      const ctx = this.context;
      
      const iconContainer = new jsgui.div({ context: ctx, class: "zs-server-url__icon" });
      const svg = new jsgui.Control({ context: ctx, tagName: "svg" });
      svg.dom.attributes.viewBox = "0 0 120 120";
      svg.dom.attributes.width = "120";
      svg.dom.attributes.height = "120";
      svg.add_class("zs-server-url__svg");
      
      const defs = new jsgui.Control({ context: ctx, tagName: "defs" });
      
      const outerGradient = new jsgui.Control({ context: ctx, tagName: "linearGradient" });
      outerGradient.dom.attributes.id = "outerRingGrad";
      outerGradient.dom.attributes.x1 = "0%";
      outerGradient.dom.attributes.y1 = "0%";
      outerGradient.dom.attributes.x2 = "100%";
      outerGradient.dom.attributes.y2 = "100%";
      const stop1 = new jsgui.Control({ context: ctx, tagName: "stop" });
      stop1.dom.attributes.offset = "0%";
      stop1.dom.attributes["stop-color"] = "#2dd4bf";
      const stop2 = new jsgui.Control({ context: ctx, tagName: "stop" });
      stop2.dom.attributes.offset = "50%";
      stop2.dom.attributes["stop-color"] = "#10b981";
      const stop3 = new jsgui.Control({ context: ctx, tagName: "stop" });
      stop3.dom.attributes.offset = "100%";
      stop3.dom.attributes["stop-color"] = "#059669";
      outerGradient.add(stop1);
      outerGradient.add(stop2);
      outerGradient.add(stop3);
      defs.add(outerGradient);
      
      const innerGradient = new jsgui.Control({ context: ctx, tagName: "radialGradient" });
      innerGradient.dom.attributes.id = "innerGlowGrad";
      innerGradient.dom.attributes.cx = "30%";
      innerGradient.dom.attributes.cy = "30%";
      const istop1 = new jsgui.Control({ context: ctx, tagName: "stop" });
      istop1.dom.attributes.offset = "0%";
      istop1.dom.attributes["stop-color"] = "#ffffff";
      const istop2 = new jsgui.Control({ context: ctx, tagName: "stop" });
      istop2.dom.attributes.offset = "60%";
      istop2.dom.attributes["stop-color"] = "#d1fae5";
      const istop3 = new jsgui.Control({ context: ctx, tagName: "stop" });
      istop3.dom.attributes.offset = "100%";
      istop3.dom.attributes["stop-color"] = "#34d399";
      innerGradient.add(istop1);
      innerGradient.add(istop2);
      innerGradient.add(istop3);
      defs.add(innerGradient);
      
      const pulseFilter = new jsgui.Control({ context: ctx, tagName: "filter" });
      pulseFilter.dom.attributes.id = "glow";
      const feGaussianBlur = new jsgui.Control({ context: ctx, tagName: "feGaussianBlur" });
      feGaussianBlur.dom.attributes.stdDeviation = "4";
      feGaussianBlur.dom.attributes.result = "coloredBlur";
      pulseFilter.add(feGaussianBlur);
      const feMerge = new jsgui.Control({ context: ctx, tagName: "feMerge" });
      const feMergeNode1 = new jsgui.Control({ context: ctx, tagName: "feMergeNode" });
      feMergeNode1.dom.attributes.in = "coloredBlur";
      const feMergeNode2 = new jsgui.Control({ context: ctx, tagName: "feMergeNode" });
      feMergeNode2.dom.attributes.in = "SourceGraphic";
      feMerge.add(feMergeNode1);
      feMerge.add(feMergeNode2);
      pulseFilter.add(feMerge);
      defs.add(pulseFilter);
      
      svg.add(defs);
      
      const outerRing = new jsgui.Control({ context: ctx, tagName: "circle" });
      outerRing.dom.attributes.cx = "60";
      outerRing.dom.attributes.cy = "60";
      outerRing.dom.attributes.r = "54";
      outerRing.dom.attributes.class = "zs-server-url__outer-ring";
      svg.add(outerRing);
      
      const middleRing = new jsgui.Control({ context: ctx, tagName: "circle" });
      middleRing.dom.attributes.cx = "60";
      middleRing.dom.attributes.cy = "60";
      middleRing.dom.attributes.r = "46";
      middleRing.dom.attributes.class = "zs-server-url__middle-ring";
      svg.add(middleRing);
      
      const innerCircle = new jsgui.Control({ context: ctx, tagName: "circle" });
      innerCircle.dom.attributes.cx = "60";
      innerCircle.dom.attributes.cy = "60";
      innerCircle.dom.attributes.r = "38";
      innerCircle.dom.attributes.class = "zs-server-url__inner-circle";
      svg.add(innerCircle);
      
      const checkMark = new jsgui.Control({ context: ctx, tagName: "path" });
      checkMark.dom.attributes.d = "M42 60 L54 72 L78 48";
      checkMark.dom.attributes.class = "zs-server-url__check";
      svg.add(checkMark);
      
      for (let i = 0; i < 8; i++) {
        const angle = (i * 45) * Math.PI / 180;
        const x1 = 60 + Math.cos(angle) * 48;
        const y1 = 60 + Math.sin(angle) * 48;
        const x2 = 60 + Math.cos(angle) * 56;
        const y2 = 60 + Math.sin(angle) * 56;
        const ray = new jsgui.Control({ context: ctx, tagName: "line" });
        ray.dom.attributes.x1 = String(x1);
        ray.dom.attributes.y1 = String(y1);
        ray.dom.attributes.x2 = String(x2);
        ray.dom.attributes.y2 = String(y2);
        ray.dom.attributes.class = "zs-server-url__ray";
        svg.add(ray);
      }
      
      iconContainer.add(svg);
      this.add(iconContainer);
      
      const urlWrapper = new jsgui.div({ context: ctx, class: "zs-server-url__wrapper" });
      
      const label = new jsgui.div({ context: ctx, class: "zs-server-url__label" });
      label.add(new StringControl({ context: ctx, text: "\u2726 SERVER RUNNING \u2726" }));
      urlWrapper.add(label);
      
      this._urlText = new jsgui.div({ context: ctx, class: "zs-server-url__text" });
      this._urlText.add(new StringControl({ context: ctx, text: this._url || "" }));
      urlWrapper.add(this._urlText);
      
      this.add(urlWrapper);
      
      const openBtn = new jsgui.div({ context: ctx, class: "zs-server-url__open-btn" });
      openBtn.add(new StringControl({ context: ctx, text: "OPEN IN BROWSER \u2192" }));
      this.add(openBtn);
    }

    _syncState() {
      if (this._visible && this._url) {
        this.remove_class("zs-server-url--hidden");
      } else {
        this.add_class("zs-server-url--hidden");
      }
    }
    
    _ensureClickHandler() {
      if (this._clickHandlerAttached) return;
      if (!this.dom.el || !this._onClick) return;
      
      console.log("[ServerUrlControl] Attaching click handler");
      this.dom.el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("[ServerUrlControl] CLICK! url:", this._url);
        if (this._url && this._onClick) {
          this._onClick(this._url);
        }
      });
      this._clickHandlerAttached = true;
      console.log("[ServerUrlControl] Click handler attached successfully");
    }

    setUrl(url) {
      this._url = url;
      
      if (this._urlText && this._urlText.dom.el) {
        this._urlText.dom.el.textContent = url || "";
      }
      
      this._syncState();
      
      if (this.dom.el) {
        if (url) {
          this.dom.el.classList.remove("zs-server-url--hidden");
          this._ensureClickHandler();
        } else {
          this.dom.el.classList.add("zs-server-url--hidden");
        }
      }
    }

    setVisible(visible) {
      this._visible = visible;
      this._syncState();
      
      if (this.dom.el) {
        if (visible && this._url) {
          this.dom.el.classList.remove("zs-server-url--hidden");
          this._ensureClickHandler();
        } else {
          this.dom.el.classList.add("zs-server-url--hidden");
        }
      }
    }

    getUrl() {
      return this._url;
    }

    activate() {
      console.log("[ServerUrlControl] activate() called, dom.el:", !!this.dom?.el);
      this._ensureClickHandler();
    }
  }

  return ServerUrlControl;
}

module.exports = { createServerUrlControl };
