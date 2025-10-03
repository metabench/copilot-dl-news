import { createControl } from './baseControl.js';
import { createDerivedBinding } from '../jsgui/derivedBinding.js';
import { formatNumber, formatRelativeTime, formatTimestamp } from '../formatters.js';

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function clearElement(node) {
  if (!node) return;
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function renderBadge(text, className = 'badge badge-neutral') {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function renderTopList(listEl, items, emptyLabel) {
  if (!listEl) return;
  clearElement(listEl);
  if (!Array.isArray(items) || items.length === 0) {
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = emptyLabel;
    listEl.appendChild(span);
    return;
  }
  for (const entry of items) {
    const item = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = entry.label;
    item.appendChild(code);
    const count = document.createElement('span');
    count.className = 'muted';
    count.textContent = ` · ${formatNumber(entry.count)}`;
    item.appendChild(count);
    listEl.appendChild(item);
  }
}

function renderSourceList(listEl, counts) {
  if (!listEl) return;
  clearElement(listEl);
  const entries = Object.entries(counts || {})
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  if (!entries.length) {
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = 'No homepage fetches recorded yet.';
    listEl.appendChild(span);
    return;
  }
  for (const [label, count] of entries) {
    const item = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = label;
    item.appendChild(strong);
    const meta = document.createElement('span');
    meta.className = 'muted';
    meta.textContent = ` · ${formatNumber(count)}`;
    item.appendChild(meta);
    listEl.appendChild(item);
  }
}

function renderLog(listEl, entries) {
  if (!listEl) return;
  clearElement(listEl);
  const items = ensureArray(entries).slice(0, 20);
  if (listEl.classList) {
    listEl.classList.toggle('muted', items.length === 0);
  }
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'timeline-empty muted';
    empty.textContent = 'No pattern events yet.';
    listEl.appendChild(empty);
    return;
  }
  for (const entry of items) {
    const card = document.createElement('article');
    card.className = 'pattern-log-entry';
    if (entry.source) {
      card.dataset.source = entry.source;
    }
    if (entry.stage) {
      card.dataset.stage = entry.stage;
    }

    const head = document.createElement('header');
    head.className = 'pattern-log-entry__head';

    const badgeLabel = entry.stage || entry.label || entry.source || 'pattern';
    const badge = renderBadge(badgeLabel, 'badge badge-neutral');
    head.appendChild(badge);

    const meta = document.createElement('span');
    meta.className = 'pattern-log-entry__meta muted';
    const metaParts = [];
    if (entry.status) metaParts.push(entry.status);
    if (Number.isFinite(entry.sectionCount)) metaParts.push(`sections ${entry.sectionCount}`);
    if (Number.isFinite(entry.articleHintsCount)) metaParts.push(`hints ${entry.articleHintsCount}`);
    if (entry.homepageSource) metaParts.push(`source ${entry.homepageSource}`);
    if (entry.notModified) metaParts.push('not-modified');
    if (entry.hadError) metaParts.push('error');
    if (metaParts.length) {
      meta.textContent = metaParts.join(' · ');
      head.appendChild(meta);
    }

    const time = document.createElement('time');
    const ts = entry.timestamp || Date.now();
    time.className = 'pattern-log-entry__time muted';
    time.dateTime = new Date(ts).toISOString();
    time.title = formatTimestamp(ts);
    time.textContent = formatRelativeTime(ts);
    head.appendChild(time);

    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'pattern-log-entry__body';

    if (entry.summary) {
      const summary = document.createElement('p');
      summary.className = 'pattern-log-entry__summary';
      summary.textContent = entry.summary;
      body.appendChild(summary);
    } else if (entry.message) {
      const summary = document.createElement('p');
      summary.className = 'pattern-log-entry__summary';
      summary.textContent = entry.message;
      body.appendChild(summary);
    }

    if (Array.isArray(entry.sections) && entry.sections.length) {
      const sectionsRow = document.createElement('div');
      sectionsRow.className = 'pattern-log-entry__row';
      const label = document.createElement('span');
      label.className = 'pattern-log-entry__label muted';
      label.textContent = 'Sections:';
      sectionsRow.appendChild(label);
      const list = document.createElement('span');
      list.className = 'pattern-log-entry__chips';
      for (const section of entry.sections.slice(0, 6)) {
        const chip = document.createElement('span');
        chip.className = 'pattern-chip';
        chip.textContent = section;
        list.appendChild(chip);
      }
      sectionsRow.appendChild(list);
      body.appendChild(sectionsRow);
    }

    if (Array.isArray(entry.articleHints) && entry.articleHints.length) {
      const hintsRow = document.createElement('div');
      hintsRow.className = 'pattern-log-entry__row';
      const label = document.createElement('span');
      label.className = 'pattern-log-entry__label muted';
      label.textContent = 'Hints:';
      hintsRow.appendChild(label);
      const list = document.createElement('span');
      list.className = 'pattern-log-entry__chips';
      for (const hint of entry.articleHints.slice(0, 6)) {
        const chip = document.createElement('span');
        chip.className = 'pattern-chip pattern-chip--hint';
        chip.textContent = hint;
        list.appendChild(chip);
      }
      hintsRow.appendChild(list);
      body.appendChild(hintsRow);
    }

    if (entry.details && Object.keys(entry.details).length) {
      const detailRow = document.createElement('div');
      detailRow.className = 'pattern-log-entry__row pattern-log-entry__row--details';
      const label = document.createElement('span');
      label.className = 'pattern-log-entry__label muted';
      label.textContent = 'Details:';
      detailRow.appendChild(label);
      const pre = document.createElement('pre');
      pre.className = 'pattern-log-entry__details';
      const text = JSON.stringify(entry.details, null, 2);
      pre.textContent = text.length > 280 ? `${text.slice(0, 277)}…` : text;
      detailRow.appendChild(pre);
      body.appendChild(detailRow);
    }

    card.appendChild(body);
    listEl.appendChild(card);
  }
}

function extractPatternState(state) {
  return {
    summary: state?.patternInsights?.summary || null,
    log: Array.isArray(state?.patternInsights?.log) ? state.patternInsights.log : [],
    crawlType: state?.crawlType || ''
  };
}

export function createPatternInsightsControl({ store, elements }) {
  const {
    panel,
    hint,
    totalCount,
    uniqueSections,
    uniqueHints,
    lastSummary,
    lastStage,
    lastUpdated,
    topSectionsList,
    topHintsList,
    sourceList,
    logContainer
  } = elements;

  let unsubscribe = null;

  const control = createControl({
    id: 'pattern-insights-panel',
    initialData: extractPatternState(store.getState()),
    initialView: {}
  });

  function applyView(summary, log, crawlType) {
    const hasData = !!summary && summary.totalEvents > 0;
    const panelVisible = crawlType === 'intelligent' || hasData;

    if (panel) {
      panel.style.display = panelVisible ? '' : 'none';
      panel.dataset.hasData = hasData ? '1' : '0';
      panel.dataset.mode = crawlType || '';
    }

    if (hint) {
      hint.textContent = hasData
        ? `Last update ${formatRelativeTime(summary.lastEventAt)} (${formatTimestamp(summary.lastEventAt)})`
        : 'Pattern discovery events appear once the intelligent planner runs.';
    }

    if (totalCount) {
      totalCount.textContent = formatNumber(summary?.totalEvents || 0);
    }
    if (uniqueSections) {
      uniqueSections.textContent = formatNumber(summary?.uniqueSections || 0);
    }
    if (uniqueHints) {
      uniqueHints.textContent = formatNumber(summary?.uniqueHints || 0);
    }

    if (lastSummary) {
      lastSummary.textContent = summary?.lastSummary || 'No pattern activity yet.';
    }
    if (lastStage) {
      const parts = [];
      if (summary?.lastStage) parts.push(summary.lastStage);
      if (summary?.lastStatus) parts.push(summary.lastStatus);
      if (summary?.lastHomepageSource) parts.push(`source ${summary.lastHomepageSource}`);
      lastStage.textContent = parts.length ? parts.join(' · ') : '—';
    }
    if (lastUpdated) {
      if (summary?.lastEventAt) {
        lastUpdated.textContent = formatRelativeTime(summary.lastEventAt);
        lastUpdated.title = formatTimestamp(summary.lastEventAt);
      } else {
        lastUpdated.textContent = '—';
        lastUpdated.title = '';
      }
    }

    renderTopList(topSectionsList, summary?.topSections || [], 'No sections inferred yet.');
    renderTopList(topHintsList, summary?.topHints || [], 'No article hints detected yet.');
    renderSourceList(sourceList, summary?.homepageSourceCounts || {});
    renderLog(logContainer, log);
  }

  createDerivedBinding({
    source: control.dataModel,
    inputs: ['summary', 'log', 'crawlType'],
    derive({ values }) {
      return {
        summary: values.summary || null,
        log: ensureArray(values.log),
        crawlType: values.crawlType || ''
      };
    },
    apply(result) {
      applyView(result.summary, result.log, result.crawlType);
    }
  });

  control.on('activate', ({ control: ctrl }) => {
    const initial = extractPatternState(store.getState());
    ctrl.dataModel.replace(initial, { force: true });
    unsubscribe = store.subscribe(({ state }) => {
      ctrl.dataModel.replace(extractPatternState(state));
    });
  });

  control.on('update', ({ control: ctrl, context }) => {
    const state = context && context.state ? context.state : null;
    if (state) {
      ctrl.dataModel.replace(extractPatternState(state));
    }
  });

  control.on('deactivate', () => {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  });

  return control;
}
