'use strict';

/**
 * Combined styles for dashboard controls with anti-jitter patterns
 * 
 * @module src/ui/controls/dashboard/styles
 */

const { createProgressBar } = require('./ProgressBar');
const { createStatusBadge } = require('./StatusBadge');
const { createStatsGrid } = require('./StatsGrid');
const { createProgressCard } = require('./ProgressCard');

// Create temporary classes just to extract CSS
// This is a workaround since CSS is attached to class constructors
const mockJsgui = {
  Control: class {},
  String_Control: class {}
};

// We can't actually call the factories without real jsgui,
// so we'll store the CSS strings directly here

const BASE_CSS = `
/* ============================================
   Dashboard Controls - Anti-Jitter CSS System
   ============================================ */

:root {
  /* Progress Bar */
  --dprogress-track-bg: #2a2a4a;
  --dprogress-fill-bg: linear-gradient(90deg, #00d4ff, #00ff88);
  --dprogress-text-color: #fff;
  --dprogress-success-bg: linear-gradient(90deg, #00ff88, #00cc6a);
  --dprogress-warning-bg: linear-gradient(90deg, #ffcc00, #ff9500);
  --dprogress-error-bg: linear-gradient(90deg, #ff4444, #cc0000);
  
  /* Status Badge */
  --dstatus-idle-bg: #2a2a4a;
  --dstatus-idle-color: #a0a0a0;
  --dstatus-starting-bg: #ffcc00;
  --dstatus-starting-color: #1a1a2e;
  --dstatus-running-bg: #00d4ff;
  --dstatus-running-color: #1a1a2e;
  --dstatus-success-bg: #00ff88;
  --dstatus-success-color: #1a1a2e;
  --dstatus-error-bg: #ff4444;
  --dstatus-error-color: #fff;
  --dstatus-warning-bg: #ffcc00;
  --dstatus-warning-color: #1a1a2e;
  
  /* Stats Grid */
  --dstats-item-bg: #16213e;
  --dstats-value-color: #00d4ff;
  --dstats-unit-color: #a0a0a0;
  --dstats-label-color: #a0a0a0;
  
  /* Progress Card */
  --dcard-bg: #0f3460;
  --dcard-title-color: #e8e8e8;
  --dcard-message-bg: #16213e;
  --dcard-message-color: #a0a0a0;
  --dcard-warning-bg: #ffcc00;
  --dcard-warning-color: #1a1a2e;
  --dcard-crawl-accent: #ff6b6b;
  --dcard-analysis-accent: #4ecdc4;
  --dcard-success-accent: #00ff88;
  --dcard-error-accent: #ff4444;
}

/* ============================================
   Progress Bar
   ============================================ */

.dprogress {
  contain: layout style;
  position: relative;
}

.dprogress__track {
  height: 40px;
  background: var(--dprogress-track-bg);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.dprogress__fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  background: var(--dprogress-fill-bg);
  border-radius: 12px;
  transform-origin: left center;
  will-change: transform;
  transition: transform 0.15s ease-out;
}

.dprogress__text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-variant-numeric: tabular-nums;
  font-size: 1rem;
  font-weight: 600;
  color: var(--dprogress-text-color);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  user-select: none;
  pointer-events: none;
}

.dprogress--small .dprogress__track { height: 24px; border-radius: 8px; }
.dprogress--small .dprogress__fill { border-radius: 8px; }
.dprogress--small .dprogress__text { font-size: 0.75rem; }

.dprogress--large .dprogress__track { height: 56px; border-radius: 16px; }
.dprogress--large .dprogress__fill { border-radius: 16px; }
.dprogress--large .dprogress__text { font-size: 1.25rem; }

.dprogress--success .dprogress__fill { background: var(--dprogress-success-bg); }
.dprogress--warning .dprogress__fill { background: var(--dprogress-warning-bg); }
.dprogress--error .dprogress__fill { background: var(--dprogress-error-bg); }

/* ============================================
   Status Badge
   ============================================ */

.dstatus {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  transition: background-color 0.2s ease-out, color 0.2s ease-out;
}

.dstatus--fixed {
  min-width: 80px;
  text-align: center;
}

.dstatus--idle { background: var(--dstatus-idle-bg); color: var(--dstatus-idle-color); }
.dstatus--starting { background: var(--dstatus-starting-bg); color: var(--dstatus-starting-color); }
.dstatus--running { background: var(--dstatus-running-bg); color: var(--dstatus-running-color); }
.dstatus--complete,
.dstatus--success { background: var(--dstatus-success-bg); color: var(--dstatus-success-color); }
.dstatus--error { background: var(--dstatus-error-bg); color: var(--dstatus-error-color); }
.dstatus--warning { background: var(--dstatus-warning-bg); color: var(--dstatus-warning-color); }

@keyframes dstatus-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.dstatus--pulse.dstatus--running,
.dstatus--pulse.dstatus--starting {
  animation: dstatus-pulse 1.5s ease-in-out infinite;
}

/* ============================================
   Stats Grid
   ============================================ */

.dstats {
  display: grid;
  grid-template-columns: repeat(var(--dstats-columns, 4), 1fr);
  gap: 1rem;
  contain: layout style;
}

.dstats__item {
  text-align: center;
  padding: 0.75rem;
  background: var(--dstats-item-bg);
  border-radius: 8px;
  min-width: 0;
}

.dstats__value {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--dstats-value-color);
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.dstats__unit {
  font-size: 0.75em;
  color: var(--dstats-unit-color);
  margin-left: 0.25em;
}

.dstats__label {
  font-size: 0.75rem;
  color: var(--dstats-label-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0.25rem;
}

@media (max-width: 768px) {
  .dstats { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 480px) {
  .dstats { grid-template-columns: 1fr; }
}

/* ============================================
   Progress Card
   ============================================ */

.dcard {
  background: var(--dcard-bg);
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  contain: layout style;
}

.dcard--crawl { border-top: 4px solid var(--dcard-crawl-accent); }
.dcard--analysis { border-top: 4px solid var(--dcard-analysis-accent); }
.dcard--success { border-top: 4px solid var(--dcard-success-accent); }
.dcard--error { border-top: 4px solid var(--dcard-error-accent); }

.dcard__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.dcard__title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--dcard-title-color);
  margin: 0;
}

.dcard__message {
  margin-top: 1rem;
  padding: 0.75rem;
  background: var(--dcard-message-bg);
  border-radius: 8px;
  font-size: 0.85rem;
  color: var(--dcard-message-color);
  min-height: 2.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dcard__warning {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: var(--dcard-warning-bg);
  color: var(--dcard-warning-color);
  border-radius: 8px;
  font-size: 0.85rem;
  transition: opacity 0.2s ease-out, max-height 0.2s ease-out,
              padding 0.2s ease-out, margin 0.2s ease-out;
  max-height: 100px;
  opacity: 1;
}

.dcard__warning--hidden {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  overflow: hidden;
  pointer-events: none;
}

.dcard .dstats {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

/* ============================================
   Anti-Jitter Utilities
   ============================================ */

/* Apply to any container that updates frequently */
.anti-jitter {
  contain: layout style;
}

/* For elements with changing text content */
.anti-jitter-text {
  font-variant-numeric: tabular-nums;
  user-select: none;
}

/* For animated elements - creates GPU layer */
.anti-jitter-anim {
  will-change: transform, opacity;
}

/* Fixed dimensions container */
.anti-jitter-fixed {
  /* Set explicit dimensions to prevent content-based sizing */
  box-sizing: border-box;
}
`;

module.exports = BASE_CSS;
