const { is_defined } = require("lang-tools");

/**
 * Creates SSE handlers for client bootstrap. Encapsulates EventSource wiring
 * and event-specific dispatch, keeping index.js lightweight.
 */
function createSseHandlers({
  jobsManager,
  diagramAtlas,
  scheduleResumeInventoryRefresh,
  updateStartupStatus,
  jobsList
}) {
  let eventSource;
  let reconnectTimer;

  function cleanup() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function handleJobsUpdate(payload) {
    if (jobsManager && payload && payload.items) {
      jobsManager.renderJobs(payload);
    }
  }

  function handleDiagramAtlas(payload) {
    if (!diagramAtlas || !payload) {
      return;
    }
    if (payload.sections) {
      diagramAtlas.renderAtlasSections(payload.sections);
    }
    if (payload.status) {
      diagramAtlas.renderAtlasStatus(payload.status);
    }
  }

  function handleResumeInventory(payload) {
    const delay = payload && Number.isFinite(payload.delayMs) ? payload.delayMs : 2000;
    scheduleResumeInventoryRefresh(delay);
  }

  function handleStartupStatus(payload) {
    if (!payload) {
      return;
    }
    updateStartupStatus(payload.startup, payload.statusText);
  }

  function attachSse() {
    cleanup();
    const source = new EventSource('/api/events');
    eventSource = source;

    source.addEventListener('open', () => {
      if (jobsList) {
        jobsList.setAttribute('aria-busy', 'true');
      }
    });

    source.addEventListener('message', (evt) => {
      try {
        if (!evt.data) {
          return;
        }
        const payload = JSON.parse(evt.data);
        if (!payload || !payload.type) {
          return;
        }
        switch (payload.type) {
          case 'jobs:update':
            handleJobsUpdate(payload.data);
            break;
          case 'diagramAtlas:update':
            handleDiagramAtlas(payload.data);
            break;
          case 'jobs:resumeInventory':
            handleResumeInventory(payload.data);
            break;
          case 'jobs:startupStatus':
            handleStartupStatus(payload.data);
            break;
          default:
            break;
        }
      } catch (_) {
        // Ignore malformed payloads but keep SSE alive.
      }
    });

    source.addEventListener('error', () => {
      cleanup();
      reconnectTimer = setTimeout(attachSse, 2000);
    });
  }

  function initSse() {
    if (!is_defined(window) || typeof window.EventSource !== 'function') {
      return;
    }
    attachSse();
  }

  return {
    initSse,
    cleanup
  };
}

module.exports = {
  createSseHandlers
};
