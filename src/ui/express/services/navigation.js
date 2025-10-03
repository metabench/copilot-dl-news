/**
 * @typedef {Object} NavigationLink
 * @property {string} key - Stable identifier used to highlight the active section.
 * @property {string} label - Human-friendly label rendered in the nav.
 * @property {string} href - Absolute path for the navigation link.
 */

/**
 * @typedef {Object} RenderNavOptions
 * @property {string} [className] - CSS class applied to the root `<nav>` element.
 * @property {string} [separator] - String inserted between each link.
 * @property {boolean} [includeStyle] - When true, apply the inline style attribute.
 * @property {string} [inlineStyle] - Inline CSS applied when `includeStyle` is truthy.
 */

const DEFAULT_SEPARATOR = ' · ';
const DEFAULT_INLINE_STYLE = 'font-size:13px; color:#666; margin-bottom:8px;';
const DEFAULT_CLASSNAME = 'global-nav meta';
const DEFAULT_VARIANT = 'inline';
const BAR_CLASSNAME = 'global-nav global-nav--bar';
const BAR_SHELL_CLASSNAME = 'global-nav-shell';
const BAR_STYLE_ID = 'global-nav-style';
const BAR_STYLE_TAG = `<style id="${BAR_STYLE_ID}" data-global-nav-style="bar">
:root {
  --global-nav-light-bg: rgba(248, 250, 252, 0.88);
  --global-nav-light-border: rgba(148, 163, 184, 0.28);
  --global-nav-light-shadow: 0 16px 44px rgba(15, 23, 42, 0.08);
  --global-nav-light-link: #0f172a;
  --global-nav-light-link-hover-bg: rgba(37, 99, 235, 0.12);
  --global-nav-light-link-border: rgba(37, 99, 235, 0.25);
  --global-nav-light-active-bg: linear-gradient(135deg, rgba(37, 99, 235, 0.95), rgba(59, 130, 246, 0.85));
  --global-nav-light-active-border: rgba(37, 99, 235, 0.45);
  --global-nav-light-active-shadow: 0 12px 30px rgba(37, 99, 235, 0.35);
  --global-nav-dark-bg: rgba(15, 23, 42, 0.78);
  --global-nav-dark-border: rgba(148, 163, 184, 0.24);
  --global-nav-dark-shadow: 0 14px 36px rgba(2, 6, 23, 0.7);
  --global-nav-dark-link: rgba(226, 232, 240, 0.9);
  --global-nav-dark-hover-bg: rgba(59, 130, 246, 0.24);
  --global-nav-dark-hover-border: rgba(59, 130, 246, 0.35);
  --global-nav-dark-active-bg: linear-gradient(135deg, rgba(59, 130, 246, 0.92), rgba(99, 102, 241, 0.9));
  --global-nav-dark-active-border: rgba(59, 130, 246, 0.55);
  --global-nav-dark-active-shadow: 0 16px 38px rgba(59, 130, 246, 0.32);
}

.${BAR_SHELL_CLASSNAME} {
  width: min(1160px, 100%);
  margin: 0 auto 24px;
  padding: 0 20px;
}

.${BAR_SHELL_CLASSNAME} nav {
  width: 100%;
}

.${BAR_CLASSNAME} {
  display: block;
}

.global-nav__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 18px;
  background: var(--global-nav-light-bg);
  border: 1px solid var(--global-nav-light-border);
  box-shadow: var(--global-nav-light-shadow);
  backdrop-filter: blur(14px);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.global-nav__inner::-webkit-scrollbar {
  height: 6px;
}

.global-nav__inner::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.4);
  border-radius: 999px;
}

.global-nav__list {
  list-style: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 0;
  flex-wrap: wrap;
}

.global-nav__item {
  flex: 0 0 auto;
}

.global-nav__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--global-nav-light-link);
  text-decoration: none;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.global-nav__link:hover,
.global-nav__link:focus-visible {
  border-color: var(--global-nav-light-link-border);
  background: var(--global-nav-light-link-hover-bg);
  transform: translateY(-1px);
}

.global-nav__item--active .global-nav__link {
  background: var(--global-nav-light-active-bg);
  color: #ffffff;
  border-color: var(--global-nav-light-active-border);
  box-shadow: var(--global-nav-light-active-shadow);
}

@media (prefers-color-scheme: dark) {
  .global-nav__inner {
    background: var(--global-nav-dark-bg);
    border-color: var(--global-nav-dark-border);
    box-shadow: var(--global-nav-dark-shadow);
  }

  .global-nav__link {
    color: var(--global-nav-dark-link);
  }

  .global-nav__link:hover,
  .global-nav__link:focus-visible {
    background: var(--global-nav-dark-hover-bg);
    border-color: var(--global-nav-dark-hover-border);
  }

  .global-nav__item--active .global-nav__link {
    background: var(--global-nav-dark-active-bg);
    border-color: var(--global-nav-dark-active-border);
    box-shadow: var(--global-nav-dark-active-shadow);
  }
}

.global-nav-shell + * {
  margin-top: 0;
}
</style>`;

