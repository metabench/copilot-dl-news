const STAGES = [
  { key: 'analysis', label: 'Analysis' },
  { key: 'planner', label: 'Planner' },
  { key: 'execution', label: 'Execution' }
];

const STATUS_COLORS = {
  idle: '#9ca3af',
  running: '#2563eb',
  ready: '#22a07b',
  applied: '#22a07b',
  pending: '#f59e0b',
  blocked: '#ef4444',
  failed: '#ef4444',
  error: '#ef4444'
};

function createText(svg, text, x, y) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  el.textContent = text;
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('text-anchor', 'middle');
  el.setAttribute('dominant-baseline', 'middle');
  el.setAttribute('class', 'pipeline-svg__label');
  svg.appendChild(el);
  return el;
}

function createCircle(svg, { cx, cy, r, fill, stroke, title }) {
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', String(cx));
  circle.setAttribute('cy', String(cy));
  circle.setAttribute('r', String(r));
  circle.setAttribute('fill', fill);
  circle.setAttribute('stroke', stroke);
  circle.setAttribute('stroke-width', '2');
  if (title) {
    const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titleEl.textContent = title;
    circle.appendChild(titleEl);
  }
  svg.appendChild(circle);
  return circle;
}

function createConnector(svg, x1, y1, x2, y2) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(y1));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(y2));
  line.setAttribute('stroke', '#d1d5db');
  line.setAttribute('stroke-width', '2');
  svg.appendChild(line);
  return line;
}

export function buildPipelineDiagram(pipelineState) {
  if (!pipelineState || typeof pipelineState !== 'object') {
    return null;
  }
  const width = 320;
  const height = 80;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.classList.add('pipeline-svg');

  const radius = 20;
  const gap = (width - radius * 2 * STAGES.length) / (STAGES.length + 1);
  const cy = height / 2;

  const positions = STAGES.map((stage, index) => {
    const cx = gap + radius + index * (radius * 2 + gap);
    return { ...stage, cx };
  });

  for (let i = 0; i < positions.length - 1; i += 1) {
    createConnector(svg, positions[i].cx + radius, cy, positions[i + 1].cx - radius, cy);
  }

  for (const stage of positions) {
    const state = pipelineState[stage.key] || {};
    const status = state.status || 'idle';
    const fill = STATUS_COLORS[status] || STATUS_COLORS.idle;
    createCircle(svg, {
      cx: stage.cx,
      cy,
      r: radius,
      fill,
      stroke: '#1f2937',
      title: `${stage.label}: ${state.statusLabel || status}`
    });
    createText(svg, stage.label, stage.cx, cy);
  }

  return svg;
}
