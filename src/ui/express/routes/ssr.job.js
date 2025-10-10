'use strict';

const express = require('express');
const { renderJobDetailPage } = require('../views/jobDetailPage');

function createJobDetailRouter({ jobRegistry, renderNav }) {
  const router = express.Router();

  // SSR route for individual job detail
  router.get('/jobs/:jobId', (req, res) => {
    const { jobId } = req.params;
    const jobs = jobRegistry.getJobs();
    const job = jobs.get(jobId);

    if (!job) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Job Not Found</title>
          <link rel="stylesheet" href="/theme/theme.css">
          <link rel="stylesheet" href="/styles/ui.css">
        </head>
        <body>
          ${renderNav('crawls')}
          <div class="container">
            <h1>Job Not Found</h1>
            <p>Job ID <code>${jobId}</code> not found.</p>
            <p><a href="/crawls/ssr">← Back to Crawls List</a></p>
          </div>
        </body>
        </html>
      `);
    }

    // Get job summary with achievements and lifecycle
    const summary = jobRegistry.summaryFn ? jobRegistry.summaryFn(jobs) : { items: [] };
    const jobSummary = summary.items.find(item => item.id === jobId) || job;

    const html = renderJobDetailPage({
      job: jobSummary,
      renderNav
    });

    res.send(html);
  });

  return router;
}

module.exports = { createJobDetailRouter };
