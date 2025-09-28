/**
 * Hydrate every `[data-global-nav]` placeholder by requesting the shared
 * navigation markup from the Express API and swapping it into the DOM.
 */
document.addEventListener('DOMContentLoaded', () => {
  const placeholders = Array.from(document.querySelectorAll('[data-global-nav]'));
  if (!placeholders.length) {
    return;
  }

  placeholders.forEach(async (el) => {
    const active = el.getAttribute('data-active') || '';
    const params = new URLSearchParams();
    if (active) {
      params.set('active', active);
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
      const nav = wrapper.firstElementChild;
      if (nav) {
        el.replaceWith(nav);
      } else {
        el.textContent = 'Navigation unavailable';
      }
    } catch (err) {
      el.textContent = 'Navigation unavailable';
      el.classList.add('global-nav--error');
    }
  });
});
