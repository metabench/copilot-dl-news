"use strict";

/**
 * Industrial Luxury Obsidian Theme CSS
 * 
 * A premium dark theme inspired by the decision-tree-engine-deep-dive.svg.
 * Features deep obsidian backgrounds, gold accents, and gemstone highlight colors.
 * 
 * Design Philosophy:
 * - Deep, layered obsidian backgrounds create depth
 * - Gold accents provide luxury feel without overwhelming
 * - Gemstone colors (emerald, ruby, sapphire) for semantic highlights
 * - Subtle ambient glows and soft shadows add dimensionality
 * - Premium typography with Georgia serif headings
 */

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR PALETTE
// ═══════════════════════════════════════════════════════════════════════════════

const COLORS = {
  // Primary Background - Deep Obsidian
  obsidian: {
    darkest: "#050508",
    dark: "#0a0d14",
    base: "#0f1420",
    card: "#141824",
    cardHover: "#1a1f2e",
    cardLight: "#252b3d"
  },

  // Gold Accent - Luxury
  gold: {
    bright: "#ffd700",
    light: "#fffacd",
    muted: "#d4af37",
    primary: "#c9a227",
    dark: "#b8960f",
    darkest: "#a07d00",
    dim: "#8b7500"
  },

  // Gemstone Colors - Accents
  emerald: {
    light: "#50c878",
    base: "#2e8b57",
    dark: "#1a5d38"
  },
  ruby: {
    light: "#ff6b6b",
    base: "#e31837",
    dark: "#8b0000"
  },
  sapphire: {
    light: "#6fa8dc",
    base: "#0f52ba",
    dark: "#082567"
  },
  amethyst: {
    light: "#da70d6",
    base: "#9966cc",
    dark: "#4b0082"
  },
  topaz: {
    light: "#ffc87c",
    base: "#ff9f00",
    dark: "#cc7000"
  },

  // Text Colors
  text: {
    primary: "#cbd5e1",
    secondary: "#94a3b8",
    muted: "#64748b",
    dim: "#475569",
    inverted: "#0f1420"
  },

  // Borders & Dividers
  border: {
    subtle: "#334155",
    muted: "#475569",
    accent: "#c9a227"
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPOGRAPHY
// ═══════════════════════════════════════════════════════════════════════════════

const FONTS = {
  heading: '"Georgia", "Playfair Display", serif',
  body: '"Inter", system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", "Fira Code", "Consolas", monospace'
};

// ═══════════════════════════════════════════════════════════════════════════════
// CSS GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate the complete Luxury Obsidian CSS
 */
function buildLuxuryObsidianCss() {
  return `
/* ═══════════════════════════════════════════════════════════════════════════════
   INDUSTRIAL LUXURY OBSIDIAN THEME
   Premium dark theme with gold accents and gemstone highlights
   ═══════════════════════════════════════════════════════════════════════════════ */

:root {
  /* Obsidian Background Scale */
  --lux-bg-darkest: ${COLORS.obsidian.darkest};
  --lux-bg-dark: ${COLORS.obsidian.dark};
  --lux-bg-base: ${COLORS.obsidian.base};
  --lux-bg-card: ${COLORS.obsidian.card};
  --lux-bg-card-hover: ${COLORS.obsidian.cardHover};
  --lux-bg-card-light: ${COLORS.obsidian.cardLight};

  /* Gold Accent Scale */
  --lux-gold-bright: ${COLORS.gold.bright};
  --lux-gold-light: ${COLORS.gold.light};
  --lux-gold-muted: ${COLORS.gold.muted};
  --lux-gold: ${COLORS.gold.primary};
  --lux-gold-dark: ${COLORS.gold.dark};
  --lux-gold-dim: ${COLORS.gold.dim};

  /* Gemstone Accents */
  --lux-emerald: ${COLORS.emerald.light};
  --lux-emerald-base: ${COLORS.emerald.base};
  --lux-ruby: ${COLORS.ruby.light};
  --lux-ruby-base: ${COLORS.ruby.base};
  --lux-sapphire: ${COLORS.sapphire.light};
  --lux-sapphire-base: ${COLORS.sapphire.base};
  --lux-amethyst: ${COLORS.amethyst.light};
  --lux-topaz: ${COLORS.topaz.light};

  /* Text Colors */
  --lux-text: ${COLORS.text.primary};
  --lux-text-secondary: ${COLORS.text.secondary};
  --lux-text-muted: ${COLORS.text.muted};

  /* Borders */
  --lux-border: ${COLORS.border.subtle};
  --lux-border-accent: ${COLORS.border.accent};

  /* Typography */
  --lux-font-heading: ${FONTS.heading};
  --lux-font-body: ${FONTS.body};
  --lux-font-mono: ${FONTS.mono};

  /* Shadows & Glows */
  --lux-shadow-soft: 0 4px 20px rgba(0, 0, 0, 0.5);
  --lux-shadow-deep: 0 8px 32px rgba(0, 0, 0, 0.7);
  --lux-glow-gold: 0 0 20px rgba(201, 162, 39, 0.3);
  --lux-glow-gold-strong: 0 0 30px rgba(201, 162, 39, 0.5);

  /* Transitions */
  --lux-transition-fast: 150ms ease;
  --lux-transition-medium: 250ms ease;
  --lux-transition-slow: 400ms cubic-bezier(0.4, 0, 0.2, 1);

  /* Spacing */
  --lux-space-xs: 4px;
  --lux-space-sm: 8px;
  --lux-space-md: 16px;
  --lux-space-lg: 24px;
  --lux-space-xl: 32px;
  --lux-space-2xl: 48px;

  /* Border Radius */
  --lux-radius-sm: 6px;
  --lux-radius-md: 10px;
  --lux-radius-lg: 16px;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   BASE STYLES
   ═══════════════════════════════════════════════════════════════════════════════ */

*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  min-height: 100vh;
}

body.luxury-obsidian {
  background: 
    /* Diagonal hatch pattern */
    repeating-linear-gradient(
      45deg,
      transparent,
      transparent 8px,
      rgba(201, 162, 39, 0.02) 8px,
      rgba(201, 162, 39, 0.02) 9px
    ),
    /* Luxury grid pattern */
    linear-gradient(to right, rgba(201, 162, 39, 0.03) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(201, 162, 39, 0.03) 1px, transparent 1px),
    /* Base gradient */
    linear-gradient(135deg, var(--lux-bg-darkest) 0%, var(--lux-bg-dark) 25%, var(--lux-bg-base) 50%, var(--lux-bg-dark) 75%, var(--lux-bg-darkest) 100%);
  background-size: auto, 80px 80px, 80px 80px, 100% 100%;
  background-attachment: fixed;
  color: var(--lux-text);
  font-family: var(--lux-font-body);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   PAGE SHELL
   ═══════════════════════════════════════════════════════════════════════════════ */

.lux-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.lux-shell__header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: linear-gradient(180deg, var(--lux-bg-dark) 0%, rgba(10, 13, 20, 0.95) 100%);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--lux-border);
  padding: var(--lux-space-md) var(--lux-space-xl);
}

.lux-shell__header::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, 
    transparent 0%, 
    var(--lux-gold-dim) 20%, 
    var(--lux-gold) 50%, 
    var(--lux-gold-dim) 80%, 
    transparent 100%
  );
  opacity: 0.6;
}

.lux-shell__main {
  flex: 1;
  padding: var(--lux-space-xl);
  max-width: 1600px;
  margin: 0 auto;
  width: 100%;
}

.lux-shell__footer {
  padding: var(--lux-space-lg) var(--lux-space-xl);
  border-top: 1px solid var(--lux-border);
  text-align: center;
  color: var(--lux-text-muted);
  font-size: 12px;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   HERO SECTION
   ═══════════════════════════════════════════════════════════════════════════════ */

.lux-hero {
  text-align: center;
  padding: var(--lux-space-2xl) var(--lux-space-xl);
  position: relative;
  margin-bottom: var(--lux-space-xl);
}

.lux-hero::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 600px;
  height: 200px;
  background: radial-gradient(ellipse, rgba(201, 162, 39, 0.15) 0%, transparent 70%);
  pointer-events: none;
}

.lux-hero__icon {
  font-size: 48px;
  margin-bottom: var(--lux-space-md);
  display: block;
}

.lux-hero__title {
  font-family: var(--lux-font-heading);
  font-size: 42px;
  font-weight: 700;
  margin: 0 0 var(--lux-space-sm) 0;
  background: linear-gradient(90deg, 
    var(--lux-gold-dim) 0%, 
    var(--lux-gold-bright) 30%, 
    var(--lux-gold-light) 50%, 
    var(--lux-gold-bright) 70%, 
    var(--lux-gold-dim) 100%
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 0 40px rgba(201, 162, 39, 0.3);
  letter-spacing: -0.02em;
  position: relative;
}

.lux-hero__subtitle {
  font-family: var(--lux-font-body);
  font-size: 14px;
  color: var(--lux-text-secondary);
  letter-spacing: 3px;
  text-transform: uppercase;
  margin: 0;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   PANEL / CARD
   ═══════════════════════════════════════════════════════════════════════════════ */

.lux-panel {
  background: linear-gradient(180deg, var(--lux-bg-card-hover) 0%, var(--lux-bg-card) 50%, var(--lux-bg-base) 100%);
  border-radius: var(--lux-radius-lg);
  border: 2px solid var(--lux-border);
  box-shadow: var(--lux-shadow-soft);
  overflow: hidden;
  position: relative;
}

.lux-panel::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--lux-radius-lg);
  padding: 2px;
  background: linear-gradient(180deg, 
    rgba(201, 162, 39, 0.4) 0%, 
    rgba(201, 162, 39, 0.1) 50%, 
    transparent 100%
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.lux-panel--gold {
  border-color: var(--lux-gold-dark);
}

.lux-panel--emerald {
  border-color: var(--lux-emerald-base);
}

.lux-panel--sapphire {
  border-color: var(--lux-sapphire-base);
}

.lux-panel__header {
  padding: var(--lux-space-md) var(--lux-space-lg);
  background: linear-gradient(90deg, var(--lux-bg-base) 0%, var(--lux-bg-card-hover) 50%, var(--lux-bg-base) 100%);
  border-bottom: 1px solid var(--lux-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.lux-panel__title {
  font-family: var(--lux-font-heading);
  font-size: 18px;
  font-weight: 600;
  color: var(--lux-gold);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--lux-space-sm);
}

.lux-panel__title::before,
.lux-panel__title::after {
  content: "◆";
  font-size: 10px;
  opacity: 0.6;
}

.lux-panel__meta {
  font-size: 12px;
  color: var(--lux-text-muted);
}

.lux-panel__body {
  padding: var(--lux-space-lg);
}

.lux-panel__footer {
  padding: var(--lux-space-md) var(--lux-space-lg);
  background: var(--lux-bg-dark);
  border-top: 1px solid var(--lux-border);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TABLE
   ═══════════════════════════════════════════════════════════════════════════════ */

.lux-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}

.lux-table thead {
  position: sticky;
  top: 0;
  z-index: 10;
}

.lux-table th {
  background: var(--lux-bg-dark);
  color: var(--lux-gold);
  font-family: var(--lux-font-body);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: var(--lux-space-sm) var(--lux-space-md);
  text-align: left;
  border-bottom: 2px solid var(--lux-gold-dim);
}

.lux-table th:first-child {
  border-top-left-radius: var(--lux-radius-sm);
}

.lux-table th:last-child {
  border-top-right-radius: var(--lux-radius-sm);
}

.lux-table td {
  padding: var(--lux-space-sm) var(--lux-space-md);
  border-bottom: 1px solid var(--lux-border);
  vertical-align: middle;
  transition: background var(--lux-transition-fast);
}

.lux-table tbody tr {
  background: transparent;
  transition: background var(--lux-transition-fast);
}

.lux-table tbody tr:hover {
  background: rgba(201, 162, 39, 0.05);
}

.lux-table tbody tr:hover td {
  border-bottom-color: var(--lux-gold-dim);
}

/* Row index column */
.lux-table td.is-index {
  color: var(--lux-text-muted);
  font-family: var(--lux-font-mono);
  font-size: 11px;
  width: 50px;
  text-align: right;
  padding-right: var(--lux-space-lg);
}

/* URL column */
.lux-table td.is-url {
  font-family: var(--lux-font-mono);
  font-size: 12px;
  max-width: 500px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Status badges */
.lux-table td.is-status {
  text-align: center;
}

/* Links in table */
.lux-table a {
  color: var(--lux-sapphire);
  text-decoration: none;
  transition: color var(--lux-transition-fast);
}

.lux-table a:hover {
  color: var(--lux-sapphire-light);
  text-decoration: underline;
}

/* Numeric columns */
.lux-table td.is-numeric {
  font-family: var(--lux-font-mono);
  text-align: right;
  color: var(--lux-text-secondary);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   PAGINATION
   ═══════════════════════════════════════════════════════════════════════════════ */

.lux-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--lux-space-md) 0;
  gap: var(--lux-space-lg);
}

.lux-pager__info {
  font-size: 13px;
  color: var(--lux-text-secondary);
}

.lux-pager__info strong {
  color: var(--lux-gold);
  font-weight: 600;
}

.lux-pager__controls {
  display: flex;
  gap: var(--lux-space-xs);
}

.lux-pager__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  height: 36px;
  padding: 0 var(--lux-space-md);
  font-family: var(--lux-font-body);
  font-size: 13px;
  font-weight: 500;
  color: var(--lux-text);
  background: var(--lux-bg-card);
  border: 1px solid var(--lux-border);
  border-radius: var(--lux-radius-sm);
  cursor: pointer;
  transition: all var(--lux-transition-fast);
}

.lux-pager__btn:hover:not(:disabled) {
  background: var(--lux-bg-card-hover);
  border-color: var(--lux-gold-dim);
  color: var(--lux-gold);
}

.lux-pager__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.lux-pager__btn--active {
  background: linear-gradient(180deg, var(--lux-gold) 0%, var(--lux-gold-dark) 100%);
  border-color: var(--lux-gold);
  color: var(--lux-bg-darkest);
  font-weight: 600;
  box-shadow: var(--lux-glow-gold);
}

.lux-pager__btn--active:hover {
  background: linear-gradient(180deg, var(--lux-gold-bright) 0%, var(--lux-gold) 100%);
  color: var(--lux-bg-darkest);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   STATUS INDICATORS
   ═══════════════════════════════════════════════════════════════════════════════ */

.lux-status {
  display: inline-flex;
  align-items: center;
  gap: var(--lux-space-xs);
  padding: 2px var(--lux-space-sm);
  font-size: 11px;
  font-weight: 500;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.lux-status--success {
  background: rgba(80, 200, 120, 0.15);
  color: var(--lux-emerald);
  border: 1px solid var(--lux-emerald-base);
}

.lux-status--warning {
  background: rgba(255, 200, 124, 0.15);
  color: var(--lux-topaz);
  border: 1px solid var(--lux-topaz-dark);
}

.lux-status--error {
  background: rgba(255, 107, 107, 0.15);
  color: var(--lux-ruby);
  border: 1px solid var(--lux-ruby-base);
}

.lux-status--info {
  background: rgba(111, 168, 220, 0.15);
  color: var(--lux-sapphire);
  border: 1px solid var(--lux-sapphire-base);
}

.lux-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   BUTTONS
   ═══════════════════════════════════════════════════════════════════════════════ */

.lux-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--lux-space-sm);
  padding: var(--lux-space-sm) var(--lux-space-lg);
  font-family: var(--lux-font-body);
  font-size: 13px;
  font-weight: 500;
  color: var(--lux-text);
  background: var(--lux-bg-card);
  border: 1px solid var(--lux-border);
  border-radius: var(--lux-radius-sm);
  cursor: pointer;
  transition: all var(--lux-transition-fast);
  text-decoration: none;
}

.lux-btn:hover {
  background: var(--lux-bg-card-hover);
  border-color: var(--lux-gold-dim);
}

.lux-btn--gold {
  background: linear-gradient(180deg, var(--lux-gold) 0%, var(--lux-gold-dark) 100%);
  border-color: var(--lux-gold);
  color: var(--lux-bg-darkest);
  font-weight: 600;
}

.lux-btn--gold:hover {
  background: linear-gradient(180deg, var(--lux-gold-bright) 0%, var(--lux-gold) 100%);
  box-shadow: var(--lux-glow-gold);
}

.lux-btn--outline-gold {
  background: transparent;
  border-color: var(--lux-gold);
  color: var(--lux-gold);
}

.lux-btn--outline-gold:hover {
  background: rgba(201, 162, 39, 0.1);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   NAV LINKS
   ═══════════════════════════════════════════════════════════════════════════════ */

.lux-nav {
  display: flex;
  align-items: center;
  gap: var(--lux-space-xs);
}

.lux-nav__link {
  display: inline-flex;
  align-items: center;
  gap: var(--lux-space-xs);
  padding: var(--lux-space-xs) var(--lux-space-md);
  font-size: 13px;
  color: var(--lux-text-secondary);
  text-decoration: none;
  border-radius: var(--lux-radius-sm);
  transition: all var(--lux-transition-fast);
}

.lux-nav__link:hover {
  color: var(--lux-gold);
  background: rgba(201, 162, 39, 0.1);
}

.lux-nav__link--active {
  color: var(--lux-gold);
  background: rgba(201, 162, 39, 0.15);
  font-weight: 500;
}

.lux-nav__divider {
  width: 1px;
  height: 20px;
  background: var(--lux-border);
  margin: 0 var(--lux-space-sm);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   STAT CARDS (for metrics display)
   ═══════════════════════════════════════════════════════════════════════════════ */

.lux-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--lux-space-md);
  margin-bottom: var(--lux-space-xl);
}

.lux-stat {
  background: var(--lux-bg-card);
  border: 1px solid var(--lux-border);
  border-radius: var(--lux-radius-md);
  padding: var(--lux-space-lg);
  text-align: center;
  position: relative;
  overflow: hidden;
}

.lux-stat::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--lux-gold);
  opacity: 0.6;
}

.lux-stat__value {
  font-family: var(--lux-font-heading);
  font-size: 32px;
  font-weight: 700;
  color: var(--lux-gold);
  margin-bottom: var(--lux-space-xs);
}

.lux-stat__label {
  font-size: 12px;
  color: var(--lux-text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.lux-stat--emerald::before {
  background: var(--lux-emerald);
}
.lux-stat--emerald .lux-stat__value {
  color: var(--lux-emerald);
}

.lux-stat--sapphire::before {
  background: var(--lux-sapphire);
}
.lux-stat--sapphire .lux-stat__value {
  color: var(--lux-sapphire);
}

.lux-stat--amethyst::before {
  background: var(--lux-amethyst);
}
.lux-stat--amethyst .lux-stat__value {
  color: var(--lux-amethyst);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   LOADING STATES
   ═══════════════════════════════════════════════════════════════════════════════ */

.lux-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--lux-space-2xl);
  color: var(--lux-text-muted);
}

.lux-loading__spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--lux-border);
  border-top-color: var(--lux-gold);
  border-radius: 50%;
  animation: lux-spin 0.8s linear infinite;
  margin-right: var(--lux-space-sm);
}

@keyframes lux-spin {
  to { transform: rotate(360deg); }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════════════════════════════════════════ */

.lux-empty {
  text-align: center;
  padding: var(--lux-space-2xl);
  color: var(--lux-text-muted);
}

.lux-empty__icon {
  font-size: 48px;
  margin-bottom: var(--lux-space-md);
  opacity: 0.5;
}

.lux-empty__title {
  font-family: var(--lux-font-heading);
  font-size: 18px;
  color: var(--lux-text-secondary);
  margin-bottom: var(--lux-space-sm);
}

.lux-empty__message {
  font-size: 13px;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   FACTS POPUP
   ═══════════════════════════════════════════════════════════════════════════════ */

/* Body state when popup is open */
body.lux-popup-open {
  overflow: hidden;
}

/* Popup container */
.lux-facts-popup {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: none;
  align-items: center;
  justify-content: center;
}

/* Backdrop */
.lux-facts-popup__backdrop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(5, 5, 8, 0.85);
  backdrop-filter: blur(4px);
}

/* Modal */
.lux-facts-popup__modal {
  position: relative;
  background: var(--lux-bg-card);
  border: 1px solid var(--lux-gold-dim);
  border-radius: 12px;
  max-width: 700px;
  width: 90%;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 
    0 0 60px rgba(201, 162, 39, 0.15),
    0 25px 50px rgba(0, 0, 0, 0.5);
  animation: lux-popup-appear 0.2s ease-out;
}

@keyframes lux-popup-appear {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Header */
.lux-facts-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--lux-space-md) var(--lux-space-lg);
  border-bottom: 1px solid var(--lux-border);
  background: linear-gradient(135deg, var(--lux-bg-card-hover) 0%, var(--lux-bg-card) 100%);
}

.lux-facts-popup__title {
  margin: 0;
  font-family: var(--lux-font-heading);
  font-size: 18px;
  font-weight: 600;
  color: var(--lux-gold-light);
}

.lux-facts-popup__close {
  background: transparent;
  border: 1px solid var(--lux-border);
  border-radius: 6px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--lux-text-muted);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.lux-facts-popup__close:hover {
  border-color: var(--lux-gold);
  color: var(--lux-gold);
  background: rgba(201, 162, 39, 0.1);
}

/* URL display */
.lux-facts-popup__url {
  padding: var(--lux-space-md) var(--lux-space-lg);
  background: var(--lux-bg-dark);
  border-bottom: 1px solid var(--lux-border);
}

.lux-facts-popup__url-text {
  font-family: var(--lux-font-mono);
  font-size: 12px;
  color: var(--lux-gold);
  word-break: break-all;
  line-height: 1.6;
}

/* Facts list */
.lux-facts-popup__facts {
  flex: 1;
  overflow-y: auto;
  padding: var(--lux-space-md);
}

/* Fact item */
.lux-fact-item {
  display: flex;
  align-items: flex-start;
  gap: var(--lux-space-md);
  padding: var(--lux-space-md);
  margin-bottom: var(--lux-space-sm);
  border-radius: 8px;
  background: var(--lux-bg-card-hover);
  border: 1px solid var(--lux-border);
  transition: all 0.15s ease;
}

.lux-fact-item:last-child {
  margin-bottom: 0;
}

.lux-fact-item:hover {
  border-color: var(--lux-gold-dim);
}

/* True facts - emerald accent */
.lux-fact-item--true {
  border-left: 3px solid var(--lux-emerald);
}

.lux-fact-item--true .lux-fact-item__indicator {
  color: var(--lux-emerald);
}

.lux-fact-item--true .lux-fact-item__badge {
  background: var(--lux-emerald-dark);
  color: var(--lux-emerald-light);
}

/* False facts - muted appearance */
.lux-fact-item--false {
  border-left: 3px solid var(--lux-border);
  opacity: 0.7;
}

.lux-fact-item--false .lux-fact-item__indicator {
  color: var(--lux-text-dim);
}

.lux-fact-item--false .lux-fact-item__badge {
  background: var(--lux-bg-dark);
  color: var(--lux-text-dim);
}

/* Error facts - ruby accent */
.lux-fact-item--error {
  border-left: 3px solid var(--lux-ruby);
}

.lux-fact-item--error .lux-fact-item__indicator {
  color: var(--lux-ruby);
}

/* Indicator */
.lux-fact-item__indicator {
  font-size: 16px;
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

/* Content */
.lux-fact-item__content {
  flex: 1;
  min-width: 0;
}

.lux-fact-item__name {
  font-family: var(--lux-font-mono);
  font-size: 13px;
  color: var(--lux-text-primary);
  margin-bottom: 4px;
}

.lux-fact-item__evidence {
  font-size: 12px;
  color: var(--lux-text-muted);
  word-break: break-word;
}

.lux-fact-item__evidence--error {
  color: var(--lux-ruby-light);
}

/* Badge */
.lux-fact-item__badge {
  font-family: var(--lux-font-mono);
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Footer */
.lux-facts-popup__footer {
  padding: var(--lux-space-sm) var(--lux-space-lg);
  border-top: 1px solid var(--lux-border);
  background: var(--lux-bg-dark);
  font-size: 11px;
  color: var(--lux-text-dim);
  text-align: center;
  font-style: italic;
}

/* Clickable URL rows */
.lux-url-list .is-url a {
  cursor: pointer;
}

.lux-url-list .is-url a:hover {
  text-decoration: underline;
  text-decoration-color: var(--lux-gold);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   DECORATIVE ELEMENTS
   ═══════════════════════════════════════════════════════════════════════════════ */

/* Gold corner flourishes */
.lux-flourish {
  position: fixed;
  width: 100px;
  height: 100px;
  pointer-events: none;
  opacity: 0.25;
}

.lux-flourish--tl {
  top: 0;
  left: 0;
  background: radial-gradient(ellipse at 0% 0%, var(--lux-gold-dim) 0%, transparent 70%);
}

.lux-flourish--tr {
  top: 0;
  right: 0;
  background: radial-gradient(ellipse at 100% 0%, var(--lux-gold-dim) 0%, transparent 70%);
}

.lux-flourish--bl {
  bottom: 0;
  left: 0;
  background: radial-gradient(ellipse at 0% 100%, var(--lux-gold-dim) 0%, transparent 70%);
}

.lux-flourish--br {
  bottom: 0;
  right: 0;
  background: radial-gradient(ellipse at 100% 100%, var(--lux-gold-dim) 0%, transparent 70%);
}

/* Decorative separator */
.lux-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: var(--lux-space-xl) 0;
}

.lux-divider::before,
.lux-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--lux-border), transparent);
}

.lux-divider__gem {
  padding: 0 var(--lux-space-md);
  color: var(--lux-gold);
  font-size: 12px;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   RESPONSIVE
   ═══════════════════════════════════════════════════════════════════════════════ */

@media (max-width: 768px) {
  .lux-shell__main {
    padding: var(--lux-space-md);
  }

  .lux-hero__title {
    font-size: 28px;
  }

  .lux-stats {
    grid-template-columns: 1fr 1fr;
  }

  .lux-pager {
    flex-direction: column;
    gap: var(--lux-space-md);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SCROLLBAR
   ═══════════════════════════════════════════════════════════════════════════════ */

.luxury-obsidian ::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.luxury-obsidian ::-webkit-scrollbar-track {
  background: var(--lux-bg-dark);
}

.luxury-obsidian ::-webkit-scrollbar-thumb {
  background: var(--lux-bg-card-light);
  border-radius: 5px;
  border: 2px solid var(--lux-bg-dark);
}

.luxury-obsidian ::-webkit-scrollbar-thumb:hover {
  background: var(--lux-gold-dim);
}

/* Firefox */
.luxury-obsidian {
  scrollbar-width: thin;
  scrollbar-color: var(--lux-bg-card-light) var(--lux-bg-dark);
}
`;
}

module.exports = {
  buildLuxuryObsidianCss,
  COLORS,
  FONTS
};
