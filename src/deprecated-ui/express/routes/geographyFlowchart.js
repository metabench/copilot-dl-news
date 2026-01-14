/**
 * @fileoverview SSR Router for Geography Crawl Flowchart Page
 * 
 * Renders a dedicated page showing the geography crawl progress
 * as a beautiful SVG flowchart.
 */

'use strict';

const express = require('express');
const { generateFlowchart, parseProgressFromEvents } = require('../../../shared/geographyFlowchart');

function createGeographyFlowchartRouter({ getDbRW, renderNav = () => '' } = {}) {
  const router = express.Router();
  
  /**
   * GET /geography/flowchart
   * 
   * Renders a full-page SVG flowchart showing geography crawl progress.
   * Uses SSE for real-time updates.
   */
  router.get('/geography/flowchart', (req, res) => {
    try {
      // Generate initial flowchart (no progress yet)
      const initialFlowchart = generateFlowchart({
        currentStage: null,
        stages: {},
        completedStages: [],
        errors: []
      }, {
        width: 1200,
        title: 'Geography Crawl Progress'
      });
      
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Geography Crawl Flowchart</title>
  <link rel="stylesheet" href="/ui.css">
  <link rel="stylesheet" href="/ui-dark.css">
  <style>
    .flowchart-page {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }
    .flowchart-header {
      margin-bottom: 2rem;
      text-align: center;
    }
    .flowchart-header h1 {
      font-size: 2rem;
      font-weight: 700;
      color: #111827;
      margin: 0 0 0.5rem 0;
    }
    .flowchart-header p {
      font-size: 1rem;
      color: #6b7280;
      margin: 0;
    }
    .flowchart-container {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .flowchart-legend {
      margin-top: 2rem;
      display: flex;
      justify-content: center;
      gap: 2rem;
      flex-wrap: wrap;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .legend-box {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 2px solid;
    }
    .legend-box.pending {
      background: #f3f4f6;
      border-color: #d1d5db;
    }
    .legend-box.active {
      background: #dbeafe;
      border-color: #3b82f6;
    }
    .legend-box.complete {
      background: #d1fae5;
      border-color: #10b981;
    }
    .legend-box.error {
      background: #fee2e2;
      border-color: #ef4444;
    }
    .legend-label {
      font-size: 0.875rem;
      color: #374151;
      font-weight: 500;
    }
    @media (prefers-color-scheme: dark) {
      .flowchart-container {
        background: #1f2937;
        border-color: #374151;
      }
      .flowchart-header h1 {
        color: #f3f4f6;
      }
      .flowchart-header p {
        color: #9ca3af;
      }
      .legend-label {
        color: #d1d5db;
      }
    }
  </style>
</head>
<body>
  ${renderNav()}
  
  <div class="flowchart-page">
    <div class="flowchart-header">
      <h1>Geography Crawl Flowchart</h1>
      <p>Real-time visualization of geography crawl progress through all stages</p>
    </div>
    
    <div class="flowchart-container" id="flowchart-container">
      ${initialFlowchart}
    </div>
    
    <div class="flowchart-legend">
      <div class="legend-item">
        <div class="legend-box pending"></div>
        <span class="legend-label">Pending</span>
      </div>
      <div class="legend-item">
        <div class="legend-box active"></div>
        <span class="legend-label">Active</span>
      </div>
      <div class="legend-item">
        <div class="legend-box complete"></div>
        <span class="legend-label">Complete</span>
      </div>
      <div class="legend-item">
        <div class="legend-box error"></div>
        <span class="legend-label">Error</span>
      </div>
    </div>
  </div>
  
  <script type="module">
    // Import the client-side module
    import { createGeographyFlowchart } from '/assets/geographyFlowchart.js';
    
    // Connect to SSE
    const sseSource = new EventSource('/events?logs=0');
    
    // Initialize flowchart with real-time updates
    const flowchart = createGeographyFlowchart({
      containerId: 'flowchart-container',
      sseSource
    });
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (flowchart) {
        flowchart.destroy();
      }
      sseSource.close();
    });
  </script>
</body>
</html>`;
      
      res.type('html').send(html);
    } catch (err) {
      console.error('[GeographyFlowchartRouter] Error:', err);
      res.status(500).send('Error rendering flowchart');
    }
  });
  
  return router;
}

module.exports = { createGeographyFlowchartRouter };
