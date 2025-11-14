"use strict";

const { TableControl } = require("./Table");
const { buildIndexCell, formatDateTime } = require("./UrlListingTable");

const CRAWL_COLUMNS = Object.freeze([
  { key: "index", label: "#", align: "right", cellClass: "is-index" },
  { key: "jobId", label: "Job ID", align: "right", cellClass: "is-metric" },
  { key: "status", label: "Status", align: "center" },
  { key: "crawlType", label: "Crawl Type" },
  { key: "startedAt", label: "Started", cellClass: "is-timestamp" },
  { key: "endedAt", label: "Ended", cellClass: "is-timestamp" },
  { key: "duration", label: "Duration", align: "right", cellClass: "is-metric" },
  { key: "startUrl", label: "Start URL", cellClass: "is-url" }
]);

function cloneColumn(column) {
  return { ...column };
}

function buildColumns() {
  return CRAWL_COLUMNS.map(cloneColumn);
}

function buildBadge(text, variant = "info") {
  const safeText = text != null && text !== "" ? String(text) : "—";
  return { text: safeText, classNames: `badge badge--${variant}` };
}

function classifyCrawlStatus(status) {
  if (!status) return "muted";
  const normalized = String(status).toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error")) return "danger";
  if (normalized.includes("success") || normalized.includes("complete")) return "success";
  if (normalized.includes("start") || normalized.includes("run")) return "info";
  if (normalized.includes("queue")) return "accent";
  return "warn";
}

function humanizeDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "<1s";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 1) return "<1s";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds && parts.length < 2) parts.push(`${seconds}s`);
  if (!parts.length) parts.push("<1s");
  return parts.join(" ");
}

function formatDurationRange(start, end) {
  const startDate = start ? new Date(start) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) return "—";
  const endDate = end ? new Date(end) : new Date();
  const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
  return humanizeDuration(diffMs);
}

function buildRows(crawls = [], options = {}) {
  const startIndex = Number.isFinite(options.startIndex) ? Math.max(1, Math.trunc(options.startIndex)) : 1;
  return crawls.map((job, index) => {
    const statusVariant = classifyCrawlStatus(job.status);
    const typeLabel = job.crawlType || (job.crawlTypeId ? `Type ${job.crawlTypeId}` : "—");
    return {
      index: buildIndexCell(index, startIndex),
      jobId: job.id != null ? `#${job.id}` : "—",
      status: buildBadge(job.status || "—", statusVariant),
      crawlType: typeLabel,
      startedAt: formatDateTime(job.startedAt, true),
      endedAt: formatDateTime(job.endedAt, true),
      duration: formatDurationRange(job.startedAt, job.endedAt),
      startUrl: job.url ? { text: job.url, title: job.url, classNames: "is-url" } : "—"
    };
  });
}

class CrawlJobsTableControl extends TableControl {
  constructor(spec = {}) {
    const { columns, rows, entries, startIndex } = spec || {};
    const resolvedColumns = Array.isArray(columns) && columns.length ? columns : buildColumns();
    super({ ...spec, columns: resolvedColumns });
    if (spec && spec.el) {
      return;
    }
    if (Array.isArray(rows) && rows.length) {
      this.setRows(rows);
    } else if (Array.isArray(entries) && entries.length) {
      this.setEntries(entries, { startIndex });
    }
  }

  setEntries(entries = [], options = {}) {
    const mapped = buildRows(entries, options);
    this.setRows(mapped);
  }

  static buildColumns() {
    return buildColumns();
  }

  static buildRows(entries = [], options = {}) {
    return buildRows(entries, options);
  }
}

module.exports = {
  CrawlJobsTableControl,
  buildCrawlJobColumns: buildColumns,
  buildCrawlJobRows: buildRows
};
