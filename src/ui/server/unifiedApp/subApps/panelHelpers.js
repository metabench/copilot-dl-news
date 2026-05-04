'use strict';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAttrs(attrs = {}) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => ` ${escapeHtml(key)}="${escapeHtml(value)}"`)
    .join('');
}

function renderPanelHero({ title, description }) {
  return `
    <div class="panel-hero">
      <h2 class="panel-hero__title">${escapeHtml(title)}</h2>
      ${description ? `<p class="panel-hero__description">${escapeHtml(description)}</p>` : ''}
    </div>
  `;
}

function renderStatCard({ value, label, valueAttrs = {}, cardAttrs = {} }) {
  return `
    <div class="panel-stat-card"${renderAttrs(cardAttrs)}>
      <div class="panel-stat-card__value"${renderAttrs(valueAttrs)}>${escapeHtml(value)}</div>
      <div class="panel-stat-card__label">${escapeHtml(label)}</div>
    </div>
  `;
}

function renderStatsRow(items = []) {
  return `<div class="panel-stats-row">${items.map(renderStatCard).join('')}</div>`;
}

module.exports = {
  escapeHtml,
  renderPanelHero,
  renderStatCard,
  renderStatsRow,
};