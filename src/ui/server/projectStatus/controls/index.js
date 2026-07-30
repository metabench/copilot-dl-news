'use strict';

/**
 * controls/index — the isomorphic bundle entry for the project-status app.
 *
 * jsgui3-server SSRs and bundles this file; jsgui3-client self-activates on
 * window load and reattaches every element by data-jsgui-id / data-jsgui-type
 * through jsgui.controls — hence the registrations below. Omitting either the
 * require or the registration is a proven silent no-op: the markup renders and
 * nothing ever activates.
 *
 * One class per file, matching jsgui3's own convention (230 control files, one
 * class each), with each control's CSS declared on the class as `Ctrl.css` —
 * the documented `static css` hook that 101 stock controls use, which the
 * bundler collects into /css/css.css.
 *
 * There is no `primitives/` directory: the survey found the library already
 * ships Panel, Stat_Card, Data_Grid, Key_Value_Table, Progress_Bar, Chip and
 * Button, so this app adopts those rather than building its own. What remains
 * custom is only what the catalogue genuinely lacks — the research board's DAG
 * layout and this project's domain panels.
 */

const { jsgui } = require('./shared/jsgui');

const Project_Status_Page = require('./app/Project_Status_Page');
const Status_Widget = require('./app/Status_Widget');
const Live_Strip = require('./hub/Live_Strip');
const Settings_Control = require('./hub/Settings_Control');
const Player_Bar = require('./hub/Player_Bar');
const Stat_Chips = require('./hub/Stat_Chips');
const Signal_Log = require('./hub/Signal_Log');
const History_Panel = require('./hub/History_Panel');
const Milestones_Panel = require('./hub/Milestones_Panel');
const Status_Footer = require('./hub/Status_Footer');
const Work_Panel = require('./work/Work_Panel');
const Modules_Panel = require('./work/Modules_Panel');
const Road_Strip = require('./tree/Road_Strip');
const Branch_Cards = require('./tree/Branch_Cards');
const Tree_View = require('./tree/Tree_View');
const Tech_Tree_Board = require('./tree/Tech_Tree_Board');
const Tech_Tree_Node = require('./tree/Tech_Tree_Node');
const Tech_Detail_Panel = require('./detail/Tech_Detail_Panel');

const APP_CONTROLS = {
  project_status_page: Project_Status_Page,
  status_widget: Status_Widget,
  live_strip: Live_Strip,
  settings_control: Settings_Control,
  player_bar: Player_Bar,
  stat_chips: Stat_Chips,
  signal_log: Signal_Log,
  history_panel: History_Panel,
  milestones_panel: Milestones_Panel,
  status_footer: Status_Footer,
  work_panel: Work_Panel,
  modules_panel: Modules_Panel,
  road_strip: Road_Strip,
  branch_cards: Branch_Cards,
  tree_view: Tree_View,
  tech_tree_board: Tech_Tree_Board,
  tech_tree_node: Tech_Tree_Node,
  tech_detail_panel: Tech_Detail_Panel
};

/**
 * Registrations, STATICALLY — both key casings, because the reattachment
 * lookup's casing varies by jsgui3 version.
 *
 * Written out rather than looped defensively: jsgui3-server runs a
 * control-elimination pass (JSGUI3_HTML_Control_Optimizer) that scans the
 * bundle's reachable files for which jsgui3-html controls are used and drops
 * the rest with their CSS, and a COMPUTED access on the controls object —
 * `jsgui.controls[name] = Ctrl` — sets dynamic_control_access_detected, which
 * makes that pass fail OPEN and keep the whole library.
 *
 * HONESTLY: switching this loop to plain assignments did NOT recover the
 * elimination here — served CSS stayed at 144 KB against 28 KB before the
 * split, and naming the stock controls in this entry file did not move it
 * either. So the elimination is failing open for a reason not yet identified;
 * the static form is kept because it is one fewer thing that can trip it, not
 * because it was measured to fix it. Open, with a measured axis: served CSS
 * 144 KB → back to ~28 KB.
 */
jsgui.controls = jsgui.controls || {};
jsgui.controls.project_status_page = Project_Status_Page;
jsgui.controls.Project_Status_Page = Project_Status_Page;
jsgui.controls.status_widget = Status_Widget;
jsgui.controls.Status_Widget = Status_Widget;
jsgui.controls.live_strip = Live_Strip;
jsgui.controls.Live_Strip = Live_Strip;
jsgui.controls.settings_control = Settings_Control;
jsgui.controls.Settings_Control = Settings_Control;
jsgui.controls.player_bar = Player_Bar;
jsgui.controls.Player_Bar = Player_Bar;
jsgui.controls.stat_chips = Stat_Chips;
jsgui.controls.Stat_Chips = Stat_Chips;
jsgui.controls.signal_log = Signal_Log;
jsgui.controls.Signal_Log = Signal_Log;
jsgui.controls.history_panel = History_Panel;
jsgui.controls.History_Panel = History_Panel;
jsgui.controls.milestones_panel = Milestones_Panel;
jsgui.controls.Milestones_Panel = Milestones_Panel;
jsgui.controls.status_footer = Status_Footer;
jsgui.controls.Status_Footer = Status_Footer;
jsgui.controls.work_panel = Work_Panel;
jsgui.controls.Work_Panel = Work_Panel;
jsgui.controls.modules_panel = Modules_Panel;
jsgui.controls.Modules_Panel = Modules_Panel;
jsgui.controls.road_strip = Road_Strip;
jsgui.controls.Road_Strip = Road_Strip;
jsgui.controls.branch_cards = Branch_Cards;
jsgui.controls.Branch_Cards = Branch_Cards;
jsgui.controls.tree_view = Tree_View;
jsgui.controls.Tree_View = Tree_View;
jsgui.controls.tech_tree_board = Tech_Tree_Board;
jsgui.controls.Tech_Tree_Board = Tech_Tree_Board;
jsgui.controls.tech_tree_node = Tech_Tree_Node;
jsgui.controls.Tech_Tree_Node = Tech_Tree_Node;
jsgui.controls.tech_detail_panel = Tech_Detail_Panel;
jsgui.controls.Tech_Detail_Panel = Tech_Detail_Panel;

module.exports = { ...APP_CONTROLS, Project_Status_Page, Status_Widget, APP_CONTROLS };
