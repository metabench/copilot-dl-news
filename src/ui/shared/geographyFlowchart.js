/**
 * @fileoverview Isomorphic Geography Crawl Flowchart Generator
 * 
 * Creates SVG flowcharts showing the stages and progress of geography crawls.
 * Works both server-side (SSR) and client-side (browser).
 * 
 * **Architecture**:
 * - Pure function approach (no DOM dependencies)
 * - Returns SVG as string for server-side or element creation for client
 * - Progressive enhancement: works without JS, enhanced with JS
 * - Responsive design with viewBox
 * 
 * **Stages Visualized**:
 * 1. Discovery - Find all countries from Wikidata
 * 2. Countries - Fetch detailed country data
 * 3. Regions - Fetch regions for each country
 * 4. Boundaries - Fetch OSM boundaries for places
 * 5. Completion - Final validation and summary
 * 
 * **Progress States**:
 * - pending: Gray, not started
 * - active: Blue, currently processing
 * - complete: Green, finished
 * - error: Red, failed
 */

'use strict';

// Check if running in browser
const isBrowser = typeof document !== 'undefined';

/**
 * Stage definitions for geography crawl
 */
const GEOGRAPHY_STAGES = [
  {
    id: 'discovery',
    label: 'Discovery',
    description: 'Query Wikidata for all countries',
    icon: '\ud83d\udd0d',
    estimatedDuration: '5-10s'
  },
  {
    id: 'countries',
    label: 'Countries',
    description: 'Fetch detailed data for ~195 countries',
    icon: '\ud83c\udf0d',
    estimatedDuration: '30-60s'
  },
  {
    id: 'regions',
    label: 'Regions',
    description: 'Fetch regions for each country',
    icon: '\ud83d\uddfa\ufe0f',
    estimatedDuration: '2-5min'
  },
  {
    id: 'boundaries',
    label: 'Boundaries',
    description: 'Fetch OSM boundary data',
    icon: '\ud83d\udccd',
    estimatedDuration: '3-8min'
  },
  {
    id: 'completion',
    label: 'Completion',
    description: 'Validation and summary',
    icon: '\u2705',
    estimatedDuration: '5-10s'
  }
];

/**
 * Color scheme for stages
 */
const COLORS = {
  pending: {
    fill: '#f3f4f6',
    stroke: '#d1d5db',
    text: '#6b7280'
  },
  active: {
    fill: '#dbeafe',
    stroke: '#3b82f6',
    text: '#1e40af'
  },
  complete: {
    fill: '#d1fae5',
    stroke: '#10b981',
    text: '#065f46'
  },
  error: {
    fill: '#fee2e2',
    stroke: '#ef4444',
    text: '#991b1b'
  },
  connection: '#9ca3af'
};

/**
 * Generate SVG for a single stage box
 */
function generateStageBox(stage, state, x, y, width, height, progress = null) {
  const colors = COLORS[state] || COLORS.pending;
  const rx = 8; // Rounded corners
  
  let progressBar = '';
  if (state === 'active' && progress !== null && typeof progress === 'object') {
    const { current = 0, total = 0 } = progress;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const barWidth = (width - 20) * (percent / 100);
    
    progressBar = `
      <!-- Progress bar background -->
      <rect x="${x + 10}" y="${y + height - 25}" width="${width - 20}" height="8" 
            fill="#e5e7eb" rx="4"/>
      <!-- Progress bar fill -->
      <rect x="${x + 10}" y="${y + height - 25}" width="${barWidth}" height="8" 
            fill="${colors.stroke}" rx="4"/>
      <!-- Progress text -->
      <text x="${x + width / 2}" y="${y + height - 12}" 
            font-family="system-ui, sans-serif" font-size="11" 
            fill="${colors.text}" text-anchor="middle">
        ${current} / ${total} (${percent}%)
      </text>
    `;
  }
  
  return `
    <g class="stage-box" data-stage="${stage.id}" data-state="${state}">
      <!-- Box background -->
      <rect x="${x}" y="${y}" width="${width}" height="${height}" 
            fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2" rx="${rx}"/>
      
      <!-- Icon -->
      <text x="${x + width / 2}" y="${y + 35}" 
            font-size="32" text-anchor="middle">${stage.icon}</text>
      
      <!-- Label -->
      <text x="${x + width / 2}" y="${y + 60}" 
            font-family="system-ui, sans-serif" font-size="16" font-weight="600"
            fill="${colors.text}" text-anchor="middle">
        ${stage.label}
      </text>
      
      <!-- Description -->
      <text x="${x + width / 2}" y="${y + 78}" 
            font-family="system-ui, sans-serif" font-size="12" 
            fill="${colors.text}" text-anchor="middle" opacity="0.8">
        ${stage.description}
      </text>
      
      <!-- Duration estimate (for pending/active) -->
      ${state !== 'complete' ? `
      <text x="${x + width / 2}" y="${y + 95}" 
            font-family="system-ui, sans-serif" font-size="10" 
            fill="${colors.text}" text-anchor="middle" opacity="0.6">
        Est. ${stage.estimatedDuration}
      </text>` : ''}
      
      ${progressBar}
    </g>
  `;
}

