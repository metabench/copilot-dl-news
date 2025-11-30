"use strict";

/**
 * GridControl - Flexible grid layout control
 * 
 * COPIED FROM: jsgui3-html/controls/organised/0-core/0-basic/1-compositional/grid.js
 * MODIFIED: 2025-11-30
 * 
 * Changes from original:
 * - Renamed Grid → GridControl
 * - Updated require paths for lab context
 * - Added JSDoc comments
 * - Cleaned up formatting
 */

const jsgui = require("jsgui3-html");
const { stringify, each, tof, def, Control } = jsgui;
const { prop, field } = require("obext");

const mx_selectable = require("jsgui3-html/control_mixins/selectable");
const { CellControl } = require("./CellControl");

/**
 * A flexible grid control supporting rows/columns of cells
 */
class GridControl extends Control {
  /**
   * @param {Object} spec - Configuration
   * @param {Object} spec.context - jsgui3 context
   * @param {[number, number]} [spec.grid_size=[12,12]] - [columns, rows]
   * @param {[number, number]} [spec.size] - Pixel size [width, height]
   * @param {[number, number]} [spec.cell_size] - Cell pixel size
   * @param {string} [spec.cell_selection] - Selection mode: 'single' | 'multi'
   * @param {Array} [spec.data] - 2D array of cell data
   */
  constructor(spec, add, make) {
    spec = spec || {};
    spec.__type_name = spec.__type_name || "grid";
    super(spec);

    if (spec.cell_selection) {
      this.cell_selection = spec.cell_selection;
    }

    this.add_class("grid");

    const spec_data = spec.data;
    this._arr_rows = [];

    field(this, "composition_mode");
    this.composition_mode = spec.composition_mode || "divs";

    prop(this, "grid_size", spec.grid_size || [12, 12]);

    field(this, "cell_size");
    if (spec.cell_size) this.cell_size = spec.cell_size;

    field(this, "column_headers", false);
    field(this, "row_headers", false);
    prop(this, "data", false);

    this.map_cells = {};
    this.arr_cells = {};

    if (spec.data) {
      const t_data = tof(spec.data);
      if (t_data === "array") {
        let max_x = -1;
        const arr = spec.data;
        const ly = arr.length;
        for (let y = 0; y < ly; y++) {
          const lx = arr[y].length;
          if (lx > max_x) max_x = lx;
        }
        // Note: grid_size would need to be set here
      }
    }

    if (!spec.el) {
      this.full_compose_as_divs();
      this._fields = this._fields || {};
      Object.assign(this._fields, {
        composition_mode: this.composition_mode,
        grid_size: this.grid_size
      });
      if (this.cell_size) {
        this._fields.cell_size = this.cell_size;
      }
    }

    this.changes({
      grid_size: (v) => {
        if (!spec.el) {
          this.clear();
          this.full_compose_as_divs();
        }
      }
    });
  }

  /**
   * Refresh cell sizes based on grid dimensions
   */
  refresh_size() {
    if (this.composition_mode === "divs") {
      const [num_columns, num_rows] = this.grid_size;
      const cell_border_thickness = 1;
      const _2_cell_border_thickness = cell_border_thickness * 2;

      if (this.size) {
        const cell_size = this.cell_size || [
          Math.floor(this.size[0] / num_columns) - _2_cell_border_thickness,
          Math.floor(this.size[1] / num_rows) - _2_cell_border_thickness
        ];
        const cell_v_border_thickness = 2;

        this.each_row((row) => {
          row.size = [this.size[0], cell_size[1] + cell_v_border_thickness];
        });
        this.each_cell((cell) => {
          cell.size = cell_size;
        });
      }
    }
  }

  /**
   * Iterate over all rows
   * @param {Function} cb_row - Callback(row, index)
   */
  each_row(cb_row) {
    each(this._arr_rows, cb_row);
  }

  /**
   * Iterate over all cells
   * @param {Function} cb_cell - Callback(cell, [x, y])
   */
  each_cell(cb_cell) {
    each(this._arr_rows, (row, i_row) => {
      row.content.each((cell, i_cell) => {
        cb_cell(cell, [i_cell, i_row]);
      });
    });
  }

  /**
   * Get cell at position
   * @param {number} x - Column
   * @param {number} y - Row
   */
  get_cell(x, y) {
    return this.arr_cells[x]?.[y];
  }

  /**
   * Add a new cell to the grid
   * @param {*} content - Cell content
   */
  add_cell(content) {
    const cell = new CellControl({ context: this.context });
    if (this.cell_selection) {
      cell.selectable = true;
    }
    if (content) {
      cell.add(content);
    }
    cell.active();
    this.main.add(cell);
    return cell;
  }

