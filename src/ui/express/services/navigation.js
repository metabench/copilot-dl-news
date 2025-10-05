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
 * @property {('inline'|'bar')} [variant] - Navigation presentation style.
 * @property {string} [ariaLabel] - Accessible label applied to the `<nav>` element.
 */

const DEFAULT_SEPARATOR = ' · ';
const DEFAULT_CLASSNAME = 'global-nav global-nav--inline';
const DEFAULT_VARIANT = 'inline';
const BAR_CLASSNAME = 'global-nav global-nav--bar';
const BAR_SHELL_CLASSNAME = 'global-nav-shell';

/** @type {NavigationLink[]} */
const NAV_LINKS = [
  { key: 'crawler', label: 'Crawler', href: '/' },
  { key: 'queues', label: 'Queues', href: '/queues/ssr' },
  { key: 'analysis', label: 'Analysis', href: '/analysis/ssr' },
  { key: 'benchmarks', label: 'Benchmarks', href: '/benchmarks/ssr' },
  { key: 'milestones', label: 'Milestones', href: '/milestones/ssr' },
  { key: 'problems', label: 'Problems', href: '/problems/ssr' },
  { key: 'coverage', label: 'Coverage Analytics', href: '/coverage-dashboard.html' },
  { key: 'priority', label: 'Priority Config', href: '/priority-config.html' },
  { key: 'bootstrap-db', label: 'Bootstrap DB', href: '/bootstrap-db' },
  { key: 'gazetteer', label: 'Gazetteer', href: '/gazetteer' },
  { key: 'gazetteer-progress', label: 'Gazetteer Progress', href: '/gazetteer/progress' },
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
    separator = DEFAULT_SEPARATOR
  } = options;

  const navAttributes = [`class="${className}"`];

  const linksHtml = NAV_LINKS.map(({ href, label, key }) => {
    const isActive = normalizedKey === key;
    const classes = ['global-nav__link'];
    if (isActive) classes.push('global-nav__link--active');
    const attrs = [`href="${href}"`, `class="${classes.join(' ')}"`];
    if (isActive) {
      attrs.push('aria-current="page"');
    }
    return `<a ${attrs.join(' ')}>${label}</a>`;
  }).join(separator);

  return `<nav ${navAttributes.join(' ')}>${linksHtml}</nav>`;
}

function renderBarNav(normalizedKey, options = {}) {
  const {
    className = BAR_CLASSNAME,
    shellClassName = BAR_SHELL_CLASSNAME,
    ariaLabel = 'Primary navigation'
  } = options;

  const navAttributes = [`class="${className}"`, `aria-label="${ariaLabel}"`];

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
  return shellMarkup;
}

function renderNavBar(activeKey, options = {}) {
  return renderNav(activeKey, { ...options, variant: 'bar' });
}

module.exports = {
  NAV_LINKS,
  getNavLinks,
  renderNav,
  renderNavBar
};
