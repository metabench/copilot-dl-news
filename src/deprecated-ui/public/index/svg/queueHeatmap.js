const TYPE_ORDER = ['article', 'hub', 'other'];

function sumRow(counts) {
  return TYPE_ORDER.reduce((sum, type) => sum + (Number(counts?.[type]) || 0), 0);
}

function createRect(svg, { x, y, width, height, fill, title }) {
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', String(x));
  rect.setAttribute('y', String(y));
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', String(height));
  rect.setAttribute('fill', fill);
  if (title) {
    const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titleEl.textContent = title;
    rect.appendChild(titleEl);
  }
  svg.appendChild(rect);
  return rect;
}

function palette(type) {
  switch (type) {
    case 'article': return '#2563eb';
    case 'hub': return '#22a07b';
    default: return '#6b7280';
  }
}

export function buildQueueHeatmapDiagram(heatmap) {
  if (!heatmap || typeof heatmap !== 'object' || !heatmap.cells) {
    return null;
  }
  const rowEntries = Object.entries(heatmap.cells)
    .map(([origin, counts]) => ({ origin, total: sumRow(counts), counts }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  if (rowEntries.length === 0) {
    return null;
  }

  const width = 260;
  const rowHeight = 18;
  const padding = 4;
  const height = rowEntries.length * (rowHeight + padding) + padding;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.classList.add('heatmap-svg');

  let y = padding;
  for (const row of rowEntries) {
    let x = padding;
    for (const type of TYPE_ORDER) {
      const value = Number(row.counts?.[type]) || 0;
      if (!value) continue;
      const w = Math.max(6, (value / row.total) * (width - padding * 2));
      createRect(svg, {
        x,
        y,
        width: w,
        height: rowHeight,
        fill: palette(type),
        title: `${row.origin} · ${type} ${value}`
      });
      x += w;
    }
    y += rowHeight + padding;
  }

  return {
    svg,
    summary: `${rowEntries[0].origin}: ${rowEntries[0].total}`
  };
}
