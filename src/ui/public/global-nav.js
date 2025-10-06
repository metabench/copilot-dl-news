const { each } = require('lang-tools');

/**
 * Hydrate every `[data-global-nav]` placeholder by requesting the shared
 * navigation markup from the Express API and swapping it into the DOM.
 */
document.addEventListener('DOMContentLoaded', () => {
  const placeholders = Array.from(document.querySelectorAll('[data-global-nav]'));
  if (!placeholders.length) {
    return;
  }

  each(placeholders, async (el) => {
    const active = el.getAttribute('data-active') || '';
    const variant = el.getAttribute('data-variant') || '';
    const params = new URLSearchParams();
    if (active) {
      params.set('active', active);
    }
    if (variant) {
      params.set('variant', variant);
    }

    try {
      const response = await fetch(`/api/navigation/bar${params.toString() ? `?${params}` : ''}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (!payload || typeof payload.html !== 'string') {
        throw new Error('Invalid payload');
      }
      const wrapper = document.createElement('div');
      wrapper.innerHTML = payload.html.trim();
      const candidates = Array.from(wrapper.children);
      let replacement = null;
      const extras = [];

      for (const node of candidates) {
        if (node.tagName === 'STYLE' && node.dataset.globalNavStyle) {
          const existing = document.head.querySelector(`style[data-global-nav-style="${node.dataset.globalNavStyle}"]`);
          if (existing) {
            node.remove();
          } else {
            document.head.appendChild(node);
          }
          continue;
        }

        if (!replacement) {
          replacement = node;
        } else {
          extras.push(node);
        }
      }

      if (replacement) {
        el.replaceWith(replacement);
        if (extras.length) {
          let anchor = replacement;
          for (const extra of extras) {
            anchor.after(extra);
            anchor = extra;
          }
        }
      } else {
        el.textContent = 'Navigation unavailable';
        el.classList.add('global-nav--error');
      }
    } catch (err) {
      el.textContent = 'Navigation unavailable';
      el.classList.add('global-nav--error');
    }
  });
});
