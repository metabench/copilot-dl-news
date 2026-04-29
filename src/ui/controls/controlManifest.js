"use strict";

const manifest = [
  {
    type: "url_listing_table",
    loader: () => require("./UrlListingTable").UrlListingTableControl
  },
  {
    type: "url_filter_toggle",
    loader: () => require("./UrlFilterToggle").UrlFilterToggleControl
  },
  {
    type: "theme_editor",
    loader: () => require("./ThemeEditorControl").ThemeEditorControl
  },
  {
    type: "search_explorer",
    loader: () => require("./SearchExplorerControl").SearchExplorerControl
  },
  {
    type: "pager_button",
    loader: () => require("./PagerButton").PagerButtonControl
  },
  {
    type: "domain_summary_table",
    loader: () => require("./DomainSummaryTable").DomainSummaryTableControl
  },
  {
    type: "action_button_group",
    loader: () => require("./ActionButtonGroupControl").ActionButtonGroupControl
  },
  {
    type: "activity_log",
    loader: () => require("./ActivityLogControl").ActivityLogControl
  },
  {
    type: "crawl_progress_panel",
    loader: () => require("./CrawlProgressPanelControl").CrawlProgressPanelControl
  },
  {
    type: "option_picker",
    loader: () => require("./OptionPickerControl").OptionPickerControl
  }
];

function ensureControlsRegistered(jsguiInstance) {
  if (!jsguiInstance) {
    return [];
  }
  const { registerControlType } = require("./controlRegistry");
  return manifest
    .map((entry) => {
      const ControlClass = typeof entry.loader === "function" ? entry.loader() : null;
      if (!ControlClass) {
        return null;
      }
      registerControlType(entry.type, ControlClass, { jsguiInstance });
      return { type: entry.type, control: ControlClass };
    })
    .filter(Boolean);
}

function listControlTypes() {
  return manifest.map((entry) => entry.type);
}

module.exports = {
  ensureControlsRegistered,
  listControlTypes
};
