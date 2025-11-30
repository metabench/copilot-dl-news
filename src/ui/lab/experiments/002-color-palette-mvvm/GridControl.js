"use strict";

/**
 * GridControl (MVVM) - Flexible grid layout control using MVVM pattern
 * 
 * EXPERIMENT: 002-color-palette-mvvm
 * BASED ON: 001-color-palette/GridControl.js
 * REFACTORED: 2025-11-30 to use Data_Model_View_Model_Control
 * 
 * MVVM Structure:
 * - data.model: { gridSize, cellSize, data, cellSelection }
 * - view.data.model: { selectedCell, hoveredCell, cellCount }
 */

const jsgui = require("jsgui3-html");
const { stringify, each, tof, def, Control } = jsgui;
const Data_Model_View_Model_Control = require("jsgui3-html/html-core/Data_Model_View_Model_Control");

const mx_selectable = require("jsgui3-html/control_mixins/selectable");
const { CellControl } = require("./CellControl");

/**
 * A flexible grid control supporting rows/columns of cells, using MVVM
 */
class GridControl extends Data_Model_View_Model_Control {
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

    this.add_class("grid");

    // DATA MODEL - Grid configuration and data
    // Note: Extend existing model to preserve jsgui3 internals
    const dm = this.data.model;
    dm.gridSize = spec.grid_size || [12, 12];
    dm.cellSize = spec.cell_size || null;
    dm.data = spec.data || null;
    dm.cellSelection = spec.cell_selection || null;
    dm.compositionMode = spec.composition_mode || "divs";

    // VIEW MODEL - UI state
    // Note: Extend existing view.data.model to preserve mixins collection
    const vdm = this.view.data.model;
    vdm.selectedCell = null;
    vdm.hoveredCell = null;
    vdm.cellCount = 0;
    vdm.columnHeaders = false;
    vdm.rowHeaders = false;

    this._arr_rows = [];
    this.map_cells = {};
    this.arr_cells = {};

    // Backward compatibility
    if (spec.cell_selection) {
      this.cell_selection = spec.cell_selection;
    }

    this._setupBindings();

    if (!spec.el) {
      this.full_compose_as_divs();
      this._fields = this._fields || {};
      Object.assign(this._fields, {
        composition_mode: this.data.model.compositionMode,
        grid_size: this.data.model.gridSize
      });
      if (this.data.model.cellSize) {
        this._fields.cell_size = this.data.model.cellSize;
      }
    }
  }

  /**
   * Setup MVVM bindings
   * @private
   */
  _setupBindings() {
    const gs = this.data.model.gridSize;
    // Set initial computed value directly (reactive updates need obext fields)
    this.view.data.model.cellCount = gs ? gs[0] * gs[1] : 0;

    // Watch for grid size changes to rebuild
    this.watch(this.data.model, 'gridSize', (newSize, oldSize) => {
      if (newSize) {
        this.view.data.model.cellCount = newSize[0] * newSize[1];
      }
      if (oldSize && !this.dom?.el) {
        this.clear();
        this.full_compose_as_divs();
      }
    });

    // Watch for selection changes
    this.watch(this.view.data.model, 'selectedCell', (cell) => {
      if (cell) {
        this.raise('cell-selected', { cell, color: cell._color });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Property Accessors (backward compatibility)
  // ═══════════════════════════════════════════════════════════════

  get grid_size() { return this.data.model.gridSize; }
  set grid_size(v) { this.data.model.gridSize = v; }

  get cell_size() { return this.data.model.cellSize; }
  set cell_size(v) { this.data.model.cellSize = v; }

  get composition_mode() { return this.data.model.compositionMode; }
  set composition_mode(v) { this.data.model.compositionMode = v; }

  get column_headers() { return this.view.data.model.columnHeaders; }
  set column_headers(v) { this.view.data.model.columnHeaders = v; }

  get row_headers() { return this.view.data.model.rowHeaders; }
  set row_headers(v) { this.view.data.model.rowHeaders = v; }

  // ═══════════════════════════════════════════════════════════════
  // Grid Methods (mostly unchanged from original)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Refresh cell sizes based on grid dimensions
   */
  refresh_size() {
    if (this.data.model.compositionMode === "divs") {
      const [num_columns, num_rows] = this.data.model.gridSize;
      const cell_border_thickness = 1;
      const _2_cell_border_thickness = cell_border_thickness * 2;

      if (this.size) {
        const cell_size = this.data.model.cellSize || [
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
    const gridSize = this.data.model.gridSize;
    const data = this.data.model.data;

    if (gridSize) {
      const [num_columns, num_rows] = gridSize;
      const cell_border_thickness = 0;
      const _2_cell_border_thickness = cell_border_thickness * 2;

      let cell_size;
      if (this.size) {
        cell_size = this.data.model.cellSize || [
          Math.floor(this.size[0] / num_columns) - _2_cell_border_thickness,
          Math.floor(this.size[1] / num_rows) - _2_cell_border_thickness
        ];
      } else {
        cell_size = this.data.model.cellSize;
      }

      let row_width, row_height;
      let row_header_width;

      if (this.data.model.cellSize) {
        if (this.view.data.model.rowHeaders) {
          row_header_width = this.view.data.model.rowHeaders.width || row_header_width;
          row_width = this.data.model.cellSize[0] * num_columns + row_header_width;
        } else {
          row_width = this.data.model.cellSize[0] * num_columns;
        }
        row_height = this.data.model.cellSize[1];
      } else {
        if (this.size) row_height = Math.floor(this.size[1] / num_rows);
      }

      // Column headers (if enabled)
      if (this.view.data.model.columnHeaders) {
        const header_row = new Control({ context: this.context });
        header_row.add_class("header");
        header_row.add_class("row");
        if (row_height) header_row.style("height", row_height);
        if (row_width) header_row.style("width", row_width);
        rows.add(header_row);

        if (this.view.data.model.rowHeaders) {
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
        if (this.view.data.model.rowHeaders) {
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
