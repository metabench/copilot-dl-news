"use strict";

const jsgui = require("jsgui3-html");

// Lightweight table/row/cell controls for server-rendered HTML output.

const StringControl = jsgui.String_Control;

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }
  return [value].filter(Boolean);
}

function appendText(control, text) {
  if (text == null) return;
  const normalized = String(text);
  control.add(new StringControl({ context: control.context, text: normalized }));
}

class TableCellControl extends jsgui.Control {
  constructor(spec = {}) {
    const { header = false, align = null } = spec;
    const {
      content: initialContent,
      control: initialControl,
      text: initialText,
      ...rest
    } = spec;
    super({ ...rest, tagName: header ? "th" : "td" });
    this.add_class("ui-table__cell");
    if (header) {
      this.add_class("ui-table__cell--header");
    }
    if (align) {
      this.add_class(`ui-table__cell--${align}`);
    }
    toArray(spec.classNames).forEach((cls) => this.add_class(cls));
    if (spec.title) {
      this.dom.attributes.title = spec.title;
    }
    if (!spec.el) {
      if (initialControl && initialControl instanceof jsgui.Control) {
        this.add(initialControl);
      } else if (initialContent instanceof jsgui.Control) {
        this.add(initialContent);
      } else if (Array.isArray(initialContent)) {
        initialContent.forEach((child) => {
          if (child instanceof jsgui.Control) {
            this.add(child);
          } else if (child != null) {
            appendText(this, child);
          }
        });
      } else if (initialText != null) {
        appendText(this, initialText);
      }
    }
  }
}

class TableRowControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "tr" });
    this.add_class("ui-table__row");
    toArray(spec.classNames).forEach((cls) => this.add_class(cls));
    if (typeof spec.rowIndex === "number") {
      this.dom.attributes["data-row-index"] = String(spec.rowIndex);
    }
  }
}

class TableControl extends jsgui.Control {
  constructor(spec = {}) {
    const { columns = [], rows = [] } = spec;
    super({ ...spec, tagName: "table" });
    this.add_class("ui-table");
    this.columns = Array.isArray(columns) ? columns : [];
    this._rows = [];
    if (!spec.el) {
      this.compose();
      if (rows.length) {
        this.setRows(rows);
      }
    }
  }

  compose() {
    const context = this.context;
    this.thead = new jsgui.Control({ context, tagName: "thead" });
    this.tbody = new jsgui.Control({ context, tagName: "tbody" });
    this.add(this.thead);
    this.add(this.tbody);
    this._buildHeader();
  }

  _buildHeader() {
    const headerRow = new TableRowControl({ context: this.context, classNames: "ui-table__row--header" });
    this.columns.forEach((column) => {
      headerRow.add(
        new TableCellControl({
          context: this.context,
          header: true,
          text: column.label || column.key || "",
          align: column.align,
          classNames: column.headerClass
        })
      );
    });
    this.thead.add(headerRow);
  }

  setRows(rows = []) {
    this._rows = Array.isArray(rows) ? rows : [];
    this._clearBody();
    this._rows.forEach((rowData, index) => {
      const row = new TableRowControl({
        context: this.context,
        rowIndex: index,
        classNames: index % 2 === 1 ? "ui-table__row--striped" : null
      });
      this.columns.forEach((column) => {
        const rawValue = rowData[column.key];
        const cellSpec = this._normalizeCellSpec(rawValue, column, rowData, index);
        row.add(new TableCellControl({ context: this.context, ...cellSpec }));
      });
      this.tbody.add(row);
    });
  }

  _normalizeCellSpec(value, column, rowData, rowIndex) {
    const columnClasses = toArray(column.cellClass);
    if (value && typeof value === "object" && value.href) {
      return {
        classNames: columnClasses.concat(toArray(value.classNames || value.className)),
        content: this._createLinkControl({
          text: value.text,
          href: value.href,
          title: value.title || (rowData && rowData.title) || undefined,
          target: value.target
        }),
        align: value.align || column.align
      };
    }
    if (value && value.control instanceof jsgui.Control) {
      return {
        ...value,
        classNames: columnClasses.concat(toArray(value.classNames || value.className))
      };
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const { text, title, classNames, className, align, content } = value;
      return {
        text: text != null ? text : "",
        title,
        classNames: columnClasses.concat(toArray(classNames || className)),
        align: align || column.align,
        content
      };
    }
    return {
      text: value == null ? "" : String(value),
      align: column.align,
      classNames: columnClasses
    };
  }

  _clearBody() {
    if (this.tbody && this.tbody.content) {
      this.tbody.content.clear();
    }
  }

  _createLinkControl({ text, href, title, target }) {
    const anchor = new jsgui.Control({ context: this.context, tagName: "a" });
    anchor.add_class("table-link");
    if (href) {
      anchor.dom.attributes.href = href;
    }
    if (title) {
      anchor.dom.attributes.title = title;
    }
    if (target) {
      anchor.dom.attributes.target = target;
      if (target === "_blank") {
        anchor.dom.attributes.rel = "noopener noreferrer";
      }
    }
    const linkText = text != null ? text : href || "";
    anchor.add(new StringControl({ context: this.context, text: linkText }));
    return anchor;
  }
}

module.exports = {
  TableControl,
  TableRowControl,
  TableCellControl
};
