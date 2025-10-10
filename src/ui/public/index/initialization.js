/**
 * @file initialization.js
 * @description Handles all application initialization tasks including logs setup,
 * crawl types dropdown, panel persistence, theme controller, and health monitoring.
 */

import { createBrowserThemeController } from '../theme/browserController.js';

/**
 * Creates initialization manager
 * @param {Object} deps - Dependencies
 * @param {Object} deps.elements - DOM elements needed for initialization
 * @param {Function} deps.openEventStream - Function to open SSE connection with logs setting
 * @returns {Object} Initialization API
 */
export function createInitialization(deps) {
  const { elements, openEventStream } = deps;

  let logEntries = []; // { text, isErr }
  let flushTimer = null;

  /**
   * Restores saved logs panel height from localStorage
   */
  function restoreLogsHeight() {
    if (!elements.logs) return;
    const savedH = parseInt(localStorage.getItem('logsH') || '', 10);
    if (!isNaN(savedH) && savedH >= 120) {
      elements.logs.style.height = savedH + 'px';
    }
  }

  /**
   * Sets up logs font size controls with persistence
   */
  function setupLogsFontControls() {
    const { logs, logsFontVal, logsFontMinus, logsFontPlus } = elements;
    if (!logs) return;

    const clamp = (v) => Math.max(10, Math.min(28, v | 0));
    const getSize = () => {
      const cs = parseInt((getComputedStyle(logs).fontSize || '').replace('px', ''), 10);
      return isNaN(cs) ? 16 : cs;
    };

    const saved = parseInt(localStorage.getItem('logsFontSize') || '', 10);
    const base = getSize();
    const sz = clamp(isNaN(saved) ? base : saved);
    logs.style.fontSize = sz + 'px';
    if (logsFontVal) logsFontVal.textContent = sz + 'px';

    const setSz = (v) => {
      const n = clamp(v);
      logs.style.fontSize = n + 'px';
      localStorage.setItem('logsFontSize', String(n));
      if (logsFontVal) logsFontVal.textContent = n + 'px';
    };

    if (logsFontMinus) {
      logsFontMinus.onclick = () => setSz((parseInt(localStorage.getItem('logsFontSize') || '', 10) || getSize()) - 1);
    }
    if (logsFontPlus) {
      logsFontPlus.onclick = () => setSz((parseInt(localStorage.getItem('logsFontSize') || '', 10) || getSize()) + 1);
    }
  }

  /**
   * Sets up drag-to-resize functionality for logs area
   */
  function setupLogsResizer() {
    const { logs, logsResizer } = elements;
    if (!logsResizer || !logs) return;

    let startY = 0, startH = 0, active = false;

    const onMove = (e) => {
      if (!active) return;
      const dy = e.clientY - startY;
      const maxH = Math.max(200, Math.floor(window.innerHeight * 0.75));
      const newH = Math.min(maxH, Math.max(120, startH + dy));
      logs.style.height = newH + 'px';
    };

    const onUp = () => {
      if (!active) return;
      active = false;
      document.body.classList.remove('resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const h = parseInt(getComputedStyle(logs).height, 10);
      if (!isNaN(h)) localStorage.setItem('logsH', String(h));
    };

    logsResizer.addEventListener('mousedown', (e) => {
      startY = e.clientY;
      startH = parseInt(getComputedStyle(logs).height, 10) || logs.clientHeight || 240;
      active = true;
      document.body.classList.add('resizing');
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  /**
   * Schedules a batch flush of log entries to the DOM
   */
  function scheduleLogFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      try {
        const frag = document.createDocumentFragment();
        for (const ent of logEntries) {
          const span = document.createElement('span');
          span.textContent = ent.text;
          if (ent.isErr) span.classList.add('log-error');
          frag.appendChild(span);
        }
        elements.logs.appendChild(frag);
        elements.logs.scrollTop = elements.logs.scrollHeight;
      } catch (_) {
        // Fallback to plain text append if something goes wrong
        try {
          elements.logs.textContent += logEntries.map(e => e.text).join('');
        } catch (_) {}
      }
      logEntries = [];
      flushTimer = null;
    }, 200);
  }

  /**
   * Initializes logs toggle from localStorage (default ON if unset)
   */
  function initLogsToggle() {
    const pref = localStorage.getItem('showLogs');
    const enabled = (pref == null) ? true : (pref === '1');
    if (pref == null) localStorage.setItem('showLogs', '1');
    
    const showLogsCheckbox = document.getElementById('showLogs');
    if (showLogsCheckbox) {
      showLogsCheckbox.checked = enabled;
    }
    
    if (!enabled && elements.logs) {
      elements.logs.textContent = 'Logs are disabled. Enable "Show logs" to stream stdout/stderr here.';
    }
    
    openEventStream(enabled);
  }

  /**
   * Loads crawl types and initializes the dropdown
   */
  async function initCrawlTypes() {
    console.log('[init] initCrawlTypes: Starting crawl types initialization');
    const sel = document.getElementById('crawlType');
    if (!sel) {
      console.warn('[init] initCrawlTypes: crawlType dropdown not found');
      return;
    }
    console.log('[init] initCrawlTypes: Found crawlType dropdown');

    const storedType = localStorage.getItem('ctrl_crawlType') || '';
    const legacyMode = localStorage.getItem('ctrl_mode');
    const saved = storedType || (legacyMode === 'intelligent' ? 'intelligent' : '');

    try {
      console.log('[init] initCrawlTypes: Fetching /api/crawl-types');
      const r = await fetch('/api/crawl-types');
      console.log('[init] initCrawlTypes: Fetch response status:', r.status, r.ok);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      console.log('[init] initCrawlTypes: Received data:', j);
      const items = Array.isArray(j.items) ? j.items : [];
      console.log('[init] initCrawlTypes: Crawl types count:', items.length);
      sel.innerHTML = '';
      
      for (const it of items) {
        const opt = document.createElement('option');
        opt.value = it.name;
        opt.textContent = it.name;
        opt.title = it.description || '';
        sel.appendChild(opt);
      }
      
      const def = items.find(x => x.name === 'basic-with-sitemap') 
        ? 'basic-with-sitemap' 
        : (items[0]?.name || 'basic');
      sel.value = saved && items.some(x => x.name === saved) ? saved : def;
      console.log('[init] initCrawlTypes: Dropdown populated successfully with', items.length, 'types');
    } catch (e) {
      console.error('[init] initCrawlTypes: Error loading crawl types:', e);
      console.error('[init] initCrawlTypes: Error message:', e.message);
      console.error('[init] initCrawlTypes: Error stack:', e.stack);
      // Fallback options if API call fails
      sel.innerHTML = '<option value="basic-with-sitemap">basic-with-sitemap</option><option value="intelligent">intelligent</option><option value="basic">basic</option><option value="sitemap-only">sitemap-only</option>';
      console.warn('[init] initCrawlTypes: Using fallback options');
      if (saved && Array.from(sel.options).some(opt => opt.value === saved)) {
        sel.value = saved;
      }
    }

    // Apply sitemap checkboxes and field visibility based on selected type
    const applyByType = () => {
      const v = sel.value;
      const useEl = document.getElementById('useSitemap');
      const soEl = document.getElementById('sitemapOnly');
      const startUrlField = document.getElementById('startUrlField');
      const startUrlInput = document.getElementById('startUrl');
      const depthField = document.getElementById('depthField');
      const depthInput = document.getElementById('depth');
      const gazetteerNote = document.getElementById('gazetteerNote');

      if (!useEl || !soEl) return;

      // Handle gazetteer/geography/wikidata types: these crawl data sources, not traditional websites
      const isGazetteerType = v === 'gazetteer' || v === 'geography' || v === 'wikidata';
      
      if (isGazetteerType) {
        if (startUrlField) {
          startUrlField.classList.add('control-field--hidden');
          startUrlField.classList.add('control-field--disabled');
        }
        if (startUrlInput) {
          startUrlInput.disabled = true;
          startUrlInput.removeAttribute('required');
        }
        if (depthField) {
          depthField.classList.add('control-field--hidden');
          depthField.classList.add('control-field--disabled');
        }
        if (depthInput) depthInput.disabled = true;
        if (gazetteerNote) {
          gazetteerNote.classList.remove('control-field--hidden');
          // Update note text based on specific type
          if (v === 'wikidata') {
            gazetteerNote.textContent = 'Wikidata crawl: Ingests gazetteer data from Wikidata SPARQL endpoint';
          } else if (v === 'geography') {
            gazetteerNote.textContent = 'Geography crawl: Aggregates gazetteer data from Wikidata and OpenStreetMap boundaries';
          } else {
            gazetteerNote.textContent = 'Gazetteer crawl: Ingests geographic place data';
          }
        }
        
        useEl.checked = false;
        useEl.disabled = false;
        soEl.checked = false;
        soEl.disabled = false;
      } else {
        // Show startUrl and depth fields for other types
        if (startUrlField) {
          startUrlField.classList.remove('control-field--hidden');
          startUrlField.classList.remove('control-field--disabled');
        }
        if (startUrlInput) startUrlInput.disabled = false;
        if (depthField) {
          depthField.classList.remove('control-field--hidden');
          depthField.classList.remove('control-field--disabled');
        }
        if (depthInput) depthInput.disabled = false;
        if (gazetteerNote) gazetteerNote.classList.add('control-field--hidden');

        // Configure sitemap checkboxes based on type
        if (v === 'basic-with-sitemap') {
          useEl.checked = true;
          useEl.disabled = true;
          soEl.checked = false;
          soEl.disabled = false;
        } else if (v === 'sitemap-only') {
          useEl.checked = true;
          useEl.disabled = true;
          soEl.checked = true;
          soEl.disabled = true;
        } else {
          useEl.checked = false;
          useEl.disabled = false;
          soEl.checked = false;
          soEl.disabled = false;
        }
      }
    };

    applyByType();
    sel.addEventListener('change', applyByType);
  }

  /**
   * Persists open/closed state of collapsible panels
   */
  function persistPanels() {
    const { secErrors, secDomains, secLogs } = elements;
    const pairs = [
      ['secErrors', secErrors],
      ['secDomains', secDomains],
      ['secLogs', secLogs]
    ];

    for (const [key, el] of pairs) {
      if (!el) continue;
      const v = localStorage.getItem(key);
      if (v === '0') el.open = false;
      el.addEventListener('toggle', () => {
        localStorage.setItem(key, el.open ? '1' : '0');
      });
    }
  }

  /**
   * Sets up theme controller with button sync
   */
  function setupThemeController() {
    const { themeBtn } = elements;
    const themeController = createBrowserThemeController();

    const syncThemeButton = ({ theme }) => {
      if (!themeBtn) return;
      const isDark = theme === 'dark';
      themeBtn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      themeBtn.textContent = isDark ? 'Light' : 'Dark';
      const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
      themeBtn.setAttribute('aria-label', label);
      themeBtn.title = label;
    };

    themeController.subscribe(syncThemeButton);

    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const nextTheme = themeController.getTheme() === 'dark' ? 'light' : 'dark';
        themeController.setTheme(nextTheme);
      });
    }

    return themeController;
  }

  /**
   * Loads health strip information (DB size, disk space, CPU, memory)
   */
  async function loadHealthStrip() {
    const { badgeDb, badgeDisk, badgeCpu, badgeMem, badgeWal } = elements;
    if (!badgeDb) return;

    try {
      const r = await fetch('/api/system-health');
      if (!r.ok) {
        console.debug('[initialization] System health endpoint not available:', r.status);
        return;
      }
      
      const contentType = r.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.debug('[initialization] System health endpoint returned non-JSON response');
        return;
      }
      
      let j;
      try {
        j = await r.json();
      } catch (parseErr) {
        console.debug('[initialization] Failed to parse system health JSON:', parseErr.message);
        return;
      }
      const fmt = (b) => b == null 
        ? 'n/a' 
        : (b >= 1073741824 
          ? (b / 1073741824).toFixed(2) + ' GB' 
          : (b / 1048576).toFixed(1) + ' MB');

      badgeDb.textContent = 'db: ' + fmt(j.dbSizeBytes);
      badgeDisk.textContent = 'disk: ' + fmt(j.freeDiskBytes);

      if (j && j.cpu && badgeCpu) {
        const pct = (j.cpu.percent != null) 
          ? j.cpu.percent 
          : (j.cpu.percentOfOneCore != null ? j.cpu.percentOfOneCore : null);
        if (pct != null) badgeCpu.textContent = 'cpu: ' + pct.toFixed(1) + '%';
      }

      if (j && j.memory && badgeMem) {
        badgeMem.textContent = 'mem: ' + fmt(j.memory.rss);
      }

      if (j && j.walSizeBytes != null && badgeWal) {
        badgeWal.textContent = 'wal: ' + fmt(j.walSizeBytes);
      }
    } catch (err) {
      console.error('Failed to load health strip:', err);
    }
  }

  /**
   * Runs all initialization tasks
   */
  async function initialize() {
    console.log('[init] initialize: Starting full initialization sequence');
    
    // Logs setup
    console.log('[init] initialize: Restoring logs height');
    restoreLogsHeight();
    console.log('[init] initialize: Setting up logs font controls');
    setupLogsFontControls();
    console.log('[init] initialize: Setting up logs resizer');
    setupLogsResizer();
    console.log('[init] initialize: Initializing logs toggle');
    initLogsToggle();

    // UI initialization
    console.log('[init] initialize: About to call initCrawlTypes');
    await initCrawlTypes();
    console.log('[init] initialize: initCrawlTypes completed');
    
    console.log('[init] initialize: Persisting panels');
    persistPanels();
    console.log('[init] initialize: Setting up theme controller');
    const themeController = setupThemeController();

    // Load health data
    console.log('[init] initialize: Loading health strip');
    await loadHealthStrip();

    return { themeController, scheduleLogFlush };
  }

  // Public API
  return {
    initialize,
    restoreLogsHeight,
    setupLogsFontControls,
    setupLogsResizer,
    initLogsToggle,
    initCrawlTypes,
    persistPanels,
    setupThemeController,
    loadHealthStrip,
    scheduleLogFlush
  };
}
