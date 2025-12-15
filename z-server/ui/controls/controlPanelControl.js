"use strict";

function createControlPanelControl(jsgui, { ControlButtonControl, StringControl }) {
  class ControlPanelControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "div",
        __type_name: "control_panel"
      };
      super(normalized);
      this.add_class("zs-control-panel");
      
      this._visible = spec.visible || false;
      this._serverRunning = spec.serverRunning || false;
      this._onStart = spec.onStart || null;
      this._onStop = spec.onStop || null;

      this._isUiServer = spec.isUiServer === true;
      this._uiClientStatus = spec.uiClientStatus || null;
      this._onRebuildUiClient = spec.onRebuildUiClient || null;

      this._autoRebuildUiClient = spec.autoRebuildUiClient === true;
      this._onToggleAutoRebuildUiClient = spec.onToggleAutoRebuildUiClient || null;
      
      if (!spec.el) {
        this.compose();
      }
      this._syncState();
    }

    compose() {
      const ctx = this.context;
      
      this._startBtn = new ControlButtonControl({
        context: ctx,
        label: "\u25b6 Start Server",
        variant: "start",
        disabled: this._serverRunning,
        onClick: () => this._onStart && this._onStart()
      });
      this.add(this._startBtn);
      
      this._stopBtn = new ControlButtonControl({
        context: ctx,
        label: "\u25a0 Stop Server",
        variant: "stop",
        disabled: !this._serverRunning,
        onClick: () => this._onStop && this._onStop()
      });
      this.add(this._stopBtn);

      this._rebuildUiBtn = new ControlButtonControl({
        context: ctx,
        label: "\ud83d\udd28 Rebuild UI",
        variant: "rebuild",
        disabled: true,
        onClick: () => this._onRebuildUiClient && this._onRebuildUiClient()
      });
      this.add(this._rebuildUiBtn);

      this._autoRebuildWrap = new jsgui.div({ context: ctx, class: "zs-autorebuild zs-control-panel__autorebuild" });
      this._autoRebuildLabel = new jsgui.Control({ context: ctx, tagName: "label", class: "zs-autorebuild__label" });
      this._autoRebuildCheckbox = new jsgui.Control({ context: ctx, tagName: "input", class: "zs-autorebuild__checkbox" });
      this._autoRebuildCheckbox.dom.attributes.type = "checkbox";
      if (this._autoRebuildUiClient) {
        this._autoRebuildCheckbox.dom.attributes.checked = "checked";
      }
      this._autoRebuildText = new jsgui.span({ context: ctx, class: "zs-autorebuild__text" });
      this._autoRebuildText.add(new StringControl({ context: ctx, text: "Auto rebuild UI on start" }));

      this._autoRebuildLabel.add(this._autoRebuildCheckbox);
      this._autoRebuildLabel.add(this._autoRebuildText);
      this._autoRebuildWrap.add(this._autoRebuildLabel);
      this.add(this._autoRebuildWrap);

      this._syncUiControls();
    }

    _syncUiControls() {
      const isUi = this._isUiServer === true;

      if (this._rebuildUiBtn) {
        if (isUi) {
          this._rebuildUiBtn.remove_class("zs-hidden");
        } else {
          this._rebuildUiBtn.add_class("zs-hidden");
        }
      }

      if (this._autoRebuildWrap) {
        if (isUi) {
          this._autoRebuildWrap.remove_class("zs-hidden");
        } else {
          this._autoRebuildWrap.add_class("zs-hidden");
        }
      }

      this._syncUiClientStatus();
    }

    _syncUiClientStatus() {
      if (!this._rebuildUiBtn) return;

      if (!this._isUiServer) {
        this._rebuildUiBtn.setDisabled(true);
        return;
      }

      const status = this._uiClientStatus;
      if (!status || typeof status !== "object") {
        this._rebuildUiBtn.setDisabled(true);
        return;
      }

      this._rebuildUiBtn.setDisabled(status.needsBuild !== true);
    }

    _syncState() {
      if (this._visible) {
        this.remove_class("zs-control-panel--hidden");
      } else {
        this.add_class("zs-control-panel--hidden");
      }
    }

    setVisible(visible) {
      this._visible = visible;
      this._syncState();
      
      if (this.dom.el) {
        if (visible) {
          this.dom.el.classList.remove("zs-control-panel--hidden");
        } else {
          this.dom.el.classList.add("zs-control-panel--hidden");
        }
      }
    }

    setServerRunning(running) {
      this._serverRunning = running;
      this._startBtn.setDisabled(running);
      this._stopBtn.setDisabled(!running);
    }

    setUiServer(isUiServer) {
      this._isUiServer = isUiServer === true;
      this._syncUiControls();

      if (this.dom.el) {
        const rebuildBtn = this.dom.el.querySelector(".zs-btn--rebuild");
        const wrap = this.dom.el.querySelector(".zs-control-panel__autorebuild");
        if (rebuildBtn) {
          rebuildBtn.classList.toggle("zs-hidden", !this._isUiServer);
        }
        if (wrap) {
          wrap.classList.toggle("zs-hidden", !this._isUiServer);
        }
      }
    }

    setUiClientStatus(status) {
      this._uiClientStatus = status;
      this._syncUiClientStatus();
    }

    setAutoRebuildUiClient(enabled) {
      this._autoRebuildUiClient = enabled === true;

      if (this._autoRebuildCheckbox) {
        if (this._autoRebuildUiClient) {
          this._autoRebuildCheckbox.dom.attributes.checked = "checked";
        } else {
          delete this._autoRebuildCheckbox.dom.attributes.checked;
        }
      }

      if (this.dom.el) {
        const el = this.dom.el.querySelector(".zs-autorebuild__checkbox");
        if (el) el.checked = this._autoRebuildUiClient;
      }
    }

    activate() {
      this._startBtn.activate();
      this._stopBtn.activate();
      this._rebuildUiBtn.activate();

      if (this.dom.el) {
        const checkbox = this.dom.el.querySelector(".zs-autorebuild__checkbox");
        if (checkbox && !checkbox.__zsBound) {
          checkbox.checked = this._autoRebuildUiClient;
          checkbox.addEventListener("change", () => {
            const enabled = checkbox.checked === true;
            this._autoRebuildUiClient = enabled;
            if (this._onToggleAutoRebuildUiClient) {
              this._onToggleAutoRebuildUiClient(enabled);
            }
          });
          checkbox.__zsBound = true;
        }
      }
    }
  }

  return ControlPanelControl;
}

module.exports = { createControlPanelControl };
