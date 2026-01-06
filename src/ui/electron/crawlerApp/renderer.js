// Crawler App - Renderer Script
// Mobile-style navigation with card-based drill-down

let config = { url: 'https://www.theguardian.com', maxPages: 1000, maxDepth: 3, timeout: 60000, operation: 'basicArticleCrawl' };
let state = { running: false, downloaded: 0, queued: 0, errors: 0, startTime: null };
let currentUrls = [];
let selectedUrl = null;
let rateHistory = [];
let currentScreen = 'home';

// DOM Elements
const screens = {
  home: document.getElementById('homeScreen'),
  urls: document.getElementById('urlsScreen'),
  detail: document.getElementById('detailScreen'),
  settings: document.getElementById('settingsScreen')
};

// Loading Overlay
function showLoading(message = 'Loading...') {
  const overlay = document.getElementById('loadingOverlay');
  const text = overlay.querySelector('.loading-text');
  if (text) text.textContent = message;
  overlay.classList.remove('hidden');
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('hidden');
}

// Navigation
function showScreen(name) {
  currentScreen = name;
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  
  // Update tab bar active state
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.screen === name);
  });
  
  // Focus first focusable element in new screen
  const firstFocusable = screens[name].querySelector('button, input, [tabindex="0"]');
  if (firstFocusable) firstFocusable.focus();
}

// Toast
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast' + (isError ? ' error' : '');
  setTimeout(() => toast.classList.add('visible'), 10);
  setTimeout(() => toast.classList.remove('visible'), 3000);
}

// Circular progress + horizontal bar
function updateProgress(downloaded, maxPages) {
  const ring = document.getElementById('progressRing');
  const circumference = 2 * Math.PI * 70; // r=70
  const percent = Math.min(1, downloaded / maxPages);
  const offset = circumference * (1 - percent);
  ring.style.strokeDashoffset = offset;
  
  document.getElementById('progressValue').textContent = downloaded;
  document.getElementById('progressMax').textContent = maxPages;
  
  // Horizontal progress bar
  const bar = document.getElementById('progressBar');
  if (bar) bar.style.width = (percent * 100) + '%';
  
  // Percentage
  const percentEl = document.getElementById('progressPercent');
  if (percentEl) percentEl.textContent = Math.round(percent * 100) + '%';
  
  // ETA calculation
  const etaEl = document.getElementById('progressEta');
  if (etaEl && state.startTime && downloaded > 0 && state.running) {
    const elapsed = (Date.now() - state.startTime) / 1000;
    const rate = downloaded / elapsed;
    const remaining = maxPages - downloaded;
    const etaSec = rate > 0 ? remaining / rate : 0;
    if (etaSec > 0 && etaSec < 36000) {
      const mins = Math.floor(etaSec / 60);
      const secs = Math.floor(etaSec % 60);
      etaEl.textContent = `ETA ${mins}:${secs.toString().padStart(2, '0')}`;
    } else {
      etaEl.textContent = 'calculating...';
    }
  } else if (etaEl) {
    etaEl.textContent = downloaded >= maxPages ? 'Complete!' : '--:--';
  }
}

// Calculate rate
function calculateRate() {
  const now = Date.now();
  rateHistory.push({ time: now, count: state.downloaded });
  // Keep last 10 seconds
  rateHistory = rateHistory.filter(r => now - r.time < 10000);
  if (rateHistory.length < 2) return '0/s';
  const first = rateHistory[0];
  const last = rateHistory[rateHistory.length - 1];
  const elapsed = (last.time - first.time) / 1000;
  const rate = elapsed > 0 ? (last.count - first.count) / elapsed : 0;
  return rate.toFixed(1) + '/s';
}

// Update UI from state
function updateUI(data) {
  if (data.config) {
    config = data.config;
    document.getElementById('targetUrl').textContent = new URL(config.url).hostname;
    document.getElementById('inputUrl').value = config.url;
    document.getElementById('inputMaxPages').value = config.maxPages;
    document.getElementById('inputMaxDepth').value = config.maxDepth;
    document.getElementById('inputTimeout').value = Math.round(config.timeout / 1000);
    if (document.getElementById('inputOperation')) {
      document.getElementById('inputOperation').value = config.operation || 'basicArticleCrawl';
    }
  }
  
  if (data.state) {
    state = data.state;
    updateProgress(state.downloaded || 0, config.maxPages || 100);
    document.getElementById('statQueue').textContent = state.queued || 0;
    document.getElementById('statErrors').textContent = state.errors || 0;
    document.getElementById('statRate').textContent = calculateRate();
    
    const btn = document.getElementById('btnAction');
    if (state.running) {
      btn.textContent = '⏸ Pause Crawl';
      btn.classList.add('danger');
    } else {
      btn.textContent = state.downloaded > 0 ? '▶ Resume Crawl' : 'Start Crawl';
      btn.classList.remove('danger');
    }
  }
}

