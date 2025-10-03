import { createControl } from './baseControl.js';
import { createDerivedBinding } from '../jsgui/derivedBinding.js';
import { formatRelativeTime, formatTimestamp } from '../formatters.js';

function clearElement(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function groupByDay(items) {
  const groups = new Map();
  for (const entry of items) {
    const ts = entry.timestamp || entry.ts || Date.now();
    const date = new Date(ts);
    const key = Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  }
  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

function renderTimelineEntry(entry) {
  const item = document.createElement('article');
  item.className = 'timeline-card';
  if (entry.kind) {
    item.dataset.kind = entry.kind;
  }
  const header = document.createElement('header');
  header.className = 'timeline-card__head';

  const badge = document.createElement('span');
  badge.className = entry.badgeClass || 'badge badge-neutral';
  badge.textContent = entry.title || 'event';
  header.appendChild(badge);

  if (entry.meta) {
    const meta = document.createElement('span');
    meta.className = 'timeline-card__meta muted';
    meta.textContent = entry.meta;
    header.appendChild(meta);
  }

  const stamp = document.createElement('time');
  stamp.dateTime = new Date(entry.timestamp || Date.now()).toISOString();
  stamp.title = formatTimestamp(entry.timestamp);
  stamp.className = 'timeline-card__time muted';
  stamp.textContent = formatRelativeTime(entry.timestamp);
  header.appendChild(stamp);

  item.appendChild(header);

  if (entry.detail) {
    const detail = document.createElement('p');
    detail.className = 'timeline-card__detail';
    detail.textContent = entry.detail;
    item.appendChild(detail);
  }

  if (entry.diagram instanceof SVGElement) {
    const svgWrapper = document.createElement('div');
    svgWrapper.className = 'timeline-card__diagram';
    svgWrapper.appendChild(entry.diagram);
    item.appendChild(svgWrapper);
  }

  if (Array.isArray(entry.actions) && entry.actions.length) {
    const actions = document.createElement('div');
    actions.className = 'timeline-card__actions';
    for (const action of entry.actions) {
      const btn = document.createElement('a');
      btn.textContent = action.label;
      btn.href = action.href || '#';
      if (action.target) btn.target = action.target;
      if (action.rel) btn.rel = action.rel;
      btn.className = action.className || 'timeline-action';
      actions.appendChild(btn);
    }
    item.appendChild(actions);
  }

  return item;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function createTimelineControl({ store, element, stateKey, emptyMessage = 'No items yet.' }) {
  if (!element) {
    throw new Error(`timeline control missing element for ${stateKey}`);
  }

  let unsubscribe = null;

  function renderGroups(groups) {
    clearElement(element);
    if (!Array.isArray(groups) || groups.length === 0) {
      const span = document.createElement('div');
      span.className = 'timeline-empty muted';
      span.textContent = emptyMessage;
      element.appendChild(span);
      return;
    }
    for (const group of groups) {
      const section = document.createElement('section');
      section.className = 'timeline-day';
      const dayHeader = document.createElement('h4');
      dayHeader.textContent = group.label;
      dayHeader.className = 'timeline-day__label';
      section.appendChild(dayHeader);
      const list = document.createElement('div');
      list.className = 'timeline-day__entries';
      for (const entry of group.entries) {
        list.appendChild(renderTimelineEntry(entry));
      }
      section.appendChild(list);
      element.appendChild(section);
    }
  }

  const control = createControl({
    id: `timeline:${stateKey}`,
    initialData: { entries: [] },
    initialView: { groups: [], hasEntries: false },
    activate({ control: ctrl }) {
      const current = store.getState();
      ctrl.dataModel.set('entries', ensureArray(current[stateKey] || []), { force: true });
      unsubscribe = store.subscribe(({ state }) => {
        ctrl.dataModel.set('entries', ensureArray(state[stateKey] || []));
      });
    },
    update({ control: ctrl, context }) {
      const state = context && context.state ? context.state : {};
      ctrl.dataModel.set('entries', ensureArray(state[stateKey] || []));
    },
    deactivate() {
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
    }
  });

  createDerivedBinding({
    source: control.dataModel,
    inputs: 'entries',
    target: control.viewModel,
    derive({ values }) {
      const entries = ensureArray(values.entries);
      const grouped = groupByDay(entries);
      return {
        groups: grouped,
        hasEntries: grouped.length > 0
      };
    }
  });

  control.viewModel.onChange('groups', ({ value }) => {
    renderGroups(Array.isArray(value) ? value : []);
  });

  control.viewModel.onChange('hasEntries', ({ value }) => {
    const hasEntries = Boolean(value);
    element.classList.toggle('muted', !hasEntries);
    element.dataset.hasEntries = hasEntries ? '1' : '0';
  });

  return control;
}
