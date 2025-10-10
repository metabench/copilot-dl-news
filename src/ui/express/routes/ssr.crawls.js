const express = require('express');
const { renderCrawlsListPage } = require('../views/crawlsListPage');
const { createRenderContext } = require('../utils/html');
const { errorPage } = require('../components/base');

function createCrawlsSsrRouter({ jobRegistry, renderNav } = {}) {
  if (!jobRegistry) {
    throw new Error('createCrawlsSsrRouter requires jobRegistry');
  }
  if (typeof renderNav !== 'function') {
    throw new Error('createCrawlsSsrRouter requires renderNav function');
  }

  const router = express.Router();
  const context = createRenderContext({ renderNav });

  router.get('/crawls', (req, res) => {
    res.redirect('/crawls/ssr');
  });

  router.get('/crawls/ssr', (req, res) => {
    try {
      const jobs = jobRegistry.getJobs();
      const now = Date.now();
      
      const items = Array.from(jobs.entries()).map(([id, j]) => {
        const m = j.metrics || {};
        const stage = j.stage || (j.child ? 'running' : 'done');
        const status = j.child ? (j.paused ? 'paused' : stage) : stage;
        
        return {
          id,
          pid: j.child?.pid || null,
          url: j.url || null,
          startedAt: j.startedAt || null,
          endedAt: (j.lastExit && j.lastExit.endedAt) ? j.lastExit.endedAt : null,
          paused: !!j.paused,
          status,
          stage,
          stageChangedAt: j.stageChangedAt || null,
          lastActivityAt: m._lastProgressWall || null,
          metrics: {
            visited: m.visited || 0,
            downloaded: m.downloaded || 0,
            found: m.found || 0,
            saved: m.saved || 0,
            errors: m.errors || 0,
            queueSize: m.queueSize || 0,
            requestsPerSec: m.requestsPerSec || 0,
            downloadsPerSec: m.downloadsPerSec || 0
          }
        };
      });

      const html = renderCrawlsListPage({
        items,
        renderNav: context.renderNav
      });
      res.type('html').send(html);
    } catch (err) {
      res.status(500).type('html').send(errorPage({ 
        status: 500, 
        message: `Failed to load crawls: ${err?.message || err}` 
      }, context));
    }
  });

  return router;
}

module.exports = {
  createCrawlsSsrRouter
};
