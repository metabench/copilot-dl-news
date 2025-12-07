"use strict";

function createControlPanelControl(jsgui, { ControlButtonControl }) {
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

    activate() {
      this._startBtn.activate();
      this._stopBtn.activate();
    }
  }

  return ControlPanelControl;
}

module.exports = { createControlPanelControl };