// URL List rendering
function renderUrlList() {
  const list = document.getElementById('urlList');
  document.getElementById('urlCount').textContent = currentUrls.length + ' items';
  
  if (currentUrls.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><div>No URLs downloaded yet</div></div>`;
    return;
  }
  
  list.innerHTML = currentUrls.map((item, i) => {
    const statusClass = item.status >= 400 ? 'error' : item.status === 304 ? 'cached' : 'success';
    const time = new Date(item.timestamp).toLocaleTimeString();
    const meta = item.status === 200 ? `✓ ${formatBytes(item.size || 0)}` : 
                 item.status === 304 ? '↻ Cached' : `✗ ${item.status || 'Error'}`;
    return `
      <div class="url-item" data-index="${i}">
        <div class="url-status ${statusClass}"></div>
        <div class="url-content">
          <div class="url-index">#${item.index || i + 1}</div>
          <div class="url-text">${truncateUrl(item.url)}</div>
          <div class="url-meta">${meta}</div>
        </div>
        <div class="url-time">${time}</div>
      </div>
    `;
  }).join('');
  
  // Click handlers
  list.querySelectorAll('.url-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index);
      showDetail(currentUrls[idx]);
    });
  });
}

// Detail view
async function showDetail(urlItem) {
  selectedUrl = urlItem;
  showScreen('detail');
  
  const content = document.getElementById('detailContent');
  content.innerHTML = '<div class="empty-state">Loading...</div>';
  
  try {
    const analysis = await window.crawlerAPI.analyzeUrl(urlItem.url);
    const r = analysis.httpResponse || {};
    const statusClass = (r.http_status || 0) >= 400 ? 'error' : '';
    
    // Calculate timing percentages
    const total = r.total_ms || 1;
    const dns = r.dns_ms || 0;
    const tcp = r.tcp_ms || 0;
    const ttfb = r.ttfb_ms || 0;
    const download = total - ttfb;
    
    content.innerHTML = `
      <div class="detail-section">
        <div class="detail-title">URL</div>
        <div class="detail-card" style="word-break:break-all;font-size:12px;color:var(--text-muted);">
          ${urlItem.url}
        </div>
      </div>
      
      <div class="detail-section">
        <div class="detail-title">Response</div>
        <div class="detail-card">
          <div class="card-row">
            <span class="detail-status ${statusClass}">${r.http_status || 'N/A'} ${r.http_status === 200 ? 'OK' : ''}</span>
            <span style="color:var(--text-muted);font-size:12px;">${r.content_type || 'unknown'}</span>
          </div>
        </div>
      </div>
      
      <div class="detail-section">
        <div class="detail-title">Timing</div>
        <div class="timing-bar">
          <div class="timing-segment timing-dns" style="flex:${dns || 1}">DNS</div>
          <div class="timing-segment timing-tcp" style="flex:${tcp || 1}">TCP</div>
          <div class="timing-segment timing-ttfb" style="flex:${ttfb || 1}">TTFB</div>
          <div class="timing-segment timing-download" style="flex:${download || 1}">DL</div>
        </div>
        <div class="timing-labels">
          <span>${dns}ms</span>
          <span>${tcp}ms</span>
          <span>${ttfb}ms</span>
          <span>${download}ms</span>
          <span style="font-weight:600;color:var(--text);">= ${total}ms</span>
        </div>
      </div>
      
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-item-label">Size</div><div class="detail-item-value">${formatBytes(r.bytes_downloaded || 0)}</div></div>
        <div class="detail-item"><div class="detail-item-label">Compression</div><div class="detail-item-value">${r.content_encoding || 'none'}</div></div>
        <div class="detail-item"><div class="detail-item-label">Fetched</div><div class="detail-item-value">${formatTime(r.fetched_at)}</div></div>
        <div class="detail-item"><div class="detail-item-label">URL ID</div><div class="detail-item-value">${analysis.urlRecord?.id || 'N/A'}</div></div>
      </div>
      
      <div class="action-row">
        <button class="btn-secondary" id="btnCopy">📋 Copy</button>
        <button class="btn-secondary" id="btnOpen">🌐 Open</button>
      </div>
    `;
    
    document.getElementById('btnCopy').addEventListener('click', () => {
      navigator.clipboard.writeText(urlItem.url);
      showToast('URL copied');
    });
    
    document.getElementById('btnOpen').addEventListener('click', () => {
      window.crawlerAPI.openExternal(urlItem.url);
    });
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div>Error loading details</div></div>`;
  }
}

// Helpers
function truncateUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    if (path.length > 40) return u.hostname + path.substring(0, 37) + '...';
    return u.hostname + path;
  } catch { return url.substring(0, 50); }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatTime(ts) {
  if (!ts) return 'N/A';
  return new Date(ts).toLocaleTimeString();
}