  /**
   * Build the grid using div elements
   */
  full_compose_as_divs() {
    const main = (this.main = new Control({
      context: this.context,
      class: "main"
    }));
    this.add(main);

    const rows = (this.rows = new Control({
      context: this.context,
      class: "rows"
    }));
    main.add(rows);

    const map_cells = this.map_cells;
    const arr_cells = this.arr_cells;

    if (this.grid_size) {
      const [num_columns, num_rows] = this.grid_size;
      const cell_border_thickness = 0;
      const _2_cell_border_thickness = cell_border_thickness * 2;

      let cell_size;
      if (this.size) {
        cell_size = this.cell_size || [
          Math.floor(this.size[0] / num_columns) - _2_cell_border_thickness,
          Math.floor(this.size[1] / num_rows) - _2_cell_border_thickness
        ];
      } else {
        cell_size = this.cell_size;
      }

      let row_width, row_height;
      let row_header_width;

      if (this.cell_size) {
        if (this.row_headers) {
          row_header_width = this.row_headers.width || row_header_width;
          row_width = this.cell_size[0] * num_columns + row_header_width;
        } else {
          row_width = this.cell_size[0] * num_columns;
        }
        row_height = this.cell_size[1];
      } else {
        if (this.size) row_height = Math.floor(this.size[1] / num_rows);
      }

      const data = this.data;

      // Column headers
      if (this.column_headers) {
        const header_row = new Control({ context: this.context });
        header_row.add_class("header");
        header_row.add_class("row");
        if (row_height) header_row.style("height", row_height);
        if (row_width) header_row.style("width", row_width);
        rows.add(header_row);

        if (this.row_headers) {
          const cell = new Control({
            context: this.context,
            __type_name: "grid_cell"
          });
          cell.add_class("grid-header");
          cell.add_class("cell");
          cell.size = row_header_width ? [row_header_width, cell_size[1]] : cell_size;
          header_row.add(cell);
        }

        for (let x = 0; x < num_columns; x++) {
          const cell = new Control({
            context: this.context,
            __type_name: "grid_cell"
          });
          cell.add_class("column-header");
          cell.add_class("cell");
          cell.size = cell_size;
          header_row.add(cell);
        }
      }

      // Data rows
      for (let y = 0; y < num_rows; y++) {
        const row_container = new Control({ context: this.context });
        if (row_height) row_container.style("height", row_height);
        if (row_width) row_container.style("width", row_width);
        row_container.add_class("row");
        this._arr_rows.push(row_container);
        rows.add(row_container);

        // Row header
        if (this.row_headers) {
          const cell = new Control({
            context: this.context,
            __type_name: "grid_cell"
          });
          cell.add_class("row-header");
          cell.add_class("cell");
          cell.size = row_header_width ? [row_header_width, cell_size[1]] : cell_size;
          row_container.add(cell);
        }

        // Data cells
        for (let x = 0; x < num_columns; x++) {
          const o = {
            context: this.context,
            x: x,
            y: y
          };
          if (data) {
            o.data = data[y][x];
          }

          const cell = new CellControl(o);
          cell.selectable = true;
          if (cell_size) cell.size = cell_size;
          row_container.add(cell);

          arr_cells[x] = arr_cells[x] || [];
          arr_cells[x][y] = cell;
          map_cells["[" + x + "," + y + "]"] = cell;
        }
      }
    }

    this._ctrl_fields = this._ctrl_fields || {};
    this._ctrl_fields.main = main;
    this._ctrl_fields.rows = rows;
  }

  /**
   * Activate the grid (client-side)
   */
  activate() {
    if (!this.__active) {
      super.activate();
      this.selection_scope = this.selection_scope || this.context.new_selection_scope(this);

      // Load rows
      const _arr_rows = (this._arr_rows = []);
      if (this.rows && this.rows.content && this.rows.content._arr) {
        this.rows.content._arr.forEach((v) => {
          _arr_rows.push(v);
        });
      }
    }
  }
}

// Default CSS for the grid
GridControl.css = `
div.grid {
    user-select: none;
    clear: both;
}
div.grid .header.row .cell {
    text-align: center
}
div.grid .row {
    clear: both;
}
div.grid .header.row .cell span {
    position: relative;
    top: 4px;
    left: 0px;
    font-size: 11pt;
}
div.grid .row .cell {
    float: left;
    box-sizing: border-box;
    border-right: 1px solid #AAAAAA;
    border-bottom: 1px solid #999999;
}
div.grid .row .cell.selected {
    float: left;
    box-sizing: border-box;
    border: 2px solid #2046df;
    border-radius: 4px;
}
div.grid .row .cell.selected span {
    position: relative;
    left: 3px;
    top: -1px;
    font-size: 16pt;
}
div.grid .row .cell span {
    position: relative;
    left: 5px;
    top: 1px;
    font-size: 16pt;
}
`;

// Attach CellControl for access
GridControl.Cell = GridControl.CellControl = CellControl;

module.exports = { GridControl, CellControl };