/**
 * Generate SVG for connection arrow between stages
 */
function generateConnection(x1, y1, x2, y2, state = 'pending') {
  const color = state === 'complete' ? COLORS.complete.stroke : COLORS.connection;
  const strokeWidth = state === 'complete' ? 3 : 2;
  const opacity = state === 'complete' ? 1 : 0.5;
  
  return `
    <g class="connection" data-state="${state}">
      <!-- Arrow line -->
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" 
            stroke="${color}" stroke-width="${strokeWidth}" opacity="${opacity}"/>
      <!-- Arrow head -->
      <polygon points="${x2},${y2} ${x2 - 8},${y2 - 5} ${x2 - 8},${y2 + 5}"
               fill="${color}" opacity="${opacity}"/>
    </g>
  `;
}

/**
 * Generate complete SVG flowchart
 * 
 * @param {Object} progressData - Progress data from crawler
 * @param {Object} options - Rendering options
 * @returns {string} SVG markup
 */
function generateFlowchart(progressData = {}, options = {}) {
  const {
    width = 1000,
    stageWidth = 180,
    stageHeight = 140,
    stageSpacing = 40,
    title = 'Geography Crawl Progress'
  } = options;
  
  // Parse progress data
  const {
    currentStage = null,
    stages = {},
    completedStages = [],
    errors = []
  } = progressData;
  
  // Calculate layout
  const totalStages = GEOGRAPHY_STAGES.length;
  const flowWidth = (stageWidth * totalStages) + (stageSpacing * (totalStages - 1));
  const flowHeight = stageHeight + 100; // Extra space for title
  const startX = (width - flowWidth) / 2;
  const stageY = 60;
  
  // Generate stage boxes
  let svgContent = '';
  let connections = '';
  
  for (let i = 0; i < GEOGRAPHY_STAGES.length; i++) {
    const stage = GEOGRAPHY_STAGES[i];
    const x = startX + (i * (stageWidth + stageSpacing));
    
    // Determine state
    let state = 'pending';
    if (completedStages.includes(stage.id)) {
      state = 'complete';
    } else if (currentStage === stage.id) {
      state = 'active';
    } else if (errors.find(e => e.stage === stage.id)) {
      state = 'error';
    }
    
    // Get progress for active stage
    const progress = state === 'active' ? stages[stage.id] : null;
    
    // Generate box
    svgContent += generateStageBox(stage, state, x, stageY, stageWidth, stageHeight, progress);
    
    // Generate connection to next stage
    if (i < GEOGRAPHY_STAGES.length - 1) {
      const connectionState = completedStages.includes(stage.id) ? 'complete' : 'pending';
      const x1 = x + stageWidth;
      const y1 = stageY + stageHeight / 2;
      const x2 = x + stageWidth + stageSpacing;
      const y2 = stageY + stageHeight / 2;
      
      connections += generateConnection(x1, y1, x2, y2, connectionState);
    }
  }
  
  // Generate title
  const titleSvg = `
    <text x="${width / 2}" y="30" 
          font-family="system-ui, sans-serif" font-size="20" font-weight="700"
          fill="#111827" text-anchor="middle">
      ${title}
    </text>
  `;
  
  // Assemble SVG
  const svg = `
    <svg viewBox="0 0 ${width} ${flowHeight}" 
         xmlns="http://www.w3.org/2000/svg"
         class="geography-flowchart"
         role="img"
         aria-label="${title}">
      <style>
        .geography-flowchart {
          max-width: 100%;
          height: auto;
        }
        .stage-box {
          transition: transform 0.2s ease;
        }
        .stage-box:hover {
          transform: scale(1.05);
        }
        @media (prefers-color-scheme: dark) {
          .geography-flowchart text {
            fill: #f3f4f6;
          }
        }
      </style>
      ${titleSvg}
      ${connections}
      ${svgContent}
    </svg>
  `;
  
  return svg;
}

