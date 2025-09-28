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
  const { 
    className = DEFAULT_CLASSNAME,
    separator = DEFAULT_SEPARATOR,
    includeStyle = true,
    inlineStyle = DEFAULT_INLINE_STYLE
  } = options;

  const normalizedKey = typeof activeKey === 'string' ? activeKey : String(activeKey || '');
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

module.exports = {
  NAV_LINKS,
  getNavLinks,
  renderNav
};
