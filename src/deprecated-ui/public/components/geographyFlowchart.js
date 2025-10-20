/**
 * @fileoverview Client-side Geography Flowchart Component
 * 
 * Uses the isomorphic flowchart generator to display real-time
 * progress visualization for geography crawls.
 * 
 * **Features**:
 * - Real-time updates via SSE
 * - Smooth transitions between states
 * - Responsive design
 * - Progressive enhancement
 */

import { generateFlowchart, parseProgressFromEvents, updateFlowchart } from '../../shared/geographyFlowchart.js';

export function createGeographyFlowchart({ containerId, sseSource = null }) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`[GeographyFlowchart] Container #${containerId} not found`);
    return null;
  }
  
  // State
  let events = [];
  let progressData = { currentStage: null, stages: {}, completedStages: [], errors: [] };
  let updateInterval = null;
  
  // Initialize with empty state
  const initialSvg = generateFlowchart(progressData, { title: 'Geography Crawl Progress' });
  container.innerHTML = initialSvg;
  
  // Update flowchart from collected events
  function refresh() {
    progressData = parseProgressFromEvents(events);
    updateFlowchart(containerId, progressData, { title: 'Geography Crawl Progress' });
  }
  
  // Connect to SSE if provided
  if (sseSource) {
    sseSource.addEventListener('milestone', (e) => {
      try {
        const data = JSON.parse(e.data);
        events.push({ type: 'milestone', data });
        refresh();
      } catch (err) {
        console.warn('[GeographyFlowchart] Failed to parse milestone:', err);
      }
    });
    
    sseSource.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        events.push({ type: 'progress', data });
        refresh();
      } catch (err) {
        console.warn('[GeographyFlowchart] Failed to parse progress:', err);
      }
    });
    
    sseSource.addEventListener('problem', (e) => {
      try {
        const data = JSON.parse(e.data);
        events.push({ type: 'problem', data });
        refresh();
      } catch (err) {
        console.warn('[GeographyFlowchart] Failed to parse problem:', err);
      }
    });
    
    // Periodic refresh for smooth progress updates
    updateInterval = setInterval(refresh, 1000);
  }
  
  // Return control interface
  return {
    refresh,
    destroy() {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
      container.innerHTML = '';
    },
    getProgressData() {
      return progressData;
    },
    getEvents() {
      return events;
    }
  };
}