/**
 * Parse SSE events into progress data structure
 */
function parseProgressFromEvents(events = []) {
  const progressData = {
    currentStage: null,
    stages: {},
    completedStages: [],
    errors: []
  };
  
  for (const event of events) {
    // Handle milestone events
    if (event.type === 'milestone' && event.data) {
      const kind = event.data.kind || '';
      
      // Map milestone kinds to stage IDs
      if (kind.includes('discovery') || kind.includes('countries:start')) {
        if (!progressData.completedStages.includes('discovery')) {
          progressData.completedStages.push('discovery');
        }
        progressData.currentStage = 'countries';
      } else if (kind.includes('countries:complete')) {
        if (!progressData.completedStages.includes('countries')) {
          progressData.completedStages.push('countries');
        }
        progressData.currentStage = 'regions';
      } else if (kind.includes('regions:complete')) {
        if (!progressData.completedStages.includes('regions')) {
          progressData.completedStages.push('regions');
        }
        progressData.currentStage = 'cities';
      } else if (kind.includes('cities:complete')) {
        if (!progressData.completedStages.includes('cities')) {
          progressData.completedStages.push('cities');
        }
        progressData.currentStage = 'boundaries';
      } else if (kind.includes('boundaries:complete')) {
        if (!progressData.completedStages.includes('boundaries')) {
          progressData.completedStages.push('boundaries');
        }
        progressData.currentStage = 'completion';
      } else if (kind.includes('crawl-complete') || kind.includes('telemetry-completion')) {
        if (!progressData.completedStages.includes('completion')) {
          progressData.completedStages.push('completion');
        }
        progressData.currentStage = null;
      }
    }
    
    // Handle progress events
    if (event.type === 'progress' && event.data) {
      const stageId = progressData.currentStage;
      if (stageId && event.data.current !== undefined && event.data.totalItems !== undefined) {
        progressData.stages[stageId] = {
          current: event.data.current || 0,
          total: event.data.totalItems || 0
        };
      }
    }
    
    // Handle problem events
    if (event.type === 'problem' && event.data) {
      progressData.errors.push({
        stage: progressData.currentStage,
        kind: event.data.kind,
        message: event.data.message
      });
    }
  }
  
  return progressData;
}

/**
 * Client-side: Create SVG element from markup
 * Only available in browser
 */
function createSvgElement(svgMarkup) {
  if (!isBrowser) {
    throw new Error('createSvgElement is only available in browser');
  }
  
  const div = document.createElement('div');
  div.innerHTML = svgMarkup.trim();
  return div.firstElementChild;
}

/**
 * Client-side: Update existing flowchart with new progress
 * Only available in browser
 */
function updateFlowchart(containerId, progressData, options = {}) {
  if (!isBrowser) {
    throw new Error('updateFlowchart is only available in browser');
  }
  
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`Container #${containerId} not found`);
    return;
  }
  
  const svgMarkup = generateFlowchart(progressData, options);
  const svgElement = createSvgElement(svgMarkup);
  
  // Replace existing SVG or append
  const existing = container.querySelector('.geography-flowchart');
  if (existing) {
    existing.replaceWith(svgElement);
  } else {
    container.appendChild(svgElement);
  }
}

// Export appropriate interface based on environment
if (typeof module !== 'undefined' && module.exports) {
  // CommonJS (Node.js)
  module.exports = {
    generateFlowchart,
    parseProgressFromEvents,
    createSvgElement: isBrowser ? createSvgElement : null,
    updateFlowchart: isBrowser ? updateFlowchart : null,
    GEOGRAPHY_STAGES,
    COLORS
  };
} else if (typeof window !== 'undefined') {
  // Browser global
  window.GeographyFlowchart = {
    generateFlowchart,
    parseProgressFromEvents,
    createSvgElement,
    updateFlowchart,
    GEOGRAPHY_STAGES,
    COLORS
  };
}
