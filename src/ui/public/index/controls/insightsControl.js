import { createControl } from './baseControl.js';
import { createDerivedBinding } from '../jsgui/derivedBinding.js';
import { formatNumber } from '../formatters.js';
import { buildQueueHeatmapDiagram } from '../svg/queueHeatmap.js';

function setText(el, value) {
  if (!el) return;
  el.textContent = value ?? '';
}

function renderList(el, items, formatter) {
  if (!el) return;
  el.innerHTML = '';
  if (!Array.isArray(items) || items.length === 0) {
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = 'No highlights yet.';
    el.appendChild(span);
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = formatter ? formatter(item) : String(item);
    el.appendChild(li);
  }
}

function updateQueueHeatmap(el, heatmapData) {
  if (!el) return;
  el.innerHTML = '';
  const diagram = buildQueueHeatmapDiagram(heatmapData);
  if (diagram) {
    el.appendChild(diagram.svg);
  } else {
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = 'Queue telemetry not yet available.';
    el.appendChild(span);
  }
}

function extractRelevantState(state) {
  if (!state) {
    return { insights: null, diagrams: null, crawlType: '' };
  }
  return {
    insights: state.insights || null,
    diagrams: state.diagrams || null,
    crawlType: state.crawlType || ''
  };
}

export function createInsightsControl({ store, elements }) {
  const {
    panel,
    hint,
    coverage,
    coverageDetail,
    hubs,
    hubsDetail,
    problems,
    problemsDetail,
    goals,
    goalsDetail,
    queueMix,
    queueMixDetail,
    highlightsList,
    heatmapContainer
  } = elements;

  let unsubscribe = null;

  const control = createControl({
    id: 'insights-panel',
    initialData: extractRelevantState(store.getState()),
    initialView: {}
  });

  const applyView = (insights, diagrams, crawlType) => {
    const hasInsights = !!insights;
    const hasData = Boolean(insights && insights.updatedAt);
    const panelVisible = crawlType === 'intelligent' || hasData;

    if (panel) {
      panel.style.display = panelVisible ? '' : 'none';
      panel.dataset.hasData = hasData ? '1' : '0';
    }
    if (hint) {
      hint.textContent = insights?.hint || 'Insights appear once planner telemetry streams in.';
    }

    if (coverage) {
      const pct = insights?.coverage;
      coverage.textContent = typeof pct === 'number' ? `${pct.toFixed(1)}%` : '—';
    }
    setText(coverageDetail, insights?.coverageDetail || '');

    if (hubs) {
      const val = insights?.seededHubs;
      hubs.textContent = val != null ? formatNumber(val) : '—';
    }
    setText(hubsDetail, insights?.seededDetail || '');

    if (problems) {
      problems.textContent = insights?.problemsTotal != null ? formatNumber(insights.problemsTotal) : '0';
    }
    setText(problemsDetail, insights?.problemsDetail || '');

    if (goals) {
      goals.textContent = insights?.goals ?? '—';
    }
    setText(goalsDetail, insights?.goalsDetail || '');

    if (queueMix) {
      queueMix.textContent = insights?.queueMix ?? '—';
    }
    setText(queueMixDetail, insights?.queueMixDetail || '');

    if (highlightsList) {
      const highlights = Array.isArray(insights?.highlights) ? insights.highlights.slice(0, 6) : [];
      renderList(highlightsList, highlights);
    }

    updateQueueHeatmap(heatmapContainer, diagrams?.queueHeatmapData || null);

    if (panel) {
      panel.dataset.mode = crawlType || '';
    }
  };

  createDerivedBinding({
    source: control.dataModel,
    inputs: ['insights', 'diagrams', 'crawlType'],
    derive({ values }) {
      return {
        insights: values.insights || null,
        diagrams: values.diagrams || null,
        crawlType: values.crawlType || ''
      };
    },
    apply(result) {
      applyView(result.insights, result.diagrams, result.crawlType);
    }
  });

  control.on('activate', ({ control: ctrl }) => {
    const initial = extractRelevantState(store.getState());
    ctrl.dataModel.replace(initial, { force: true });
    unsubscribe = store.subscribe(({ state }) => {
      ctrl.dataModel.replace(extractRelevantState(state));
    });
  });

  control.on('update', ({ control: ctrl, context }) => {
    const state = context && context.state ? context.state : null;
    if (state) {
      ctrl.dataModel.replace(extractRelevantState(state));
    }
  });

  control.on('deactivate', () => {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  });

  return control;
}