/** @type {NavigationLink[]} */
const NAV_LINKS = [
  { key: 'crawler', label: 'Crawler', href: '/' },
  { key: 'queues', label: 'Queues', href: '/queues/ssr' },
  { key: 'analysis', label: 'Analysis', href: '/analysis/ssr' },
  { key: 'milestones', label: 'Milestones', href: '/milestones/ssr' },
  { key: 'problems', label: 'Problems', href: '/problems/ssr' },
  { key: 'coverage', label: 'Coverage Analytics', href: '/coverage-dashboard.html' },
  { key: 'priority', label: 'Priority Config', href: '/priority-config.html' },
  { key: 'gazetteer', label: 'Gazetteer', href: '/gazetteer' },
  { key: 'domains', label: 'Domains', href: '/domains' },
  { key: 'errors', label: 'Errors', href: '/errors' },
  { key: 'urls', label: 'URLs', href: '/urls' }
];

/**
 * Return a defensive copy of the registered navigation links.
 *
 * @returns {NavigationLink[]}
 */
function getNavLinks() {
  return NAV_LINKS.map((link) => ({ ...link }));
}

/**
 * Render the navigation bar as HTML for injection into static templates.
 *
 * @param {string} [activeKey] - Link key that should be styled as active.
 * @param {RenderNavOptions} [options]
 * @returns {string} Serialized HTML string for the navigation `<nav>` element.
 */
function renderNav(activeKey, options = {}) {
  const normalizedKey = typeof activeKey === 'string' ? activeKey : String(activeKey || '');
  const variant = typeof options.variant === 'string' ? options.variant : DEFAULT_VARIANT;

  if (variant === 'bar') {
    return renderBarNav(normalizedKey, options);
  }

  return renderInlineNav(normalizedKey, options);
}

function renderInlineNav(normalizedKey, options) {
  const {
    className = DEFAULT_CLASSNAME,
    separator = DEFAULT_SEPARATOR,
    includeStyle = true,
    inlineStyle = DEFAULT_INLINE_STYLE
  } = options;

  const navAttributes = [`class="${className}"`];
  if (includeStyle && inlineStyle) {
    navAttributes.push(`style="${inlineStyle}"`);
  }

  const linksHtml = NAV_LINKS.map(({ href, label, key }) => {
    const isActive = normalizedKey === key;
    const classes = ['global-nav__link'];
    if (isActive) classes.push('global-nav__link--active');
    const style = isActive ? ' style="font-weight:600"' : '';
    return `<a href="${href}" class="${classes.join(' ')}"${style}>${label}</a>`;
  }).join(separator);

  return `<nav ${navAttributes.join(' ')}>${linksHtml}</nav>`;
}

function renderBarNav(normalizedKey, options = {}) {
  const {
    className = BAR_CLASSNAME,
    shellClassName = BAR_SHELL_CLASSNAME,
    includeStyleTag = true,
    includeStyle = false,
    inlineStyle = '',
    ariaLabel = 'Primary'
  } = options;

  const navAttributes = [`class="${className}"`, `aria-label="${ariaLabel}"`];
  if (includeStyle && inlineStyle) {
    navAttributes.push(`style="${inlineStyle}"`);
  }

  const itemsHtml = NAV_LINKS.map(({ href, label, key }) => {
    const isActive = normalizedKey === key;
    const itemClasses = ['global-nav__item'];
    if (isActive) {
      itemClasses.push('global-nav__item--active');
    }
    const anchorAttributes = [`href="${href}"`, 'class="global-nav__link"'];
    if (isActive) {
      anchorAttributes.push('aria-current="page"');
    }
    return `<li class="${itemClasses.join(' ')}"><a ${anchorAttributes.join(' ')}>${label}</a></li>`;
  }).join('');

  const navMarkup = `<nav ${navAttributes.join(' ')}><div class="global-nav__inner"><ul class="global-nav__list">${itemsHtml}</ul></div></nav>`;
  const shellMarkup = `<div class="${shellClassName}">${navMarkup}</div>`;
  return `${includeStyleTag ? BAR_STYLE_TAG : ''}${shellMarkup}`;
}

function renderNavBar(activeKey, options = {}) {
  return renderNav(activeKey, { ...options, variant: 'bar' });
}

module.exports = {
  NAV_LINKS,
  getNavLinks,
  renderNav,
  renderNavBar,
  BAR_STYLE_TAG
};
