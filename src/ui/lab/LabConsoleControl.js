"use strict";

const jsgui = require("jsgui3-html");
const manifest = require("./manifest.json");

class LabConsoleControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div", __type_name: "lab_console" });
    this.context = spec.context || this.context;
    this._manifest = spec.manifest || manifest;
    if (!spec.el) this.compose();
  }

  compose() {
    const ctx = this.context;
    this.add_class("lab-console");
    this.add(this._styleBlock());
    this.add(this._header(ctx));
    this.add(this._experimentList(ctx));
  }

  _styleBlock() {
    const style = new jsgui.Control({ context: this.context, tagName: "style" });
    style.add_text(`
      .lab-console { font-family: "Inter", "Segoe UI", sans-serif; color: #e2e8f0; background: linear-gradient(135deg, #0b1220, #0f172a); border: 1px solid #1f2937; border-radius: 14px; padding: 18px; box-shadow: 0 10px 40px rgba(0,0,0,0.35); max-width: 960px; margin: 0 auto; }
      .lab-console__header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
      .lab-console__title { font-size: 20px; font-weight: 700; letter-spacing: 0.3px; }
      .lab-console__subtitle { font-size: 14px; color: #94a3b8; }
      .lab-console__pill { padding: 4px 10px; border-radius: 999px; background: rgba(59,130,246,0.18); color: #bfdbfe; font-size: 12px; border: 1px solid rgba(59,130,246,0.4); }
      .lab-console__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
      .lab-card { background: rgba(255,255,255,0.02); border: 1px solid #1f2937; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 12px 30px rgba(0,0,0,0.25); }
      .lab-card__row { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
      .lab-card__title { font-weight: 700; font-size: 16px; color: #f8fafc; }
      .lab-card__meta { display: flex; gap: 6px; align-items: center; color: #cbd5e1; font-size: 12px; }
      .lab-card__desc { color: #cbd5e1; font-size: 13px; line-height: 1.4; }
      .lab-card__actions { display: flex; flex-wrap: wrap; gap: 6px; }
      .lab-chip { padding: 4px 8px; border-radius: 999px; font-size: 12px; border: 1px solid #1e293b; color: #e2e8f0; }
      .lab-chip--validated { background: rgba(16,185,129,0.18); border-color: rgba(16,185,129,0.5); color: #bbf7d0; }
      .lab-chip--active { background: rgba(59,130,246,0.16); border-color: rgba(59,130,246,0.45); color: #bfdbfe; }
      .lab-chip--proposed { background: rgba(234,179,8,0.12); border-color: rgba(234,179,8,0.5); color: #fef08a; }
      .lab-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 10px; border: 1px solid #1f2937; background: rgba(255,255,255,0.03); color: #e2e8f0; text-decoration: none; font-size: 12px; transition: transform 120ms ease, border-color 120ms ease; }
      .lab-btn:hover { transform: translateY(-1px); border-color: #334155; }
      .lab-btn__icon { font-size: 14px; }
      .lab-btn__cmd { font-family: "SFMono-Regular", Menlo, Consolas, monospace; font-size: 11px; color: #cbd5e1; background: rgba(15,23,42,0.6); padding: 4px 6px; border-radius: 8px; border: 1px solid #1f2937; }
    `);
    return style;
  }

  _header(ctx) {
    const header = new jsgui.Control({ context: ctx, tagName: "div" });
    header.add_class("lab-console__header");

    const title = new jsgui.Control({ context: ctx, tagName: "div" });
    title.add_class("lab-console__title");
    title.add_text("Lab Console — Experiments");

    const subtitle = new jsgui.Control({ context: ctx, tagName: "div" });
    subtitle.add_class("lab-console__subtitle");
    subtitle.add_text("Browse, inspect, and run jsgui3 lab experiments.");

    const pill = new jsgui.Control({ context: ctx, tagName: "div" });
    pill.add_class("lab-console__pill");
    pill.add_text(`${this._manifest.length} experiments`);

    const left = new jsgui.Control({ context: ctx, tagName: "div" });
    left.add(title);
    left.add(subtitle);

    header.add(left);
    header.add(pill);
    return header;
  }

  _experimentList(ctx) {
    const grid = new jsgui.Control({ context: ctx, tagName: "div" });
    grid.add_class("lab-console__grid");

    this._manifest.forEach((exp) => {
      grid.add(this._card(ctx, exp));
    });
    return grid;
  }

  _card(ctx, exp) {
    const card = new jsgui.Control({ context: ctx, tagName: "article", __type_name: "lab_card" });
    card.add_class("lab-card");

    const top = new jsgui.Control({ context: ctx, tagName: "div" });
    top.add_class("lab-card__row");

    const title = new jsgui.Control({ context: ctx, tagName: "div" });
    title.add_class("lab-card__title");
    title.add_text(`${exp.id} · ${exp.name}`);

    const status = new jsgui.Control({ context: ctx, tagName: "div" });
    status.add_class("lab-chip");
    status.add_class(this._statusClass(exp.status));
    status.add_text(exp.status);

    top.add(title);
    top.add(status);

    const meta = new jsgui.Control({ context: ctx, tagName: "div" });
    meta.add_class("lab-card__meta");
    meta.add_text(exp.slug);

    const desc = new jsgui.Control({ context: ctx, tagName: "div" });
    desc.add_class("lab-card__desc");
    desc.add_text(exp.description || "");

    const actions = new jsgui.Control({ context: ctx, tagName: "div" });
    actions.add_class("lab-card__actions");
    actions.add(this._actionBtn(ctx, "🔍", "Explore", exp.readme));
    actions.add(this._actionBtn(ctx, "🧪", "Run check", exp.check, true));
    actions.add(this._actionBtn(ctx, "🛠️", "Promote", exp.path));

    card.add(top);
    card.add(meta);
    card.add(desc);
    card.add(actions);
    return card;
  }

  _actionBtn(ctx, icon, label, target, isCommand = false) {
    const btn = new jsgui.Control({ context: ctx, tagName: isCommand ? "div" : "a" });
    btn.add_class("lab-btn");

    const iconNode = new jsgui.Control({ context: ctx, tagName: "span" });
    iconNode.add_class("lab-btn__icon");
    iconNode.add_text(icon);

    const textNode = new jsgui.Control({ context: ctx, tagName: "span" });
    textNode.add_text(label);

    btn.add(iconNode);
    btn.add(textNode);

    if (isCommand) {
      const cmd = new jsgui.Control({ context: ctx, tagName: "span" });
      cmd.add_class("lab-btn__cmd");
      cmd.add_text(`node ${target}`);
      btn.add(cmd);
    } else {
      btn.dom.attributes.href = target;
      btn.dom.attributes.target = "_blank";
      btn.dom.attributes.rel = "noopener noreferrer";
    }
    return btn;
  }

  _statusClass(status) {
    if (!status) return "";
    const normalized = String(status).toLowerCase();
    if (normalized.includes("validated")) return "lab-chip--validated";
    if (normalized.includes("active")) return "lab-chip--active";
    if (normalized.includes("proposed")) return "lab-chip--proposed";
    return "";
  }
}

module.exports = { LabConsoleControl };
