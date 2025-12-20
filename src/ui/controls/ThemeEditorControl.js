"use strict";

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

function safeJsonStringify(value, indent = 2) {
  try {
    return JSON.stringify(value, null, indent);
  } catch (_) {
    return "{}";
  }
}

function normalizeThemeId(theme) {
  if (!theme) return "";
  return String(theme.id || theme.name || "");
}

class ThemeEditorControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "section", __type_name: "theme_editor" });

    this.add_class("theme-editor");

    this.themes = Array.isArray(spec.themes) ? spec.themes : [];
    this.activeTheme = spec.activeTheme || null;
    this.apiBase = typeof spec.apiBase === "string" && spec.apiBase.trim() ? spec.apiBase.trim() : "/api/themes";

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    const context = this.context;

    const header = new jsgui.Control({ context, tagName: "header" });
    header.add_class("theme-editor__header");

    const title = new jsgui.Control({ context, tagName: "h2" });
    title.add_class("theme-editor__title");
    title.add(new StringControl({ context, text: "Theme Editor" }));
    header.add(title);

    const subtitle = new jsgui.Control({ context, tagName: "p" });
    subtitle.add_class("theme-editor__subtitle");
    subtitle.add(new StringControl({
      context,
      text: "Edit UI theme tokens (WLILO / Obsidian / custom). Save updates to ui_themes via the API."
    }));
    header.add(subtitle);

    const toolbar = new jsgui.Control({ context, tagName: "div" });
    toolbar.add_class("theme-editor__toolbar");

    const selectWrap = new jsgui.Control({ context, tagName: "div" });
    selectWrap.add_class("theme-editor__select-wrap");

    const label = new jsgui.Control({ context, tagName: "label" });
    label.add_class("theme-editor__label");
    label.dom.attributes["for"] = "themeEditorSelect";
    label.add(new StringControl({ context, text: "Theme" }));
    selectWrap.add(label);

    const select = new jsgui.Control({ context, tagName: "select" });
    select.add_class("theme-editor__select");
    select.dom.attributes.id = "themeEditorSelect";
    select.dom.attributes["data-theme-select"] = "1";

    const activeName = this.activeTheme && this.activeTheme.name ? String(this.activeTheme.name) : "";
    const activeId = normalizeThemeId(this.activeTheme);

    const themes = Array.isArray(this.themes) ? this.themes : [];
    themes.forEach((theme) => {
      if (!theme) return;
      const option = new jsgui.Control({ context, tagName: "option" });
      const name = String(theme.name || "");
      const display = String(theme.display_name || theme.displayName || theme.name || "(unnamed)");
      option.dom.attributes.value = name;
      if (name && name === activeName) {
        option.dom.attributes.selected = "selected";
      }
      const suffix = theme.is_default ? " ★" : theme.is_system ? " (system)" : "";
      option.add(new StringControl({ context, text: display + suffix }));
      select.add(option);
    });

    selectWrap.add(select);
    toolbar.add(selectWrap);

    const buttons = new jsgui.Control({ context, tagName: "div" });
    buttons.add_class("theme-editor__buttons");

    const mkButton = (text, attrs) => {
      const btn = new jsgui.Control({ context, tagName: "button" });
      btn.add_class("theme-editor__button");
      btn.dom.attributes.type = "button";
      Object.entries(attrs || {}).forEach(([key, value]) => {
        btn.dom.attributes[key] = value;
      });
      btn.add(new StringControl({ context, text }));
      return btn;
    };

    buttons.add(mkButton("🔄 Refresh", { "data-theme-refresh": "1" }));
    buttons.add(mkButton("💾 Save", { "data-theme-save": "1" }));
    buttons.add(mkButton("⭐ Set default", { "data-theme-default": "1" }));
    buttons.add(mkButton("➕ New", { "data-theme-new": "1" }));
    buttons.add(mkButton("🗑️ Delete", { "data-theme-delete": "1" }));

    toolbar.add(buttons);

    const status = new jsgui.Control({ context, tagName: "div" });
    status.add_class("theme-editor__status");
    status.dom.attributes["data-theme-status"] = "1";
    status.add(new StringControl({ context, text: "" }));

    const form = new jsgui.Control({ context, tagName: "div" });
    form.add_class("theme-editor__form");

    const fields = new jsgui.Control({ context, tagName: "div" });
    fields.add_class("theme-editor__fields");

    const fieldRow = (labelText, inputAttrs, initialValue = "") => {
      const row = new jsgui.Control({ context, tagName: "div" });
      row.add_class("theme-editor__field-row");

      const lbl = new jsgui.Control({ context, tagName: "label" });
      lbl.add_class("theme-editor__label");
      if (inputAttrs && inputAttrs.id) {
        lbl.dom.attributes["for"] = inputAttrs.id;
      }
      lbl.add(new StringControl({ context, text: labelText }));

      const input = new jsgui.Control({ context, tagName: "input" });
      input.add_class("theme-editor__input");
      input.dom.attributes.type = "text";
      Object.entries(inputAttrs || {}).forEach(([key, value]) => {
        input.dom.attributes[key] = value;
      });
      if (initialValue) {
        input.dom.attributes.value = initialValue;
      }

      row.add(lbl);
      row.add(input);
      return row;
    };

    fields.add(fieldRow("Name", { id: "themeEditorName", "data-theme-name": "1", placeholder: "wlilo" }, activeName));
    fields.add(fieldRow(
      "Display",
      { id: "themeEditorDisplay", "data-theme-display": "1", placeholder: "WLILO" },
      this.activeTheme && (this.activeTheme.display_name || this.activeTheme.displayName) ? String(this.activeTheme.display_name || this.activeTheme.displayName) : ""
    ));
    fields.add(fieldRow(
      "Description",
      { id: "themeEditorDescription", "data-theme-description": "1", placeholder: "Optional" },
      this.activeTheme && this.activeTheme.description ? String(this.activeTheme.description) : ""
    ));

    form.add(fields);

    const editorWrap = new jsgui.Control({ context, tagName: "div" });
    editorWrap.add_class("theme-editor__editor-wrap");

    const editorLabel = new jsgui.Control({ context, tagName: "label" });
    editorLabel.add_class("theme-editor__label");
    editorLabel.dom.attributes["for"] = "themeEditorJson";
    editorLabel.add(new StringControl({ context, text: "Config JSON" }));

    const textarea = new jsgui.Control({ context, tagName: "textarea" });
    textarea.add_class("theme-editor__textarea");
    textarea.dom.attributes.id = "themeEditorJson";
    textarea.dom.attributes.rows = "22";
    textarea.dom.attributes["data-theme-json"] = "1";
    textarea.add(new StringControl({
      context,
      text: this.activeTheme && this.activeTheme.config ? safeJsonStringify(this.activeTheme.config, 2) : "{}"
    }));

    editorWrap.add(editorLabel);
    editorWrap.add(textarea);
    form.add(editorWrap);

    this.dom.attributes["data-theme-editor"] = "1";
    this.dom.attributes["data-theme-active-id"] = activeId;
    this.dom.attributes["data-theme-api-base"] = this.apiBase;

    this.add(header);
    this.add(toolbar);
    this.add(status);
    this.add(form);
  }

  activate() {
    if (this.__active) return;
    this.__active = true;

    const root = this.dom && this.dom.el;
    if (!root || typeof window === "undefined") return;

    const apiBase = root.getAttribute("data-theme-api-base") || "/api/themes";

    const select = root.querySelector("[data-theme-select]");
    const status = root.querySelector("[data-theme-status]");
    const nameInput = root.querySelector("[data-theme-name]");
    const displayInput = root.querySelector("[data-theme-display]");
    const descInput = root.querySelector("[data-theme-description]");
    const textarea = root.querySelector("[data-theme-json]");

    const btnRefresh = root.querySelector("[data-theme-refresh]");
    const btnSave = root.querySelector("[data-theme-save]");
    const btnDefault = root.querySelector("[data-theme-default]");
    const btnNew = root.querySelector("[data-theme-new]");
    const btnDelete = root.querySelector("[data-theme-delete]");

    let currentTheme = null;

    const setStatus = (text, kind) => {
      if (!status) return;
      status.textContent = text || "";
      status.setAttribute("data-status", kind || "info");
    };

    const safeParseJson = (text) => {
      try {
        return { ok: true, value: JSON.parse(text) };
      } catch (err) {
        return { ok: false, error: err };
      }
    };

    const populateFields = (theme) => {
      currentTheme = theme || null;
      if (nameInput) nameInput.value = theme && theme.name ? String(theme.name) : "";
      if (displayInput) displayInput.value = theme && (theme.display_name || theme.displayName) ? String(theme.display_name || theme.displayName) : "";
      if (descInput) descInput.value = theme && theme.description ? String(theme.description) : "";
      if (textarea) textarea.value = theme && theme.config ? JSON.stringify(theme.config, null, 2) : "{}";
    };

    const fetchJson = async (url, options) => {
      const res = await fetch(url, {
        headers: { "content-type": "application/json" },
        ...options
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (json && (json.error || json.message)) || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return json;
    };

    const refreshList = async () => {
      setStatus("Loading themes…", "info");
      const payload = await fetchJson(apiBase, { method: "GET" });
      const themes = Array.isArray(payload.themes) ? payload.themes : [];

      if (select) {
        const selected = select.value;
        select.innerHTML = "";
        themes.forEach((t) => {
          const opt = document.createElement("option");
          opt.value = t.name;
          opt.textContent = `${t.display_name || t.name}${t.is_default ? " ★" : t.is_system ? " (system)" : ""}`;
          if (selected && t.name === selected) {
            opt.selected = true;
          }
          select.appendChild(opt);
        });
      }

      setStatus(`Loaded ${themes.length} themes`, "success");
    };

    const loadTheme = async (name) => {
      if (!name) return;
      setStatus(`Loading ${name}…`, "info");
      const payload = await fetchJson(`${apiBase}/${encodeURIComponent(name)}`, { method: "GET" });
      populateFields(payload.theme);
      setStatus(`Loaded ${name}`, "success");
    };

    const saveTheme = async () => {
      const name = nameInput ? nameInput.value.trim() : "";
      if (!name) {
        setStatus("Name is required", "error");
        return;
      }

      const parsed = safeParseJson(textarea ? textarea.value : "{}");
      if (!parsed.ok) {
        setStatus(`Invalid JSON: ${parsed.error.message}`, "error");
        return;
      }

      const payload = {
        displayName: displayInput ? displayInput.value.trim() : "",
        description: descInput ? descInput.value.trim() : "",
        config: parsed.value
      };

      setStatus("Saving…", "info");
      const res = await fetchJson(`${apiBase}/${encodeURIComponent(name)}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      populateFields(res.theme);
      setStatus("Saved", "success");
    };

    const setDefault = async () => {
      const name = nameInput ? nameInput.value.trim() : "";
      if (!name) {
        setStatus("Name is required", "error");
        return;
      }
      setStatus("Setting default…", "info");
      await fetchJson(`${apiBase}/${encodeURIComponent(name)}/default`, { method: "POST" });
      setStatus("Default updated", "success");
      await refreshList();
    };

    const createNew = async () => {
      const name = nameInput ? nameInput.value.trim() : "";
      if (!name) {
        setStatus("Name is required", "error");
        return;
      }

      const parsed = safeParseJson(textarea ? textarea.value : "{}");
      if (!parsed.ok) {
        setStatus(`Invalid JSON: ${parsed.error.message}`, "error");
        return;
      }

      const payload = {
        name,
        displayName: displayInput ? displayInput.value.trim() : "",
        description: descInput ? descInput.value.trim() : "",
        config: parsed.value
      };

      setStatus("Creating…", "info");
      const res = await fetchJson(apiBase, { method: "POST", body: JSON.stringify(payload) });
      populateFields(res.theme);
      if (select) {
        select.value = res.theme && res.theme.name ? res.theme.name : name;
      }
      setStatus("Created", "success");
      await refreshList();
    };

    const deleteTheme = async () => {
      const name = nameInput ? nameInput.value.trim() : "";
      if (!name) {
        setStatus("Name is required", "error");
        return;
      }
      if (!window.confirm(`Delete theme '${name}'?`)) return;
      setStatus("Deleting…", "info");
      await fetchJson(`${apiBase}/${encodeURIComponent(name)}`, { method: "DELETE" });
      setStatus("Deleted", "success");
      await refreshList();
    };

    const guard = (fn) => async (ev) => {
      if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
      try {
        await fn();
      } catch (err) {
        setStatus(err && err.message ? err.message : "Request failed", "error");
      }
    };

    if (btnRefresh) btnRefresh.addEventListener("click", guard(refreshList));
    if (btnSave) btnSave.addEventListener("click", guard(saveTheme));
    if (btnDefault) btnDefault.addEventListener("click", guard(setDefault));
    if (btnNew) btnNew.addEventListener("click", guard(createNew));
    if (btnDelete) btnDelete.addEventListener("click", guard(deleteTheme));

    if (select) {
      select.addEventListener("change", guard(async () => {
        const name = select.value;
        await loadTheme(name);
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("theme", name);
          window.history.replaceState({}, "", url.toString());
        } catch (_) {
          // ignore
        }
      }));
    }

    // Initial: if dropdown has a value, load it to sync config (SSR may be stale)
    if (select && select.value) {
      guard(() => loadTheme(select.value))();
    }
  }
}

module.exports = { ThemeEditorControl };
