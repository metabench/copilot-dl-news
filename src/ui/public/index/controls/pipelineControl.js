import { createControl } from './baseControl.js';
import { createPipelineView } from '../pipelineView.js';
import { buildPipelineDiagram } from '../svg/pipelineStatus.js';

export function createPipelineControl({ store, dom, formatters }) {
  const view = createPipelineView(dom, formatters);
  const { diagramContainer } = dom;
  let unsubscribe = null;

  function renderDiagram(pipeline) {
    if (!diagramContainer) return;
    diagramContainer.innerHTML = '';
    const svg = buildPipelineDiagram(pipeline);
    if (svg) {
      diagramContainer.appendChild(svg);
    }
  }

  function applyPipelineState(pipeline) {
    if (!pipeline || typeof pipeline !== 'object') return;
    view.resetPipelineState();
    view.updatePipeline(pipeline);
    renderDiagram(pipeline);
  }

  const control = createControl({
    id: 'pipeline-control',
    initialData: { pipeline: store.getState().pipeline || {} }
  });

  control.dataModel.onChange('pipeline', ({ value }) => {
    applyPipelineState(value);
  });

  const initial = control.dataModel.get('pipeline');
  if (initial) {
    applyPipelineState(initial);
  }

  control.on('activate', ({ control: ctrl }) => {
    applyPipelineState(ctrl.dataModel.get('pipeline'));
    unsubscribe = store.subscribe(({ state }) => {
      if (state.pipeline) {
        ctrl.dataModel.set('pipeline', state.pipeline);
      }
    });
  });

  control.on('update', ({ control: ctrl, context }) => {
    const state = context && context.state ? context.state : null;
    if (state && state.pipeline) {
      ctrl.dataModel.set('pipeline', state.pipeline);
    }
  });

  control.on('deactivate', () => {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  });

  return Object.assign(control, {
    resetPipelineState: view.resetPipelineState,
    getAnalysisState: view.getAnalysisState,
    persistAnalysisHistory: view.persistAnalysisHistory,
    renderAnalysisHistory: view.renderAnalysisHistory,
    buildAnalysisHighlights: view.buildAnalysisHighlights,
    renderAnalysisHighlights: view.renderAnalysisHighlights,
    updatePipeline: view.updatePipeline
  });
}
