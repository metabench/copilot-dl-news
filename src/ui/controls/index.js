"use strict";

const { TableControl } = require("./Table");
const PagerButtonControl = require("./PagerButton");
const SparklineControl = require("./Sparkline");
const { UrlListingTableControl } = require("./UrlListingTable");
const { DomainSummaryTableControl } = require("./DomainSummaryTable");
const { DomainDownloadsTableControl } = require("./DomainDownloadsTable");
const { CrawlJobsTableControl } = require("./CrawlJobsTable");
const { ErrorLogTableControl } = require("./ErrorLogTable");
const { ConfigMatrixControl } = require("./ConfigMatrixControl");
const { CrawlBehaviorPanelControl } = require("./CrawlBehaviorPanel");
const { CrawlConfigWorkspaceControl } = require("./CrawlConfigWorkspaceControl");
const { SearchFormControl } = require("./SearchFormControl");
const { MetricCardControl } = require("./MetricCardControl");
const { ThemeEditorControl } = require("./ThemeEditorControl");

module.exports = {
  TableControl,
  PagerButtonControl,
  SparklineControl,
  UrlListingTableControl,
  DomainSummaryTableControl,
  DomainDownloadsTableControl,
  CrawlJobsTableControl,
  ErrorLogTableControl,
  ConfigMatrixControl,
  CrawlBehaviorPanelControl,
  CrawlConfigWorkspaceControl,
  SearchFormControl,
  MetricCardControl,
  ThemeEditorControl
};
