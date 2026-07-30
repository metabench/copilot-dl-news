'use strict';

/**
 * shared/jsgui — the ONE place that resolves the framework.
 *
 * Both branches are bundled statically; only one executes per environment.
 * jsgui3-html composes on the server, jsgui3-client reattaches in the browser.
 * Keeping the deep relative paths here means the other 20 control files import
 * `../shared/jsgui` and never carry a ../../../../../../.. of their own.
 */
const IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';

const jsgui = IS_BROWSER
  ? require('../../../../../../../jsgui3-client/client')
  : require('jsgui3-html');

const Active_HTML_Document = require('../../../../../../../jsgui3-server/controls/Active_HTML_Document');
const selectable_mixin = require('../../../../../../../jsgui3-html/control_mixins/selectable');

// STOCK jsgui3 controls. The library ships 155 controls and 48 mixins; this app
// adopts rather than reinvents (cycle 162). Each was resolved from jsgui.controls
// and SSR-smoked with its real spec shape on BOTH builds before adoption — a
// control that renders but cannot reattach breaks activation silently.
const { Panel, Stat_Card, Data_Grid, Key_Value_Table, Progress_Bar, Chip, Button } = jsgui.controls;

module.exports = {
  IS_BROWSER,
  jsgui,
  Control: jsgui.Control,
  Active_HTML_Document,
  selectable_mixin,
  Panel,
  Stat_Card,
  Data_Grid,
  Key_Value_Table,
  Progress_Bar,
  Chip,
  Button
};
