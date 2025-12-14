"use strict";

/**
 * Data Explorer CSS Builder
 * 
 * Generates themed CSS using CSS custom properties. All colors, typography,
 * spacing, and other design tokens are defined as CSS variables in :root
 * and consumed throughout these styles.
 * 
 * Theme variables are injected separately by themeService.themeConfigToCss()
 * 
 * @module dataExplorerCss
 */

/**
 * Build the complete CSS for the data explorer UI
 * All color values use CSS variables for theming support
 * @returns {string} CSS stylesheet content
 */
function buildDataExplorerCss() {
  return `
/* ========================================
   Base & Reset
   ======================================== */
*, *::before, *::after {
  box-sizing: border-box;
}

html {
  font-family: var(--theme-font-body);
  font-size: var(--theme-font-size-base, 16px);
  line-height: var(--theme-line-height-normal, 1.5);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  padding: 0;
  background: var(--theme-bg-gradient, var(--theme-bg));
  color: var(--theme-text);
  min-height: 100vh;
}

/* ========================================
   Typography
   ======================================== */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--theme-font-display);
  font-weight: var(--theme-font-weight-bold, 700);
  line-height: var(--theme-line-height-tight, 1.2);
  letter-spacing: var(--theme-letter-spacing-tight, -0.02em);
  color: var(--theme-text);
  margin: 0;
}

p {
  margin: 0;
}

a {
  color: var(--theme-accent);
  text-decoration: none;
  transition: color var(--theme-transition-fast, 0.15s ease);
}

a:hover {
  color: var(--theme-accent-hover);
  text-decoration: underline;
}

code, pre, .mono {
  font-family: var(--theme-font-mono);
}

/* ========================================
   Page Shell (Main Container)
   ======================================== */
.page-shell {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: var(--theme-space-md) var(--theme-space-md) var(--theme-space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.page-shell.page-shell--offset {
  padding-top: var(--theme-space-lg);
}

@media (min-width: 1200px) {
  .page-shell {
    max-width: 1480px;
    padding: var(--theme-space-xl) var(--theme-space-xl) var(--theme-space-2xl);
    gap: var(--theme-space-lg);
  }
}

@media (min-width: 1600px) {
  .page-shell {
    max-width: 1760px;
    padding-left: var(--theme-space-2xl);
    padding-right: var(--theme-space-2xl);
  }
}

@media (max-width: 1100px) {
  .page-shell {
    padding: var(--theme-space-md) var(--theme-space-sm) var(--theme-space-lg);
    gap: var(--theme-space-md);
  }
}

/* ========================================
   Page Header
   ======================================== */
.page-shell__header {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  margin-bottom: var(--theme-space-xs);
}

.page-shell__hero {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

@media (min-width: 768px) {
  .page-shell__hero {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--theme-space-lg);
  }
}

.page-shell__heading {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
  max-width: 960px;
  flex: 1;
}

.page-shell__header h1 {
  font-size: clamp(1.9rem, 3vw, 2.75rem);
  letter-spacing: var(--theme-letter-spacing-tight);
  color: var(--theme-text);
  line-height: 1.1;
  font-family: var(--theme-font-display);
}

.page-shell__subtitle {
  color: var(--theme-text-secondary);
  font-size: var(--theme-font-size-md);
  line-height: var(--theme-line-height-relaxed);
  text-wrap: balance;
  font-feature-settings: "tnum" 1;
  overflow-wrap: anywhere;
  max-width: 80ch;
}

@media (min-width: 1400px) {
  .page-shell__subtitle {
    font-size: var(--theme-font-size-lg);
  }
}

.page-shell__actions {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  flex-shrink: 0;
}

/* ========================================
   Primary Navigation
   ======================================== */
.primary-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 var(--theme-space-sm);
  padding: 0;
}

@media (min-width: 1400px) {
  .primary-nav {
    gap: 12px 16px;
  }
}

.primary-nav__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.45rem 1rem;
  border-radius: var(--theme-radius-full);
  border: 1px solid transparent;
  font-size: var(--theme-font-size-sm);
  font-weight: var(--theme-font-weight-semibold);
  color: var(--theme-surface-text-secondary, var(--theme-text-secondary));
  background: var(--theme-surface);
  text-decoration: none;
  transition: all var(--theme-transition-fast);
}

.primary-nav__link:hover {
  background: var(--theme-surface-hover);
  color: var(--theme-surface-text, var(--theme-text));
  text-decoration: none;
}

.primary-nav__link--active {
  background: var(--theme-accent);
  color: var(--theme-bg);
  border-color: var(--theme-accent-dark);
}

.primary-nav__link[aria-disabled="true"] {
  opacity: 0.5;
  cursor: default;
}

/* ========================================
   Breadcrumbs
   ======================================== */
.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: var(--theme-space-xs) 0 var(--theme-space-sm);
  font-size: var(--theme-font-size-sm);
  color: var(--theme-text-muted);
}

.breadcrumbs__link {
  color: var(--theme-accent);
  text-decoration: none;
  font-weight: var(--theme-font-weight-semibold);
}

.breadcrumbs__link:hover {
  text-decoration: underline;
}

.breadcrumbs__sep {
  color: var(--theme-text-subtle);
}

.breadcrumbs__current {
  font-weight: var(--theme-font-weight-semibold);
  color: var(--theme-text);
}

/* ========================================
   Home Grid (Card Layout)
   ======================================== */
.home-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--theme-space-md);
  margin: var(--theme-space-sm) 0;
}

@media (min-width: 1500px) {
  .home-grid {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }
}

/* ========================================
   Dashboard Grid
   ======================================== */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--theme-space-md);
  margin: var(--theme-space-xs) 0 var(--theme-space-lg);
}

@media (max-width: 1100px) {
  .dashboard-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* ========================================
   Dashboard Panel (Premium Card Style)
   ======================================== */
.dashboard-panel {
  background: var(--theme-surface);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  padding: var(--theme-space-md) var(--theme-space-lg);
  box-shadow: var(--theme-shadow-md);
  color: var(--theme-surface-text, var(--theme-text));
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  min-height: 220px;
  transition: all var(--theme-transition-normal);
}

.dashboard-panel:hover {
  box-shadow: var(--theme-shadow-lg);
  border-color: var(--theme-border-light);
}

.dashboard-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-space-sm);
}

.dashboard-panel__head h2 {
  font-size: var(--theme-font-size-lg);
  color: var(--theme-surface-text, var(--theme-text));
  font-family: var(--theme-font-display);
}

.dashboard-panel__meta {
  font-size: var(--theme-font-size-sm);
  color: var(--theme-surface-text-muted, var(--theme-text-muted));
}

.dashboard-panel__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
}

.dashboard-panel__footer {
  margin-top: auto;
  font-size: var(--theme-font-size-sm);
  color: var(--theme-surface-text-muted, var(--theme-text-muted));
  border-top: 1px solid var(--theme-border);
  padding-top: var(--theme-space-sm);
}

/* ========================================
   Status Badges & Pills
   ======================================== */
.status-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-sm);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0.35rem 0.75rem;
  border-radius: var(--theme-radius-full);
  font-size: var(--theme-font-size-sm);
  font-weight: var(--theme-font-weight-semibold);
  background: var(--theme-surface-elevated);
  color: var(--theme-surface-text-secondary, var(--theme-text-secondary));
}

.status-pill--paused {
  background: var(--theme-error-bg);
  color: var(--theme-error);
}

.status-pill--meta {
  background: var(--theme-success-bg);
  color: var(--theme-success);
}

/* ========================================
   Startup Status
   ======================================== */
.startup-status {
  border-top: 1px solid var(--theme-border);
  padding-top: var(--theme-space-sm);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.startup-status__text {
  margin: 0;
  font-size: var(--theme-font-size-sm);
  color: var(--theme-surface-text, var(--theme-text));
}

.startup-progress {
  width: 100%;
  height: 8px;
  border-radius: var(--theme-radius-full);
  background: var(--theme-surface);
  overflow: hidden;
}

/* ========================================
   Shared Controls (Search + Metric Cards)
   ======================================== */
.search-form {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0;
  margin: 0;
}

.search-form__home-link {
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 0.85rem;
  border-radius: var(--theme-radius-full);
  background: var(--theme-surface);
  border: 1px solid var(--theme-border);
  color: var(--theme-surface-text, var(--theme-text));
  font-weight: var(--theme-font-weight-semibold);
  text-decoration: none;
}

.search-form__home-link:hover {
  background: var(--theme-surface-hover);
  text-decoration: none;
}

.search-form__input,
.search-form__select {
  height: 40px;
  padding: 0.5rem 0.75rem;
  border-radius: var(--theme-radius-md);
  border: 1px solid var(--theme-border);
  background: var(--theme-surface);
  color: var(--theme-surface-text, var(--theme-text));
  font-size: var(--theme-font-size-sm);
  min-width: 220px;
}

.search-form__select {
  min-width: 160px;
}

.search-form__input::placeholder {
  color: var(--theme-surface-text-muted, var(--theme-text-muted));
}

.search-form__input:focus,
.search-form__select:focus {
  outline: none;
  box-shadow: var(--theme-shadow-glow);
  border-color: var(--theme-accent);
}

.search-form__button {
  height: 40px;
  padding: 0 14px;
  border-radius: var(--theme-radius-md);
  border: 1px solid var(--theme-accent-dark);
  background: var(--theme-accent);
  color: var(--theme-bg);
  font-size: 1rem;
  font-weight: var(--theme-font-weight-semibold);
  cursor: pointer;
  transition: all var(--theme-transition-fast);
}

.search-form__button:hover {
  background: var(--theme-accent-hover);
  box-shadow: var(--theme-shadow-glow);
}

.metric-card,
.data-explorer__card {
  background: var(--theme-surface);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  padding: var(--theme-space-md);
  box-shadow: var(--theme-shadow-sm);
  color: var(--theme-surface-text, var(--theme-text));
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metric-card__title {
  margin: 0;
  font-size: var(--theme-font-size-sm);
  letter-spacing: 0.01em;
  color: var(--theme-surface-text-secondary, var(--theme-text-secondary));
  font-family: var(--theme-font-body);
  font-weight: var(--theme-font-weight-semibold);
}

.metric-card__link {
  color: inherit;
  text-decoration: none;
}

.metric-card__link:hover {
  text-decoration: underline;
}

.metric-card__value {
  font-size: var(--theme-font-size-2xl);
  font-weight: var(--theme-font-weight-bold);
  font-feature-settings: "tnum" 1;
  color: var(--theme-surface-text, var(--theme-text));
}

.metric-card__subtitle {
  font-size: var(--theme-font-size-sm);
  color: var(--theme-surface-text-muted, var(--theme-text-muted));
}

.startup-progress__fill {
  width: 0;
  height: 100%;
  background: linear-gradient(90deg, var(--theme-accent), var(--theme-accent-light));
  transition: width var(--theme-transition-normal);
}

.startup-stage-list {
  margin: 0;
  padding-left: 18px;
  color: var(--theme-text-muted);
  font-size: var(--theme-font-size-sm);
}

/* ========================================
   Jobs Panel & Cards
   ======================================== */
.jobs-panel .dashboard-panel__head {
  align-items: flex-start;
}

.jobs-panel .dashboard-panel__meta {
  text-align: right;
}

.jobs-list {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
}

.jobs-empty-state {
  border: 1px dashed var(--theme-border);
  border-radius: var(--theme-radius-md);
  padding: var(--theme-space-md);
  text-align: center;
  color: var(--theme-text-muted);
  background: var(--theme-bg-alt);
}

.jobs-empty-state__icon {
  font-size: 1.75rem;
  display: block;
  margin-bottom: 6px;
}

.jobs-empty-state__text {
  margin: 0;
  font-size: var(--theme-font-size-sm);
}

.job-card {
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  padding: var(--theme-space-md);
  background: var(--theme-surface);
  box-shadow: var(--theme-shadow-sm);
  transition: all var(--theme-transition-fast);
}

.job-card:hover {
  border-color: var(--theme-border-light);
  box-shadow: var(--theme-shadow-md);
}

.job-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--theme-space-sm);
}

.job-card-status {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: var(--theme-font-size-sm);
  color: var(--theme-text-muted);
}

.job-card-stage {
  padding: 0.15rem 0.55rem;
  border-radius: var(--theme-radius-full);
  background: var(--theme-info-bg);
  color: var(--theme-info);
  font-weight: var(--theme-font-weight-semibold);
}

.job-card-paused-indicator {
  padding: 0.15rem 0.65rem;
  border-radius: var(--theme-radius-full);
  background: var(--theme-error-bg);
  color: var(--theme-error);
  font-weight: var(--theme-font-weight-semibold);
}

.job-card-pid {
  font-size: var(--theme-font-size-xs);
  color: var(--theme-text-subtle);
  font-family: var(--theme-font-mono);
}

.job-card-url {
  margin: 10px 0;
  font-size: var(--theme-font-size-md);
  word-break: break-all;
}

.job-card-link {
  color: var(--theme-accent);
  text-decoration: none;
  font-weight: var(--theme-font-weight-semibold);
}

.job-card-link:hover {
  text-decoration: underline;
}

.job-card-status-text {
  font-size: var(--theme-font-size-sm);
  color: var(--theme-text);
  margin-top: 4px;
}

.job-card-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-sm);
  margin-top: 10px;
}

.job-card-metric {
  display: flex;
  flex-direction: column;
  font-size: var(--theme-font-size-xs);
  color: var(--theme-text-muted);
}

.job-card-metric-value {
  font-size: var(--theme-font-size-md);
  font-weight: var(--theme-font-weight-semibold);
  color: var(--theme-text);
  font-family: var(--theme-font-mono);
}

/* ========================================
   Home Cards (Premium Feature Cards)
   ======================================== */
.home-card {
  background: var(--theme-surface);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  padding: var(--theme-space-md);
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
  box-shadow: var(--theme-shadow-md);
  transition: all var(--theme-transition-normal);
}

.home-card:hover {
  border-color: var(--theme-accent);
  box-shadow: var(--theme-shadow-glow);
  transform: translateY(-2px);
}

.home-card__headline {
  display: flex;
  align-items: center;
  gap: 10px;
}

.home-card__title {
  margin: 0;
  font-size: var(--theme-font-size-lg);
  color: var(--theme-text);
  font-family: var(--theme-font-display);
}

.home-card__badge {
  margin-left: auto;
  font-size: var(--theme-font-size-xs);
  letter-spacing: var(--theme-letter-spacing-wide);
  text-transform: uppercase;
}

.home-card__description {
  margin: 0;
  color: var(--theme-text-secondary);
  line-height: var(--theme-line-height-normal);
}

.home-card__stat {
  display: flex;
  flex-direction: column;
  font-size: var(--theme-font-size-xs);
  text-transform: uppercase;
  color: var(--theme-text-muted);
  letter-spacing: var(--theme-letter-spacing-wide);
}

.home-card__stat-value {
  font-size: var(--theme-font-size-xl);
  font-weight: var(--theme-font-weight-bold);
  color: var(--theme-accent);
  letter-spacing: normal;
  font-family: var(--theme-font-mono);
}

.home-card__action {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.45rem 1rem;
  border-radius: var(--theme-radius-full);
  border: 1px solid var(--theme-accent);
  background: var(--theme-accent);
  color: var(--theme-bg);
  font-weight: var(--theme-font-weight-semibold);
  text-decoration: none;
  font-size: var(--theme-font-size-sm);
  transition: all var(--theme-transition-fast);
}

.home-card__action:hover {
  background: var(--theme-accent-hover);
  border-color: var(--theme-accent-hover);
  text-decoration: none;
}

.home-card__stat-link {
  color: inherit;
  text-decoration: none;
}

.home-card__stat-link:hover {
  text-decoration: underline;
}

.home-card__hints {
  margin: var(--theme-space-xs) 0 0;
  padding-left: 18px;
  font-size: var(--theme-font-size-xs);
  color: var(--theme-text-muted);
}

.home-card__hint {
  margin: 2px 0;
}

.home-card__hint-link {
  color: var(--theme-accent);
  text-decoration: none;
  font-weight: var(--theme-font-weight-semibold);
}

.home-card__hint-link:hover {
  text-decoration: underline;
}

/* ========================================
   Filter Toggle
   ======================================== */
.filter-toggle {
  margin-top: 0;
  display: inline-flex;
  align-items: center;
}

.filter-toggle__label {
  display: inline-flex;
  align-items: center;
  gap: var(--theme-space-sm);
  font-size: var(--theme-font-size-sm);
  font-weight: var(--theme-font-weight-semibold);
  color: var(--theme-text);
}

.filter-toggle__switch {
  position: relative;
  width: 44px;
  height: 22px;
}

.filter-toggle__checkbox {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.filter-toggle__slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--theme-surface);
  border-radius: 22px;
  transition: background var(--theme-transition-fast);
  border: 1px solid var(--theme-border);
}

.filter-toggle__slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 1px;
  background-color: var(--theme-surface-text-secondary, var(--theme-text-secondary));
  border-radius: 50%;
  transition: transform var(--theme-transition-fast);
  box-shadow: var(--theme-shadow-sm);
}

.filter-toggle__checkbox:checked + .filter-toggle__slider {
  background-color: var(--theme-success);
  border-color: var(--theme-success);
}

.filter-toggle__checkbox:checked + .filter-toggle__slider::before {
  transform: translateX(22px);
  background-color: var(--theme-bg);
}

.filter-toggle.is-loading .filter-toggle__slider::before {
  animation: filter-toggle-pulse 1s infinite ease-in-out;
}

@keyframes filter-toggle-pulse {
  0% { opacity: 1; }
  50% { opacity: 0.4; }
  100% { opacity: 1; }
}

/* ========================================
   Panel (Main Content Container)
   ======================================== */
.panel {
  background: var(--theme-surface);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  padding: var(--theme-space-lg);
  box-shadow: var(--theme-shadow-lg);
  color: var(--theme-surface-text, var(--theme-text));
}

@media (min-width: 1500px) {
  .panel {
    padding: var(--theme-space-xl);
  }
}

@media (max-width: 1100px) {
  .panel {
    padding: var(--theme-space-md);
  }
}

.panel__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--theme-space-md);
  margin-bottom: var(--theme-space-lg);
}

@media (min-width: 1600px) {
  .panel__meta {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }
}

.panel__filters {
  margin-bottom: var(--theme-space-md);
  padding: var(--theme-space-md);
  background: var(--theme-surface-elevated, var(--theme-bg-alt));
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-surface-text, var(--theme-text));
}

/* ========================================
   Filter Controls
   ======================================== */
.filter-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--theme-space-md);
}

.filter-controls__group {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
}

.filter-controls__label {
  font-size: var(--theme-font-size-sm);
  color: var(--theme-surface-text-muted, var(--theme-text-muted));
}

.filter-controls__select {
  padding: 6px 12px;
  font-size: var(--theme-font-size-sm);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  background: var(--theme-surface);
  color: var(--theme-surface-text, var(--theme-text));
  cursor: pointer;
  font-family: var(--theme-font-body);
}

.filter-controls__select:hover {
  border-color: var(--theme-border-light);
}

.filter-controls__select:focus {
  outline: none;
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 3px rgba(201, 162, 39, 0.2);
}

.filter-controls__checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  cursor: pointer;
  font-size: var(--theme-font-size-sm);
  color: var(--theme-surface-text-muted, var(--theme-text-muted));
}

.filter-controls__checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--theme-accent);
}

.filter-controls__checkbox-text {
  user-select: none;
}

.filter-controls__submit {
  padding: 6px 16px;
  font-size: var(--theme-font-size-sm);
  font-weight: var(--theme-font-weight-medium);
  color: var(--theme-bg);
  background: var(--theme-accent);
  border: none;
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  transition: background var(--theme-transition-fast);
  font-family: var(--theme-font-body);
}

.filter-controls__submit:hover {
  background: var(--theme-accent-hover);
}

.filter-controls__submit:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(201, 162, 39, 0.3);
}

/* ========================================
   Meta Cards (Stats Display)
   ======================================== */
.meta-card {
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  padding: var(--theme-space-sm) var(--theme-space-md);
  background: linear-gradient(180deg, var(--theme-surface) 0%, var(--theme-surface-elevated) 100%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 100px;
  box-shadow: var(--theme-shadow-sm);
  transition: all var(--theme-transition-fast);
}

.meta-card:hover {
  border-color: var(--theme-accent);
  box-shadow: var(--theme-shadow-glow);
}

.meta-card--emoji {
  align-items: center;
  justify-content: center;
  text-align: center;
  background: linear-gradient(135deg, var(--theme-surface-elevated) 0%, var(--theme-surface) 100%);
  border-color: var(--theme-accent);
}

.meta-card__label {
  margin: 0;
  font-size: var(--theme-font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--theme-letter-spacing-wide);
  color: var(--theme-text-muted);
  font-weight: var(--theme-font-weight-medium);
}

.meta-card__value {
  margin: 0;
  font-size: var(--theme-font-size-lg);
  font-weight: var(--theme-font-weight-semibold);
  color: var(--theme-text);
  font-feature-settings: "tnum" 1;
  word-break: break-word;
  font-family: var(--theme-font-mono);
}

.meta-card__value--emoji {
  font-size: 3rem;
  line-height: 1.1;
  font-family: inherit;
}

.meta-card__subtitle {
  margin: 0;
  font-size: var(--theme-font-size-sm);
  font-weight: var(--theme-font-weight-semibold);
  color: var(--theme-accent);
}

/* ========================================
   Sparkline
   ======================================== */
.sparkline {
  width: 160px;
  height: 32px;
  display: block;
}

.sparkline polyline {
  stroke: var(--theme-accent);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  fill: none;
}

/* ========================================
   Data Table (Premium Table Design)
   ======================================== */
.ui-table {
  width: 100%;
  border-collapse: collapse;
  border-radius: var(--theme-radius-md);
  overflow: hidden;
  font-size: var(--theme-font-size-md);
}

.table-wrapper {
  width: 100%;
  overflow-x: auto;
  border-radius: var(--theme-radius-md);
}

.table-wrapper::-webkit-scrollbar {
  height: 10px;
}

.table-wrapper::-webkit-scrollbar-track {
  background: var(--theme-bg-alt);
  border-radius: var(--theme-radius-full);
}

.table-wrapper::-webkit-scrollbar-thumb {
  background: var(--theme-border);
  border-radius: var(--theme-radius-full);
}

.table-wrapper::-webkit-scrollbar-thumb:hover {
  background: var(--theme-border-light);
}

.table-wrapper table {
  min-width: 960px;
}

.ui-table thead th {
  text-transform: uppercase;
  letter-spacing: var(--theme-letter-spacing-wide);
  font-size: var(--theme-font-size-xs);
  text-align: left;
  padding: 0.75rem;
  background: var(--theme-bg-alt);
  border-bottom: 2px solid var(--theme-accent);
  color: var(--theme-text-muted);
  font-weight: var(--theme-font-weight-semibold);
  position: sticky;
  top: 0;
}

.ui-table tbody td {
  padding: 0.75rem;
  border-bottom: 1px solid var(--theme-border);
  color: var(--theme-text);
  vertical-align: top;
}

.ui-table tbody tr {
  transition: background var(--theme-transition-fast);
}

.ui-table tbody tr:nth-child(even) {
  background: var(--theme-bg-alt);
}

.ui-table tbody tr:hover {
  background: var(--theme-surface-hover);
}

.ui-table tbody tr:last-child td {
  border-bottom: none;
}

/* Timestamp cells (Created, Last Seen, Last Fetch) */
.is-timestamp {
  font-family: var(--theme-font-mono);
  font-size: var(--theme-font-size-xs);
  font-feature-settings: "tnum" 1;
  white-space: nowrap;
  min-width: 5.5rem;
}

.is-timestamp .timestamp-date,
.is-timestamp .timestamp-time {
  display: block;
}

.is-timestamp .timestamp-date {
  color: var(--theme-text);
  font-weight: var(--theme-font-weight-medium);
}

.is-timestamp .timestamp-time {
  color: var(--theme-text-muted);
  font-size: 0.7rem;
}

@media (max-width: 1100px) {
  .ui-table thead th,
  .ui-table tbody td {
    padding: 0.6rem;
    font-size: var(--theme-font-size-sm);
  }
  .table-wrapper table {
    min-width: 760px;
  }
  .is-timestamp {
    font-size: 0.7rem;
    min-width: 4.5rem;
  }
  .is-timestamp .timestamp-time {
    font-size: 0.65rem;
  }
}

/* ========================================
   Pagination
   ======================================== */
.pager {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
  margin: var(--theme-space-md) 0;
}

@media (min-width: 768px) {
  .pager {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.pager__info {
  margin: 0;
  font-size: var(--theme-font-size-sm);
  color: var(--theme-text-muted);
  font-feature-settings: "tnum" 1;
  font-family: var(--theme-font-mono);
}

.pager__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-sm);
}

.pager-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.85rem;
  border-radius: var(--theme-radius-full);
  border: 1px solid var(--theme-border);
  font-size: var(--theme-font-size-sm);
  font-weight: var(--theme-font-weight-semibold);
  background: var(--theme-surface);
  color: var(--theme-text-secondary);
  text-decoration: none;
  transition: all var(--theme-transition-fast);
}

.pager-button:hover {
  background: var(--theme-surface-hover);
  border-color: var(--theme-accent);
  color: var(--theme-text);
  text-decoration: none;
}

.pager-button--kind-first,
.pager-button--kind-last {
  background: var(--theme-surface-elevated);
  border-color: var(--theme-border-light);
  color: var(--theme-text);
}

.pager-button--kind-prev,
.pager-button--kind-next {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
  color: var(--theme-bg);
}

.pager-button--kind-prev:hover,
.pager-button--kind-next:hover {
  background: var(--theme-accent-hover);
  border-color: var(--theme-accent-hover);
}

.pager-button--disabled,
.pager-button[aria-disabled="true"] {
  color: var(--theme-text-subtle);
  background: var(--theme-bg-alt);
  border-color: var(--theme-border);
  cursor: not-allowed;
  opacity: 0.6;
}

/* ========================================
   Badges
   ======================================== */
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  padding: 0.15rem 0.5rem;
  border-radius: var(--theme-radius-md);
  font-size: var(--theme-font-size-xs);
  font-weight: var(--theme-font-weight-semibold);
}

.badge--muted {
  background: var(--theme-surface);
  color: var(--theme-text-muted);
}

.badge--info {
  background: var(--theme-info-bg);
  color: var(--theme-info);
}

.badge--success {
  background: var(--theme-success-bg);
  color: var(--theme-success);
}

.badge--accent {
  background: rgba(201, 162, 39, 0.15);
  color: var(--theme-accent);
}

.badge--warn {
  background: var(--theme-warning-bg);
  color: var(--theme-warning);
}

.badge--danger {
  background: var(--theme-error-bg);
  color: var(--theme-error);
}

/* ========================================
   Links
   ======================================== */
.table-link {
  color: var(--theme-accent);
  text-decoration: none;
  font-weight: var(--theme-font-weight-medium);
}

.table-link:hover {
  text-decoration: underline;
  color: var(--theme-accent-hover);
}

/* ========================================
   Utility Classes
   ======================================== */
.text-muted {
  color: var(--theme-text-muted);
}

.text-accent {
  color: var(--theme-accent);
}

.font-mono {
  font-family: var(--theme-font-mono);
}

.font-display {
  font-family: var(--theme-font-display);
}

/* ========================================
   Animations
   ======================================== */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn var(--theme-transition-normal) ease-out;
}

.animate-slideUp {
  animation: slideUp var(--theme-transition-normal) ease-out;
}
`;
}

module.exports = {
  buildDataExplorerCss
};
