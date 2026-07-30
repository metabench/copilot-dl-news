'use strict';

const { Panel, Data_Grid } = require('../shared/jsgui');
const { mark, query_ctrl } = require('../shared/page-controls');
const { SIGNAL_COLUMNS, signalLogRows } = require('../shared/models');

const GRID = '[data-ps-siglog]';

/**
 * Signal_Log — the lightbulb queue: every request the owner has made and its
 * answer, newest first, as a stock Data_Grid.
 *
 * The grid is a connected control, so columns, sorting and empty_text are its
 * concern and the cells carry values rather than pre-formatted sentences — the
 * owner can sort by state or tech, and escaping is structural.
 *
 * FIXED THIS CYCLE: the previous version stashed `this.grid` during compose and
 * read it back in activate(). Reattachment constructs controls down the
 * `spec.el` path, which skips compose, so `this.grid` was always undefined in
 * the browser and every refresh updated nothing — the log showed whatever the
 * SSR snapshot held at server boot and never moved. The grid is now found
 * through the page's control registry, which is populated by reattachment.
 *
 * The grid rendering EMPTY was a second, separate thing, and the framework
 * already had the answer: `persist_activation_state`. Any Data_Grid that is
 * SSR'd rather than composed at runtime needs it.
 */
class Signal_Log extends Panel {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'signal_log';
    super({ ...spec, title: 'SIGNAL LOG — every request and its answer' });
    this.add_class('ps-panel');
    mark(this, 'signal_log');
    if (!spec.el) {
      const grid = new Data_Grid({
        context: this.context,
        columns: SIGNAL_COLUMNS,
        rows: signalLogRows(spec.history || []),
        empty_text: 'no requests yet — click a node and BEGIN RESEARCH',
        // Data_Grid's answer to SSR → reattachment: it serializes columns, rows,
        // sort state and selection into a DOM attribute at compose time and reads
        // them back when the control is reconstructed in the browser. Without it
        // the reattached grid has neither columns nor rows, and rows-without-
        // columns render the right NUMBER of blank rows — which reads as a
        // styling bug rather than a data one. Off by default; this grid is SSR'd,
        // so it needs it.
        persist_activation_state: true
      });
      grid.dom.attributes['data-ps-siglog'] = 'true';
      this._grid = grid;
      this.add(grid);
    }
  }

  grid() {
    if (!this._grid || !this._grid.set_data_source) this._grid = query_ctrl(this, GRID);
    return this._grid;
  }

  set_history(history) {
    const grid = this.grid();
    if (!grid || !grid.set_data_source) return;
    grid.set_data_source(signalLogRows(history));
  }
}

Signal_Log.css = `
/* Data_Grid ships a dark theme already; this is density and palette only, so
   the log reads at the same weight as everything else on the page. */
[data-ps-siglog] .data-table { background: transparent; }
[data-ps-siglog] .data-table-header { background: #14171c; color: #8a8778; font-size: 9px; letter-spacing: 0.1em; }
[data-ps-siglog] .data-table-cell { color: #b9b4a4; font-size: 10.5px; padding: 4px 7px; font-variant-numeric: tabular-nums; vertical-align: top; }
[data-ps-siglog] .data-table-cell:first-child { color: #9fd4ec; white-space: nowrap; }
`;

module.exports = Signal_Log;
