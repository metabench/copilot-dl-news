"use strict";

function createDiagramAtlasControls(jsgui) {
  if (!jsgui) {
    throw new Error("jsgui instance is required to build diagram atlas controls");
  }

  const StringControl = jsgui.String_Control;

  class DiagramProgressControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "section",
        __type_name: "diagram_progress"
      };
      super(normalized);
      this.add_class("diagram-loading");
      this.dom.attributes["data-role"] = "diagram-progress";
      this._state = {
        status: spec.status || "loading",
        label: spec.label || "Preparing Diagram Atlas",
        detail: spec.detail || "Collecting sources and metrics..."
      };
      if (!spec.el) {
        this.compose();
      }
      this._syncStateAttributes();
    }

    compose() {
      const pulse = new jsgui.div({ context: this.context, class: "diagram-loading__pulse" });
      const title = new jsgui.h3({ context: this.context, class: "diagram-loading__title" });
      title.add(new StringControl({ context: this.context, text: this._state.label }));
      const detail = new jsgui.p({ context: this.context, class: "diagram-loading__detail" });
      detail.add(new StringControl({ context: this.context, text: this._state.detail }));
      const bar = new jsgui.div({ context: this.context, class: "diagram-loading__bar" });
      const inner = new jsgui.div({ context: this.context, class: "diagram-loading__bar-inner" });
      bar.add(inner);
      this.add(pulse);
      this.add(title);
      this.add(detail);
      this.add(bar);
    }

    setStatus(status, detail) {
      if (status) {
        this._state.status = status;
      }
      if (detail) {
        this._state.detail = detail;
      }
      this._syncStateAttributes();
    }

    _syncStateAttributes() {
      this.dom.attributes["data-state"] = this._state.status;
    }
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return "0 B";
    }
    const units = ["B", "KB", "MB", "GB", "TB"];
    const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / (1024 ** exponent);
    const fixed = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
    return `${fixed} ${units[exponent]}`;
  }

  function formatNumber(value, fallback = "—") {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return value.toLocaleString("en-US");
  }

  function computeTileSize(metric, { min = 72, max = 220 } = {}) {
    if (!Number.isFinite(metric) || metric <= 0) return min;
    const scaled = Math.sqrt(metric);
    return clamp(scaled * 1.4, min, max);
  }

  function resolveTileSize(spec) {
    const options = spec.sizeScale || {};
    if (Number.isFinite(spec.metricRatio)) {
      const clampedRatio = clamp(spec.metricRatio, 0, 1);
      const range = Math.max(0, (options.max || 220) - (options.min || 72));
      return (options.min || 72) + Math.sqrt(clampedRatio) * range;
    }
    return computeTileSize(spec.metric || 0, options);
  }

  function summarizePath(value, segments = 2) {
    if (!value || typeof value !== "string") return value || "";
    const normalized = value.split("\\").join("/");
    const parts = normalized.split("/");
    if (parts.length <= segments) {
      return normalized;
    }
    const tail = parts.slice(-segments).join("/");
    return `.../${tail}`;
  }

  function createPopoverLabel(context, { text = "", fullText = "", className = "diagram-label", clampLines = 1 } = {}) {
    const classes = ["diagram-label"];
    if (className && className !== "diagram-label") {
      classes.push(className);
    }
    const label = new jsgui.div({ context, class: classes.join(" ") });
    if (Number.isFinite(clampLines) && clampLines > 1) {
      label.add_class("diagram-label--multiline");
      const lines = Math.min(Math.max(Math.floor(clampLines), 2), 4);
      const style = label.dom.attributes.style || "";
      label.dom.attributes.style = `${style}--diagram-label-lines:${lines};`;
    }
    const textClasses = [`${className}__text`, "diagram-label__text"].filter(Boolean).join(" ");
    const content = new jsgui.span({ context, class: textClasses });
    content.add(new StringControl({ context, text }));
    label.add(content);
    const normalizedFull = fullText || text;
    if (normalizedFull && normalizedFull !== text) {
      label.add_class("diagram-label--with-popover");
      label.dom.attributes.tabindex = "0";
      const popover = new jsgui.div({ context, class: "diagram-popover" });
      popover.add(new StringControl({ context, text: normalizedFull }));
      label.add(popover);
    }
    return label;
  }

  function createTile(context, spec = {}) {
    const tile = new jsgui.div({ context, class: "diagram-tile" });
    const variant = spec.variant || null;
    if (variant === "db") {
      tile.add_class("diagram-tile--db");
    }
    const styleParts = [];
    if (variant !== "db") {
      const size = resolveTileSize(spec);
      styleParts.push(`width:${size}px`, `height:${size}px`);
    }
    if (Number.isFinite(spec.index)) {
      styleParts.push(`--diagram-tile-index:${spec.index}`);
    }
    if (Number.isFinite(spec.hue)) {
      styleParts.push(`--diagram-tile-hue:${spec.hue}`);
    }
    if (spec.tint) {
      styleParts.push(`--diagram-tile-tint:${spec.tint}`);
    }
    if (styleParts.length) {
      tile.dom.attributes.style = `${styleParts.join(";")};`;
    }
    if (Number.isFinite(spec.bytes)) {
      tile.dom.attributes["data-bytes"] = String(spec.bytes);
    }
    if (Number.isFinite(spec.lines)) {
      tile.dom.attributes["data-lines"] = String(spec.lines);
    }
    if (Number.isFinite(spec.functions)) {
      tile.dom.attributes["data-functions"] = String(spec.functions);
    }
    if (spec.color) {
      tile.dom.attributes["data-color"] = spec.color;
    }
    if (spec.category) {
      tile.dom.attributes["data-category"] = spec.category;
    }
    if (spec.tone) {
      tile.dom.attributes["data-tone"] = spec.tone;
    }
    if (spec.title) {
      tile.dom.attributes.title = spec.title;
    }
    if (spec.badge) {
      const badge = new jsgui.span({ context, class: "diagram-tile__badge" });
      badge.add(new StringControl({ context, text: spec.badge }));
      tile.add(badge);
    }
    const label = createPopoverLabel(context, {
      text: spec.label || "",
      fullText: spec.fullLabel || spec.label || "",
      className: "diagram-tile__label",
      clampLines: spec.labelLines || 1
    });
    const value = new jsgui.div({ context, class: "diagram-tile__value" });
    value.add(new StringControl({ context, text: spec.value || "" }));
    tile.add(label);
    tile.add(value);
    if (spec.caption) {
      const caption = new jsgui.div({ context, class: "diagram-tile__caption" });
      caption.add(new StringControl({ context, text: spec.caption }));
      tile.add(caption);
    }
    if (Array.isArray(spec.meta) && spec.meta.length) {
      const metaWrap = new jsgui.div({ context, class: "diagram-tile__meta" });
      spec.meta.forEach((entry) => {
        if (!entry || !entry.label) return;
        const metaEntry = new jsgui.div({ context, class: "diagram-tile__meta-item" });
        const metaLabel = new jsgui.span({ context, class: "diagram-tile__meta-label" });
        metaLabel.add(new StringControl({ context, text: entry.label }));
        const metaValue = new jsgui.span({ context, class: "diagram-tile__meta-value" });
        metaValue.add(new StringControl({ context, text: entry.value || "—" }));
        metaEntry.add(metaLabel);
        metaEntry.add(metaValue);
        metaWrap.add(metaEntry);
      });
      tile.add(metaWrap);
    }
    return tile;
  }

  function createSection(context, heading, description) {
    const section = new jsgui.Control({ context, tagName: "section" });
    section.add_class("diagram-section");
    const title = new jsgui.h2({ context, class: "diagram-section__title" });
    title.add(new StringControl({ context, text: heading }));
    section.add(title);
    if (description) {
      const desc = new jsgui.p({ context, class: "diagram-section__description" });
      desc.add(new StringControl({ context, text: description }));
      section.add(desc);
    }
    return section;
  }

  function createGrid(context) {
    const grid = new jsgui.div({ context, class: "diagram-grid" });
    return grid;
  }

  function createLegend(context, items) {
    if (!Array.isArray(items) || !items.length) return null;
    const legend = new jsgui.div({ context, class: "diagram-legend" });
    items.forEach((item) => {
      if (!item || !item.label) return;
      const entry = new jsgui.div({ context, class: "diagram-legend__item" });
      const swatch = new jsgui.span({ context, class: "diagram-legend__swatch" });
      if (item.color) {
        swatch.dom.attributes.style = `background:${item.color};`;
      }
      const text = new jsgui.span({ context, class: "diagram-legend__label" });
      text.add(new StringControl({ context, text: item.label }));
      entry.add(swatch);
      entry.add(text);
      legend.add(entry);
    });
    return legend;
  }

  function createSummaryStat(context, label, value, detail) {
    const stat = new jsgui.div({ context, class: "diagram-code-summary__item" });
    const labelNode = new jsgui.span({ context, class: "diagram-code-summary__label" });
    labelNode.add(new StringControl({ context, text: label }));
    const valueNode = new jsgui.span({ context, class: "diagram-code-summary__value" });
    valueNode.add(new StringControl({ context, text: value }));
    stat.add(labelNode);
    stat.add(valueNode);
    if (detail) {
      const detailNode = new jsgui.span({ context, class: "diagram-code-summary__detail" });
      detailNode.add(new StringControl({ context, text: detail }));
      stat.add(detailNode);
    }
    return stat;
  }

  function buildCodeSummary(context, summary = {}) {
    const stats = [];
    if (summary && Number.isFinite(summary.totalBytes)) {
      const rawBytes = summary.totalBytes;
      stats.push({
        label: "Total bytes",
        value: formatBytes(rawBytes),
        detail: `${formatNumber(rawBytes)} bytes raw`
      });
    }
    if (summary && Number.isFinite(summary.totalLines)) {
      stats.push({
        label: "Lines",
        value: formatNumber(summary.totalLines)
      });
    }
    if (summary && Number.isFinite(summary.fileCount)) {
      stats.push({
        label: "Files",
        value: formatNumber(summary.fileCount)
      });
    }
    if (!stats.length) {
      return null;
    }
    const block = new jsgui.div({ context, class: "diagram-code-summary" });
    stats.forEach((entry) => {
      block.add(createSummaryStat(context, entry.label, entry.value, entry.detail));
    });
    return block;
  }

  function resolveEntryMetric(entry) {
    if (!entry || typeof entry !== "object") return 0;
    if (Number.isFinite(entry.bytes) && entry.bytes > 0) {
      return entry.bytes;
    }
    if (Number.isFinite(entry.lines) && entry.lines > 0) {
      return entry.lines;
    }
    return 0;
  }

  function createDirectoryMetric(context, label, value) {
    const metric = new jsgui.span({ context, class: "diagram-code-directory__metric" });
    const labelNode = new jsgui.span({ context, class: "diagram-code-directory__metric-label" });
    labelNode.add(new StringControl({ context, text: label }));
    const valueNode = new jsgui.span({ context, class: "diagram-code-directory__metric-value" });
    valueNode.add(new StringControl({ context, text: value }));
    metric.add(labelNode);
    metric.add(valueNode);
    return metric;
  }

  function createDirectoryRow(context, directory, maxMetric) {
    const row = new jsgui.div({ context, class: "diagram-code-directory" });
    if (Number.isFinite(directory.bytes)) {
      row.dom.attributes["data-bytes"] = String(directory.bytes);
    }
    if (Number.isFinite(directory.files)) {
      row.dom.attributes["data-files"] = String(directory.files);
    }
    const label = createPopoverLabel(context, {
      text: summarizePath(directory.directory, 3) || directory.directory || "(root)",
      fullText: directory.directory,
      className: "diagram-code-directory__label"
    });
    row.add(label);
    const metrics = new jsgui.div({ context, class: "diagram-code-directory__metrics" });
    const bytesText = Number.isFinite(directory.bytes) ? formatBytes(directory.bytes) : "—";
    const linesText = formatNumber(directory.lines);
    const filesText = formatNumber(directory.files);
    metrics.add(createDirectoryMetric(context, "Bytes", bytesText));
    metrics.add(createDirectoryMetric(context, "Lines", linesText));
    metrics.add(createDirectoryMetric(context, "Files", filesText));
    row.add(metrics);
    const bar = new jsgui.div({ context, class: "diagram-code-directory__bar" });
    const fill = new jsgui.div({ context, class: "diagram-code-directory__bar-fill" });
    const metricValue = resolveEntryMetric(directory);
    const ratio = maxMetric ? clamp(metricValue / maxMetric, 0.04, 1) : 0;
    fill.dom.attributes.style = `width:${(ratio * 100).toFixed(2)}%;`;
    bar.add(fill);
    row.add(bar);
    return row;
  }

  function buildDirectoryList(context, directories) {
    if (!Array.isArray(directories) || !directories.length) {
      return null;
    }
    const topDirectories = directories.slice(0, 8);
    const maxMetric = topDirectories.reduce((max, entry) => Math.max(max, resolveEntryMetric(entry)), 0) || 1;
    const wrapper = new jsgui.div({ context, class: "diagram-code-directories" });
    const heading = new jsgui.h3({ context, class: "diagram-section__subheading" });
    heading.add(new StringControl({ context, text: "Top directories" }));
    wrapper.add(heading);
    const list = new jsgui.div({ context, class: "diagram-code-directories__list" });
    topDirectories.forEach((entry) => {
      list.add(createDirectoryRow(context, entry, maxMetric));
    });
    wrapper.add(list);
    return wrapper;
  }

  function buildCodeSection(context, codeData) {
    const section = createSection(context, "Codebase Map", "Top files sized by byte count (fs.stat + js-scan --build-index).");
    section.add_class("diagram-section--code");
    const summary = buildCodeSummary(context, codeData && codeData.summary);
    const grid = createGrid(context);
    const files = Array.isArray(codeData && codeData.topFiles) ? codeData.topFiles.slice(0, 30) : [];
    const maxMetric = files.reduce((max, file) => Math.max(max, resolveEntryMetric(file)), 0) || 1;
    const tonePalette = ["teal", "violet", "amber", "berry", "cyan"];
    files.forEach((file, index) => {
      const label = file.file;
      const lines = file.lines || 0;
      const bytes = file.bytes || 0;
      const shortLabel = summarizePath(label, 3);
      const tileTone = tonePalette[index % tonePalette.length];
      const hue = 210 + (index * 9);
      const tile = createTile(context, {
        label: shortLabel,
        fullLabel: label,
        value: formatBytes(bytes),
        metricRatio: clamp(resolveEntryMetric(file) / maxMetric, 0, 1),
        sizeScale: { min: 80, max: 260 },
        caption: file.entryPoint ? "entry" : null,
        title: `${label}\n${formatBytes(bytes)}\n${lines} lines\n${file.functions || 0} functions`,
        bytes,
        lines,
        functions: file.functions || 0,
        index,
        category: file.entryPoint ? "entry" : "file",
        tone: tileTone,
        hue,
        badge: file.entryPoint ? "Entry" : null,
        labelLines: 2,
        meta: [
          { label: "Lines", value: lines.toLocaleString("en-US") },
          { label: "Funcs", value: (file.functions || 0).toLocaleString("en-US") }
        ]
      });
      grid.add(tile);
    });
    const layout = new jsgui.div({ context, class: "diagram-code-layout" });
    const sidebar = new jsgui.div({ context, class: "diagram-code-sidebar" });
    let sidebarHasContent = false;
    if (summary) {
      sidebar.add(summary);
      sidebarHasContent = true;
    }
    const directories = buildDirectoryList(context, codeData && codeData.directories);
    if (directories) {
      sidebar.add(directories);
      sidebarHasContent = true;
    }
    if (sidebarHasContent) {
      layout.add(sidebar);
    }
    const gridWrap = new jsgui.div({ context, class: "diagram-code-grid" });
    gridWrap.add(grid);
    layout.add(gridWrap);
    section.add(layout);
    return section;
  }

  function buildDbSection(context, dbData) {
    const section = createSection(context, "Database Structure", "Tables parsed from migration SQL files (column count as area).");
    section.add_class("diagram-section--db");
    const grid = createGrid(context);
    const tables = Array.isArray(dbData && dbData.tables) ? dbData.tables.slice(0, 24) : [];
    const maxColumns = tables.reduce((max, table) => Math.max(max, table.columnCount || 0), 0) || 1;
    tables.forEach((table, index) => {
      const foreignKeyCount = Array.isArray(table.foreignKeys) ? table.foreignKeys.length : 0;
      const tile = createTile(context, {
        label: table.name,
        value: `${table.columnCount || 0} columns`,
        metric: (table.columnCount || 0) / maxColumns * 400 + 20,
        caption: foreignKeyCount ? `${foreignKeyCount} links` : null,
        title: `${table.name}\nColumns: ${(table.columns || []).join(", ")}`,
        category: "table",
        tone: foreignKeyCount ? "violet" : "teal",
        hue: 160 + (index * 11),
        badge: foreignKeyCount ? `${foreignKeyCount} FK` : null,
        variant: "db",
        meta: [
          { label: "Columns", value: formatNumber(table.columnCount) },
          { label: "FK", value: formatNumber(foreignKeyCount) }
        ]
      });
      grid.add(tile);
    });
    section.add(grid);
    return section;
  }

  function buildFeatureSection(context, featureData) {
    const section = createSection(context, "Feature Footprints", "Each feature aggregates multiple files plus intra-file segments (js-scan --deps-of + js-edit --list-functions).");
    section.add_class("diagram-section--features");
    const features = Array.isArray(featureData && featureData.features) ? featureData.features : [];
    const legend = features.length ? createLegend(context, features.map((feature) => ({ label: feature.name, color: feature.color }))) : null;
    if (legend) {
      section.add(legend);
    }
    if (!features.length) {
      return section;
    }
    const featureGrid = new jsgui.div({ context, class: "diagram-feature-grid" });
    features.forEach((feature, featureIndex) => {
      const article = new jsgui.Control({ context, tagName: "article" });
      article.add_class("diagram-feature");
      if (feature.color) {
        article.dom.attributes["data-color"] = feature.color;
      }
      article.dom.attributes["data-feature-index"] = String(featureIndex);
      const totalLines = Number(feature.totalLines) || 0;
      const filesForFeature = Array.isArray(feature.files) ? feature.files : [];
      const header = new jsgui.div({ context, class: "diagram-feature__header" });
      const title = new jsgui.h3({ context, class: "diagram-feature__title" });
      title.add(new StringControl({ context, text: feature.name }));
      header.add(title);
      const stats = new jsgui.div({ context, class: "diagram-feature__stats" });
      const statEntries = [
        { label: "Files", value: filesForFeature.length.toLocaleString("en-US") },
        { label: "Lines", value: totalLines.toLocaleString("en-US") }
      ];
      statEntries.forEach((entry) => {
        const stat = new jsgui.div({ context, class: "diagram-feature__stat" });
        const statLabel = new jsgui.span({ context, class: "diagram-feature__stat-label" });
        statLabel.add(new StringControl({ context, text: entry.label }));
        const statValue = new jsgui.span({ context, class: "diagram-feature__stat-value" });
        statValue.add(new StringControl({ context, text: entry.value }));
        stat.add(statLabel);
        stat.add(statValue);
        stats.add(stat);
      });
      header.add(stats);
      if (feature.tags && feature.tags.length) {
        const tags = new jsgui.div({ context, class: "diagram-feature__tags" });
        feature.tags.forEach((tag) => {
          const pill = new jsgui.span({ context, class: "diagram-feature__tag" });
          pill.add(new StringControl({ context, text: tag }));
          tags.add(pill);
        });
        header.add(tags);
      }
      if (feature.description) {
        const desc = new jsgui.p({ context, class: "diagram-feature__description" });
        desc.add(new StringControl({ context, text: feature.description }));
        header.add(desc);
      }
      article.add(header);

      const fileList = new jsgui.div({ context, class: "diagram-feature__files" });
      const files = filesForFeature.slice(0, 10);
      const maxLines = files.reduce((max, file) => Math.max(max, file.lines || 1), 1);
      files.forEach((file) => {
        const row = new jsgui.div({ context, class: "diagram-feature__file-row" });
        const widthPercent = clamp((file.lines || 0) / maxLines, 0.05, 1) * 100;
        const bar = new jsgui.div({ context, class: "diagram-feature__file-bar" });
        bar.dom.attributes.style = `--diagram-feature-width:${widthPercent}%;--diagram-feature-color:${feature.color || "#5b7c99"};`;
        const label = createPopoverLabel(context, {
          text: summarizePath(file.file, 3),
          fullText: file.file,
          className: "diagram-feature__file-label",
          clampLines: 2
        });
        let via = null;
        if (file.via) {
          via = new jsgui.span({ context, class: "diagram-feature__file-meta" });
          via.add(new StringControl({ context, text: file.via }));
        }
        row.add(bar);
        row.add(label);
        if (via) {
          row.add(via);
        }
        const segmentsWrap = new jsgui.div({ context, class: "diagram-feature__segments" });
        const segmentEntry = (feature.segments || []).find((segment) => segment.file === file.file);
        if (segmentEntry && Array.isArray(segmentEntry.functions) && segmentEntry.functions.length) {
          const maxBytes = segmentEntry.functions.reduce((max, fn) => Math.max(max, fn.byteLength || 1), 1);
          segmentEntry.functions.forEach((fn) => {
            const fnSpan = new jsgui.span({ context, class: "diagram-feature__segment" });
            const pct = clamp((fn.byteLength || 0) / maxBytes, 0.05, 1) * 100;
            fnSpan.dom.attributes.style = `width:${pct}%;`;
            fnSpan.dom.attributes.title = `${fn.name} (${fn.byteLength} bytes @ line ${fn.line})`;
            fnSpan.add(new StringControl({ context, text: fn.name }));
            segmentsWrap.add(fnSpan);
          });
        }
        row.add(segmentsWrap);
        fileList.add(row);
      });
      article.add(fileList);
      featureGrid.add(article);
    });
    section.add(featureGrid);
    return section;
  }

  function buildDiagramAtlasStyles() {
    return `
:root {
  --diagram-bg: #05060d;
  --diagram-panel: #101628;
  --diagram-text: #f4f7ff;
  --diagram-muted: #9ba5c4;
  --diagram-accent: #4cc9f0;
  --diagram-accent-strong: #ff7b9c;
  --diagram-accent-amber: #f6c177;
  --diagram-accent-berry: #c77dff;
  --diagram-font-display: "Spectral", "Georgia", serif;
  --diagram-font-body: "IBM Plex Sans", "Segoe UI", sans-serif;
  --diagram-font-mono: "IBM Plex Mono", "Consolas", monospace;
}
body {
  font-family: var(--diagram-font-body);
  background: radial-gradient(circle at 20% 20%, rgba(76, 201, 240, 0.08), transparent 45%),
    radial-gradient(circle at 80% 10%, rgba(199, 125, 255, 0.08), transparent 40%),
    var(--diagram-bg);
  color: var(--diagram-text);
  margin: 0;
  padding: 0;
}
.diagram-shell {
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  min-height: 100vh;
  position: relative;
  overflow: hidden;
}
.diagram-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(76,201,240,0.08), rgba(199,125,255,0.06) 40%, transparent),
    repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 40px);
  pointer-events: none;
  z-index: 0;
}
.diagram-shell > * {
  position: relative;
  z-index: 1;
}
.diagram-shell__sections {
  display: flex;
  flex-direction: column;
  gap: 32px;
}
.diagram-shell__placeholder {
  padding: 32px;
  border-radius: 16px;
  border: 1px dashed rgba(255,255,255,0.2);
  text-align: center;
  color: var(--diagram-muted);
}
.diagram-shell__header {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  border-radius: 20px;
  background: rgba(10, 14, 32, 0.7);
  border: 1px solid rgba(255,255,255,0.04);
  box-shadow: 0 20px 40px rgba(2,8,23,0.6);
  position: relative;
  overflow: hidden;
}
.diagram-hero {
  isolation: isolate;
}
.diagram-shell__header::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 10% 10%, rgba(76,201,240,0.25), transparent 55%),
    radial-gradient(circle at 80% 0%, rgba(199,125,255,0.25), transparent 60%);
  opacity: 0.6;
  pointer-events: none;
}
.diagram-shell__header > * {
  position: relative;
  z-index: 1;
}
.diagram-shell__subtitle {
  color: rgba(244,247,255,0.72);
  margin: 0;
  font-size: 0.95rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 500;
  line-height: 1.5;
}
.diagram-hero__heading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.diagram-hero__heading h1 {
  margin: 0;
  font-size: 2.2rem;
}
.diagram-hero__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}
.diagram-toolbar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.diagram-toolbar__status,
.diagram-toolbar__actions,
.diagram-toolbar__progress {
  background: rgba(8, 12, 24, 0.8);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 18px;
  padding: 16px 20px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
}
.diagram-toolbar__status-title {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.75rem;
  color: var(--diagram-muted);
}
.diagram-toolbar__status-value {
  display: block;
  margin-top: 6px;
  font-size: 1.05rem;
  font-weight: 600;
}
.diagram-toolbar__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
}
.diagram-toolbar__hint {
  font-size: 0.78rem;
  color: var(--diagram-muted);
}
.diagram-toolbar__progress {
  display: flex;
  align-items: center;
}
.diagram-toolbar__progress .diagram-loading {
  background: transparent;
  border: none;
  padding: 0;
  box-shadow: none;
}
.diagram-section {
  background: var(--diagram-panel);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
  animation: diagram-section-reveal 0.8s ease both;
}
.diagram-section--code {
  background: linear-gradient(135deg, rgba(76,201,240,0.1), rgba(5,6,13,0.95));
}
.diagram-section--db {
  background: linear-gradient(135deg, rgba(246,193,119,0.12), rgba(5,6,13,0.95));
  --diagram-db-min-width: 420px;
}
.diagram-section--db .diagram-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--diagram-db-min-width, 420px), 1fr));
  align-items: stretch;
}
.diagram-tile--db {
  width: auto !important;
  height: auto !important;
  min-height: 140px;
  padding: 18px 24px;
  gap: 12px;
}
.diagram-tile--db .diagram-tile__label__text {
  white-space: nowrap;
}
.diagram-tile--db .diagram-tile__meta {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12px;
}
.diagram-section--features {
  background: linear-gradient(135deg, rgba(199,125,255,0.12), rgba(5,6,13,0.95));
}
.diagram-section__title {
  margin: 0 0 8px;
  font-family: var(--diagram-font-display);
}
.diagram-section__description {
  margin: 0 0 16px;
  color: var(--diagram-muted);
}
.diagram-section__subheading {
  margin: 24px 0 12px;
  font-size: 0.85rem;
  color: var(--diagram-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.diagram-code-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}
.diagram-code-summary__item {
  background: rgba(255,255,255,0.04);
  border-radius: 12px;
  padding: 12px 16px;
  min-width: 160px;
  flex: 1 1 160px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
  animation: diagram-chip-reveal 0.7s ease both;
}
.diagram-code-summary__label {
  display: block;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--diagram-muted);
}
.diagram-code-summary__value {
  display: block;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--diagram-text);
  font-family: var(--diagram-font-display);
}
.diagram-code-summary__detail {
  display: block;
  font-size: 0.75rem;
  color: var(--diagram-muted);
}
.diagram-code-layout {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.diagram-code-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.diagram-code-grid {
  position: relative;
}
.diagram-code-grid::before {
  content: "";
  position: absolute;
  inset: 4px;
  border-radius: 20px;
  border: 1px dashed rgba(255,255,255,0.04);
  pointer-events: none;
}
.diagram-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.diagram-tile {
  --diagram-tile-hue: 210;
  --diagram-tile-tint: 62%;
  border-radius: 16px;
  background: linear-gradient(135deg, hsla(var(--diagram-tile-hue), 80%, var(--diagram-tile-tint), 0.2), rgba(255,255,255,0.02));
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  padding: 14px;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 12px 24px rgba(5,6,13,0.45);
  position: relative;
  overflow: hidden;
  animation: diagram-tile-reveal 0.75s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  animation-delay: calc(var(--diagram-tile-index, 0) * 40ms);
}
.diagram-tile::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 20%, rgba(255,255,255,0.15), transparent 55%);
  opacity: 0.5;
  pointer-events: none;
}
.diagram-tile > * {
  position: relative;
  z-index: 1;
}
.diagram-tile[data-tone="violet"] {
  --diagram-tile-hue: 278;
}
.diagram-tile[data-tone="amber"] {
  --diagram-tile-hue: 40;
}
.diagram-tile[data-tone="berry"] {
  --diagram-tile-hue: 320;
}
.diagram-tile[data-tone="cyan"] {
  --diagram-tile-hue: 195;
}
.diagram-tile__badge {
  align-self: flex-start;
  background: rgba(255,255,255,0.12);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--diagram-text);
}
.diagram-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.diagram-label__text {
  display: inline-flex;
  max-width: 100%;
}
.diagram-label--multiline .diagram-label__text {
  display: -webkit-box;
  -webkit-line-clamp: var(--diagram-label-lines, 2);
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.diagram-tile__label {
  font-size: 0.85rem;
  color: rgba(235, 245, 255, 0.92);
  display: block;
  line-height: 1.35;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.diagram-tile__value {
  font-size: 1rem;
  font-weight: 600;
}
.diagram-tile__caption {
  font-size: 0.75rem;
  color: var(--diagram-muted);
}
.diagram-label--with-popover {
  position: relative;
  cursor: pointer;
  outline: none;
}
.diagram-label--with-popover:focus-visible {
  outline: 1px dashed rgba(59,160,255,0.8);
  outline-offset: 2px;
}
.diagram-popover {
  position: absolute;
  left: 0;
  top: 100%;
  transform: translateY(6px);
  background: rgba(2, 8, 23, 0.95);
  color: var(--diagram-text);
  padding: 6px 8px;
  border-radius: 6px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
  font-size: 0.75rem;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 4;
}
.diagram-label--with-popover:hover .diagram-popover,
.diagram-label--with-popover:focus .diagram-popover {
  opacity: 1;
}
.diagram-tile__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 6px;
  font-size: 0.7rem;
  line-height: 1.4;
  color: var(--diagram-muted);
}
.diagram-tile__meta-item {
  display: flex;
  gap: 4px;
  align-items: baseline;
}
.diagram-tile__meta-label {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(244,247,255,0.68);
  font-weight: 600;
}
.diagram-tile__meta-value {
  color: var(--diagram-text);
}
.diagram-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}
.diagram-legend__item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
}
.diagram-legend__swatch {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: rgba(255,255,255,0.4);
}
.diagram-feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}
.diagram-feature {
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.05);
  background: rgba(255,255,255,0.02);
  padding: 18px;
  box-shadow: 0 14px 30px rgba(4,6,12,0.6);
  animation: diagram-section-reveal 0.6s ease both;
}
.diagram-feature__header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.diagram-feature__title {
  margin: 0;
  font-size: 1.28rem;
  font-family: var(--diagram-font-display);
}
.diagram-feature__stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.diagram-feature__stat-label {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(244,247,255,0.65);
}
.diagram-feature__stat-value {
  font-size: 1rem;
  font-weight: 600;
  font-family: var(--diagram-font-body);
}
.diagram-feature__stat {
  background: rgba(255,255,255,0.03);
  border-radius: 12px;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  min-width: 90px;
}
.diagram-feature__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.diagram-feature__tag {
  background: rgba(255,255,255,0.08);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 0.72rem;
  letter-spacing: 0.05em;
}
.diagram-feature__description {
  font-size: 1rem;
  line-height: 1.6;
  margin: 4px 0 0;
  color: rgba(244,247,255,0.9);
}
.diagram-feature__files {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.diagram-feature__file-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 140px);
  grid-template-areas:
    "bar bar"
    "label meta"
    "segments segments";
  gap: 8px 12px;
  background: rgba(255,255,255,0.03);
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.03);
}
.diagram-feature__file-bar {
  grid-area: bar;
  position: relative;
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  overflow: hidden;
}
.diagram-feature__file-bar::after {
  content: "";
  position: absolute;
  inset: 0;
  width: var(--diagram-feature-width, 50%);
  background: linear-gradient(90deg, rgba(255,255,255,0.15), var(--diagram-feature-color, #5b7c99));
  border-radius: inherit;
}
.diagram-feature__file-label {
  font-size: 0.9rem;
  color: rgba(235, 245, 255, 0.9);
  grid-area: label;
  line-height: 1.4;
  font-weight: 600;
  white-space: normal;
}
.diagram-feature__file-label .diagram-label__text {
  display: inline;
  white-space: normal;
}
.diagram-feature__file-meta {
  font-size: 0.72rem;
  color: var(--diagram-muted);
  grid-area: meta;
  justify-self: end;
  letter-spacing: 0.04em;
}
.diagram-feature__segments {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  row-gap: 6px;
  grid-area: segments;
}
.diagram-feature__segment {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  font-size: 0.65rem;
  padding: 2px 4px;
  border-radius: 4px;
  background: rgba(255,255,255,0.06);
  white-space: nowrap;
  max-width: 48%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.diagram-code-directories {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.diagram-code-directories__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.diagram-code-directory {
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(255,255,255,0.03);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
  backdrop-filter: blur(6px);
  animation: diagram-chip-reveal 0.8s ease both;
}
.diagram-code-directory__label {
  font-size: 0.9rem;
  color: rgba(235,245,255,0.95);
}
.diagram-code-directory__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 8px 0 10px;
  font-size: 0.75rem;
  color: var(--diagram-muted);
}
.diagram-code-directory__metric {
  display: flex;
  gap: 4px;
  align-items: baseline;
}
.diagram-code-directory__metric-label {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.68rem;
  color: rgba(244,247,255,0.65);
  font-weight: 600;
}
.diagram-code-directory__metric-value {
  color: var(--diagram-text);
}
.diagram-code-directory__bar {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  overflow: hidden;
}
.diagram-code-directory__bar-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(59,160,255,0.2), rgba(59,160,255,0.9));
  border-radius: inherit;
  transition: width 0.2s ease;
}
.diagram-loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  border-radius: 16px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
}
.diagram-loading[data-state="error"] {
  border-color: rgba(255,120,120,0.5);
}
.diagram-loading__pulse {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(59,160,255,0.9) 0%, rgba(59,160,255,0) 70%);
  box-shadow: 0 0 40px rgba(59,160,255,0.5);
  animation: diagram-pulse 1.6s ease-in-out infinite;
}
.diagram-loading__title {
  margin: 0;
  font-size: 1.1rem;
}
.diagram-loading__detail {
  margin: 0;
  color: var(--diagram-muted);
}
.diagram-loading__bar {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  overflow: hidden;
}
.diagram-loading__bar-inner {
  width: 45%;
  height: 100%;
  background: linear-gradient(90deg, rgba(59,160,255,0.1), rgba(59,160,255,0.9));
  border-radius: inherit;
  animation: diagram-bar 1.2s ease-in-out infinite;
}
.diagram-loading[data-state="complete"] .diagram-loading__bar-inner {
  width: 100%;
  animation: none;
  background: linear-gradient(90deg, rgba(59,160,255,0.3), rgba(59,160,255,1));
}
.diagram-loading[data-state="error"] .diagram-loading__bar-inner {
  width: 100%;
  animation: none;
  background: linear-gradient(90deg, rgba(255,120,120,0.2), rgba(255,120,120,0.9));
}
@keyframes diagram-pulse {
  0% { transform: scale(0.9); opacity: 0.75; }
  50% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.75; }
}
@keyframes diagram-bar {
  0% { transform: translateX(-40%); }
  50% { transform: translateX(0%); }
  100% { transform: translateX(110%); }
}
.diagram-diagnostics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}
.diagram-diagnostics__item {
  position: relative;
  padding: 16px 18px;
  border-radius: 16px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.04);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
  min-height: 90px;
  overflow: hidden;
}
.diagram-diagnostics__item::before {
  content: attr(data-icon);
  position: absolute;
  top: 12px;
  right: 16px;
  font-size: 1.4rem;
  opacity: 0.15;
}
.diagram-diagnostics__label {
  text-transform: uppercase;
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  color: rgba(244,247,255,0.75);
  font-family: var(--diagram-font-body);
  font-weight: 600;
}
.diagram-diagnostics__value {
  font-size: 1.35rem;
  font-weight: 600;
  line-height: 1.3;
  font-family: var(--diagram-font-display);
}
.diagram-diagnostics__detail {
  font-size: 0.75rem;
  color: var(--diagram-muted);
  letter-spacing: 0.04em;
}
.diagram-button {
  border: none;
  border-radius: 999px;
  padding: 10px 22px;
  font-size: 1rem;
  letter-spacing: 0.04em;
  font-weight: 600;
  cursor: pointer;
  background: var(--diagram-accent);
  color: #020817;
  transition: opacity 0.2s ease;
  box-shadow: 0 10px 25px rgba(76,201,240,0.3);
}
.diagram-button[data-loading="1"],
.diagram-button:disabled {
  opacity: 0.6;
  cursor: wait;
}

@media (min-width: 1100px) {
  .diagram-shell__header {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-end;
  }
  .diagram-code-layout {
    flex-direction: row;
    align-items: flex-start;
  }
  .diagram-code-sidebar {
    flex: 0 0 320px;
    position: sticky;
    top: 32px;
  }
  .diagram-code-grid {
    flex: 1;
  }
}

@keyframes diagram-section-reveal {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes diagram-chip-reveal {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes diagram-tile-reveal {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
  `;
  }

  return {
    DiagramProgressControl,
    buildDiagramAtlasStyles,
    buildCodeSection,
    buildDbSection,
    buildFeatureSection
  };
}

module.exports = {
  createDiagramAtlasControls
};