// Presets
const PRESETS = {
  quick: { maxPages: 10, maxDepth: 1, timeout: 30000, operation: 'basicArticleCrawl' },
  standard: { maxPages: 1000, maxDepth: 3, timeout: 60000, operation: 'basicArticleCrawl' },
  deep: { maxPages: 5000, maxDepth: 5, timeout: 120000, operation: 'basicArticleCrawl' },
  explorer: { maxPages: 500, maxDepth: 3, timeout: 60000, operation: 'siteExplorer' }
};

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  document.getElementById('inputMaxPages').value = preset.maxPages;
  document.getElementById('inputMaxDepth').value = preset.maxDepth;
  document.getElementById('inputTimeout').value = preset.timeout / 1000;
  if (preset.operation && document.getElementById('inputOperation')) {
    document.getElementById('inputOperation').value = preset.operation;
  }
  
  document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-preset="${name}"]`).classList.add('active');
}

// Event Handlers
document.getElementById('btnAction').addEventListener('click', async () => {
  if (state.running) {
    await window.crawlerAPI.stopCrawl();
  } else {
    rateHistory = [];
    await window.crawlerAPI.startCrawl();
  }
});

document.getElementById('btnUrls').addEventListener('click', async () => {
  currentUrls = await window.crawlerAPI.getUrls();
  renderUrlList();
  showScreen('urls');
});

document.getElementById('btnSettings').addEventListener('click', () => showScreen('settings'));
document.getElementById('targetCard').addEventListener('click', () => showScreen('settings'));

document.getElementById('urlsBack').addEventListener('click', () => showScreen('home'));
document.getElementById('detailBack').addEventListener('click', () => showScreen('urls'));
document.getElementById('settingsBack').addEventListener('click', () => showScreen('home'));

document.getElementById('btnSaveSettings').addEventListener('click', async () => {
  await window.crawlerAPI.setConfig({
    url: document.getElementById('inputUrl').value,
    maxPages: parseInt(document.getElementById('inputMaxPages').value, 10),
    maxDepth: parseInt(document.getElementById('inputMaxDepth').value, 10),
    timeout: parseInt(document.getElementById('inputTimeout').value, 10) * 1000,
    operation: document.getElementById('inputOperation') ? document.getElementById('inputOperation').value : 'basicArticleCrawl'
  });
  showToast('Settings saved');
  showScreen('home');
});

document.querySelectorAll('.preset-chip').forEach(chip => {
  chip.addEventListener('click', () => applyPreset(chip.dataset.preset));
});

// Tab Bar Navigation
document.querySelectorAll('.tab-item').forEach(tab => {
  tab.addEventListener('click', async () => {
    const screen = tab.dataset.screen;
    if (screen === 'urls') {
      currentUrls = await window.crawlerAPI.getUrls();
      renderUrlList();
    }
    showScreen(screen);
  });
});

// Keyboard Navigation
document.addEventListener('keydown', async (e) => {
  // Global shortcuts
  if (e.ctrlKey || e.metaKey) {
    switch (e.key) {
      case ',': // Ctrl+, = Settings
        e.preventDefault();
        showScreen('settings');
        break;
      case 'u': // Ctrl+U = URLs
      case 'U':
        e.preventDefault();
        currentUrls = await window.crawlerAPI.getUrls();
        renderUrlList();
        showScreen('urls');
        break;
      case 's': // Ctrl+S = Save settings (when in settings screen)
      case 'S':
        if (currentScreen === 'settings') {
          e.preventDefault();
          document.getElementById('btnSaveSettings').click();
        }
        break;
    }
    return;
  }
  
  // Escape = Go back / Home
  if (e.key === 'Escape') {
    e.preventDefault();
    if (currentScreen === 'detail') {
      showScreen('urls');
    } else if (currentScreen !== 'home') {
      showScreen('home');
    }
    return;
  }
  
  // Enter/Space on crawl action
  if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === document.getElementById('btnAction')) {
    return; // Let the default click handler work
  }
  
  // Number keys for quick screen switching (when not in input)
  if (!e.target.matches('input')) {
    switch (e.key) {
      case '1':
        showScreen('home');
        break;
      case '2':
        currentUrls = await window.crawlerAPI.getUrls();
        renderUrlList();
        showScreen('urls');
        break;
      case '3':
        showScreen('settings');
        break;
    }
  }
});

// Listen for updates
window.crawlerAPI.onUpdate((data) => {
  updateUI(data);
  // Hide loading when we get first update with running state
  if (data.state && data.state.running) {
    hideLoading();
  }
});

// Listen for loading overlay control from main process
window.crawlerAPI.onShowLoading((message) => {
  showLoading(message);
});
window.crawlerAPI.onHideLoading(() => {
  hideLoading();
});

// Initial state load
window.crawlerAPI.getState().then(data => {
  updateUI(data);
  // Only hide loading if not auto-starting (main process will control it)
});
