/**
 * @fileoverview Crawl controls factory - manages start/stop/pause/resume/analysis button handlers
 * Extracted from index.js to improve modularity and testability using lang-tools patterns.
 * 
 * Uses dependency injection for all external dependencies (no globals).
 * Patterns used: each() for form field iteration, is_defined() for safety checks.
 */

import { each, is_defined } from 'lang-tools';
import { createCrawlProgressIntegration } from './crawlProgressIntegration.js';

async function performCrawl(elements, formElements, actions) {
  console.log('[performCrawl] ===== FUNCTION CALLED =====');
  console.log('[performCrawl] elements:', elements);
  console.log('[performCrawl] formElements:', formElements);
  console.log('[performCrawl] actions:', actions);
  
  const prevLabel = elements.startBtn.textContent;
  console.log('[performCrawl] Previous button label:', prevLabel);
  
  try {
    const selectedType = formElements.crawlType?.value || '';
    console.log('[performCrawl] Selected crawl type:', selectedType);
    actions.resetInsights();
    
    if (selectedType) {
      actions.setCrawlType(selectedType);
    } else {
      actions.setCrawlType('');
    }

    // Build request body from form elements using lang-tools patterns
    const body = {};
    
    // Parse numeric fields
    const numericFields = [
      { key: 'depth', element: formElements.depth, required: true },
      { key: 'maxPages', element: formElements.maxPages },
      { key: 'concurrency', element: formElements.concurrency, required: true },
      { key: 'requestTimeoutMs', element: formElements.requestTimeoutMs },
      { key: 'pacerJitterMinMs', element: formElements.pacerJitterMinMs },
      { key: 'pacerJitterMaxMs', element: formElements.pacerJitterMaxMs }
    ];
    
    each(numericFields, (field) => {
      if (is_defined(field.element) && field.element.value) {
        body[field.key] = parseInt(field.element.value, 10);
      } else if (field.required && is_defined(field.element)) {
        body[field.key] = parseInt(field.element.value, 10);
      }
    });

    // Parse string fields
    const stringFields = [
      { key: 'refetchIfOlderThan', element: formElements.refetchIfOlderThan },
      { key: 'refetchArticleIfOlderThan', element: formElements.refetchArticleIfOlderThan },
      { key: 'refetchHubIfOlderThan', element: formElements.refetchHubIfOlderThan }
    ];
    
    each(stringFields, (field) => {
      if (is_defined(field.element) && field.element.value) {
        body[field.key] = field.element.value;
      }
    });

    // Set crawl type
    if (selectedType) {
      body.crawlType = selectedType;
    }

    // Boolean flags
    if (is_defined(formElements.slowMode)) {
      body.slow = formElements.slowMode.checked;
    }

    // Sitemap handling: if sitemapOnly is checked, useSitemap must be true
    const sitemapOnly = is_defined(formElements.sitemapOnly) && formElements.sitemapOnly.checked;
    const useSitemap = is_defined(formElements.useSitemap) && formElements.useSitemap.checked;
    body.useSitemap = sitemapOnly ? true : useSitemap;
    body.sitemapOnly = sitemapOnly;

    // Only include startUrl if not a gazetteer-type crawl (gazetteer/geography/wikidata use external data sources)
    const isGazetteerType = selectedType === 'gazetteer' || selectedType === 'geography' || selectedType === 'wikidata';
    if (!isGazetteerType && is_defined(formElements.startUrl)) {
      body.startUrl = formElements.startUrl.value;
    }

    const r = await fetch('/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    let payload = null;
    try { 
      payload = await r.json(); 
    } catch (_) {}

    if (!r.ok) {
      const detail = payload?.error || `HTTP ${r.status}`;

      if (r.status === 409) {
        elements.logs.textContent += `\nStart: already running (409)\n`;
        try {
          elements.progress.textContent = 'running (already in progress)…';
          
          // Keep button disabled while crawl is running
          elements.startBtn.textContent = 'Running';
          elements.startBtn.disabled = true;
          
          // Briefly poll status to reflect activity
          const until = Date.now() + 4000;
          (async function poll() {
            try {
              const rs = await fetch('/api/status');
              if (rs.ok) {
                const js = await rs.json();
                if (js.running) {
                  elements.progress.textContent = 'running…';
                }
              }
            } catch {}
            if (Date.now() < until) setTimeout(poll, 300);
          })();
        } catch (_) {}
      } else {
        // Failed to start - reset button
        elements.logs.textContent += `\nStart failed: ${detail}\n`;
        elements.startBtn.disabled = false;
        elements.startBtn.textContent = prevLabel;
      }
    } else {
      elements.logs.textContent += `\nStarted: ${JSON.stringify(payload)}\n`;
      
      // Keep button disabled and update text to "Running"
      elements.startBtn.textContent = 'Running';
      elements.startBtn.disabled = true;
      
      // Notify crawl progress integration
      if (window.__crawlProgress && typeof window.__crawlProgress.handleCrawlStart === 'function') {
        window.__crawlProgress.handleCrawlStart({
          jobId: payload?.jobId || payload?.id || 'unknown',
          maxPages: body.maxPages || 0,
          crawlType: body.crawlType || '',
          startUrl: body.startUrl || ''
        });
      }
      
      // Immediate UI feedback
      try {
        elements.progress.textContent = 'starting… (visited: 0, downloaded: 0, found: 0, saved: 0)';
        actions.updateStartupStatus(null, 'Starting crawler…');
        
        // Kick a short status poll
        window.__startPollUntil = Date.now() + 4000;
        (async function pollOnce() {
          try {
            const now = Date.now();
            if (now > (window.__startPollUntil || 0)) return;
            
            const rs = await fetch('/api/status');
            if (rs.ok) {
              const js = await rs.json();
              if (js && js.running) {
                if ((window.__lastProgress?.visited || 0) === 0) {
                  elements.progress.textContent = 'running… (visited: 0, downloaded: 0, found: 0, saved: 0)';
                }
              }
            }
          } catch (_) {}
          setTimeout(pollOnce, 250);
        })();
      } catch (_) {}
    }
  } catch (e) {
    elements.logs.textContent += `\nStart error: ${e?.message || e}\n`;
    // On error, reset button
    elements.startBtn.disabled = false;
    elements.startBtn.textContent = prevLabel;
  }
}

export function createCrawlControls({ elements, formElements, actions, formatters }) {
  console.log('[createCrawlControls] ===== FUNCTION ENTRY =====');
  console.log('[createCrawlControls] Received elements:', elements);
  console.log('[createCrawlControls] Received formElements:', formElements);
  console.log('[createCrawlControls] Received actions:', actions);
  
  const {
    startBtn,
    stopBtn,
    pauseBtn,
    resumeBtn,
    analysisBtn,
    logs,
    progress,
    // Form elements
    crawlType,
    depth,
    maxPages,
    concurrency,
    requestTimeoutMs,
    pacerJitterMinMs,
    pacerJitterMaxMs,
    refetchIfOlderThan,
    refetchArticleIfOlderThan,
    refetchHubIfOlderThan,
    slowMode,
    sitemapOnly,
    useSitemap,
    startUrl,
    // Analysis elements
    analysisLink,
    analysisStatus
  } = elements;
  
  console.log('[createCrawlControls] Destructured startBtn:', startBtn);
  console.log('[createCrawlControls] startBtn ID:', startBtn?.id);
  console.log('[createCrawlControls] startBtn exists:', !!startBtn);

  // Analysis button handler
  if (is_defined(elements.analysisBtn)) {
    elements.analysisBtn.onclick = async () => {
      const prevLabel = elements.analysisBtn.textContent;
      elements.analysisBtn.disabled = true;
      elements.analysisBtn.textContent = 'Starting…';
      
      if (elements.analysisLink) {
        elements.analysisLink.textContent = 'Starting analysis…';
      }
      if (elements.analysisStatus) {
        actions.renderAnalysisStatus('Analysis run is starting…');
      }
      
      const runStartTs = Date.now();
      actions.patchPipeline({ 
        analysis: { 
          status: 'running', 
          statusLabel: 'Running', 
          summary: 'Manual analysis run starting…', 
          lastRun: runStartTs 
        } 
      });

      try {
        const r = await fetch('/api/analysis/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        let payload = null;
        try { 
          payload = await r.json(); 
        } catch (_) {}

        if (!r.ok) {
          const detail = (payload && payload.error) ? payload.error : `HTTP ${r.status}`;
          
          if (elements.analysisLink) {
            elements.analysisLink.textContent = `Failed: ${detail}`;
          }
          if (elements.analysisStatus) {
            actions.renderAnalysisStatus(`Analysis start failed: ${detail}`, {
              metrics: [{ label: 'Error', value: String(detail) }]
            });
          }
          
          elements.logs.textContent += `\nAnalysis start failed: ${detail}\n`;
          actions.patchPipeline({ 
            analysis: { 
              status: 'failed', 
              statusLabel: 'Failed', 
              summary: `Start failed: ${detail}` 
            } 
          });
        } else {
          const runId = (payload && payload.runId) ? String(payload.runId) : '';
          const detailUrl = (payload && payload.detailUrl) 
            ? String(payload.detailUrl) 
            : (runId ? `/analysis/${runId}/ssr` : '');
          
          actions.renderAnalysisLink(detailUrl, runId);
          
          try {
            if (detailUrl) localStorage.setItem('analysisLastDetailUrl', detailUrl);
            if (runId) localStorage.setItem('analysisLastRunId', runId);
            localStorage.setItem('analysisLastRunAt', String(Date.now()));
          } catch (_) {}

          if (elements.analysisStatus) {
            const stamp = new Date();
            const ts = stamp.getTime();
            const metrics = [];
            if (runId) metrics.push({ label: 'Run', value: runId });
            metrics.push({ 
              label: 'Started', 
              value: formatters.formatRelativeTime(ts), 
              title: stamp.toLocaleString() 
            });
            actions.renderAnalysisStatus('Analysis run launched.', { metrics });
          }
          
          elements.logs.textContent += `\nAnalysis started: ${runId || detailUrl}\n`;
          
          const summary = runId ? `Run ${runId} launched` : 'Analysis run launched';
          actions.patchPipeline({ 
            analysis: { 
              status: 'running', 
              statusLabel: 'Running', 
              summary 
            } 
          });
        }
      } catch (err) {
        const message = (err && err.message) ? err.message : String(err);
        
        if (elements.analysisLink) {
          elements.analysisLink.textContent = `Failed: ${message}`;
        }
        if (elements.analysisStatus) {
          actions.renderAnalysisStatus(`Last attempt failed: ${message}`, {
            metrics: [{ label: 'Error', value: String(message) }],
            muted: false
          });
        }
        
        elements.logs.textContent += `\nAnalysis start error: ${message}\n`;
        actions.patchPipeline({ 
          analysis: { 
            status: 'error', 
            statusLabel: 'Error', 
            summary: `Request failed: ${message}` 
          } 
        });
      } finally {
        elements.analysisBtn.disabled = false;
        elements.analysisBtn.textContent = prevLabel;
      }
    };
  }

  // Start button handler
  console.log('[crawlControls] Setting up start button handler');
  console.log('[crawlControls] elements.startBtn:', elements.startBtn);
  console.log('[crawlControls] is_defined(elements.startBtn):', is_defined(elements.startBtn));
  
  if (is_defined(elements.startBtn)) {
    console.log('[crawlControls] Start button is defined, attaching onclick handler');
    
    const handler = () => {
      console.log('[crawlControls] ===== START BUTTON CLICKED! =====');
      console.log('[crawlControls] Timestamp:', new Date().toISOString());
      console.log('[crawlControls] Button element:', elements.startBtn);
      console.log('[crawlControls] Button text before:', elements.startBtn.textContent);
      console.log('[crawlControls] Button disabled before:', elements.startBtn.disabled);
      
      elements.startBtn.disabled = true;
      elements.startBtn.textContent = 'Starting…';
      
      console.log('[crawlControls] Button text after:', elements.startBtn.textContent);
      console.log('[crawlControls] Button disabled after:', elements.startBtn.disabled);
      console.log('[crawlControls] About to call performCrawl');
      
      setTimeout(() => {
        console.log('[crawlControls] Timeout fired, calling performCrawl now');
        performCrawl(elements, formElements, actions);
      }, 0);
    };
    
    elements.startBtn.onclick = handler;
    console.log('[crawlControls] onclick handler attached successfully');
    console.log('[crawlControls] Verifying attachment:', typeof elements.startBtn.onclick);
  } else {
    console.error('[crawlControls] Start button is NOT defined! Cannot attach handler.');
  }

  // Stop button handler
  if (is_defined(elements.stopBtn)) {
    elements.stopBtn.onclick = async () => {
      try {
        const r = await fetch('/api/stop', { method: 'POST' });
        let j = null;
        try { 
          j = await r.json(); 
        } catch (_) {}

        if (!r.ok) {
          elements.logs.textContent += `\nStop failed: HTTP ${r.status}\n`;
        } else {
          elements.logs.textContent += `\nStop requested: ${JSON.stringify(j)}\n`;
        }
      } catch (e) {
        elements.logs.textContent += `\nStop error: ${e?.message || e}\n`;
      }
    };
  }

  // Pause button handler
  if (is_defined(elements.pauseBtn)) {
    elements.pauseBtn.onclick = async () => {
      try {
        const r = await fetch('/api/pause', { method: 'POST' });
        let j = null;
        try { 
          j = await r.json(); 
        } catch (_) {}

        if (!r.ok) {
          elements.logs.textContent += `\nPause failed: HTTP ${r.status}\n`;
        } else {
          elements.logs.textContent += `\nPause requested: ${JSON.stringify(j)}\n`;
          if (j && (j.paused === true || j.ok === true)) {
            elements.pauseBtn.disabled = true;
            elements.resumeBtn.disabled = false;
          }
        }
      } catch (e) {
        elements.logs.textContent += `\nPause error: ${e?.message || e}\n`;
      }
    };
  }

  // Resume button handler
  if (is_defined(elements.resumeBtn)) {
    elements.resumeBtn.onclick = async () => {
      try {
        const r = await fetch('/api/resume', { method: 'POST' });
        let j = null;
        try { 
          j = await r.json(); 
        } catch (_) {}

        if (!r.ok) {
          elements.logs.textContent += `\nResume failed: HTTP ${r.status}\n`;
        } else {
          elements.logs.textContent += `\nResume requested: ${JSON.stringify(j)}\n`;
          if (j && (j.paused === false || j.ok === true)) {
            elements.pauseBtn.disabled = false;
            elements.resumeBtn.disabled = true;
          }
        }
      } catch (e) {
        elements.logs.textContent += `\nResume error: ${e?.message || e}\n`;
      }
    };
  }

  // Show logs checkbox handler
  if (is_defined(elements.showLogsCheckbox)) {
    elements.showLogsCheckbox.onchange = (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('showLogs', enabled ? '1' : '0');
      
      if (!enabled) {
        elements.logs.textContent = 'Logs are disabled. Enable "Show logs" to stream stdout/stderr here.';
      } else {
        elements.logs.textContent = '';
      }
      
      actions.openEventStream(enabled);
    };
  }
  
  console.log('[createCrawlControls] ===== FUNCTION EXIT =====');
  console.log('[createCrawlControls] All handlers should be attached now');
  
  return {
    initialized: true,
    timestamp: Date.now()
  };
}
