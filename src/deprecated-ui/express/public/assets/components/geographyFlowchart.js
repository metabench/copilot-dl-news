import {
  __commonJS,
  __toESM
} from "../chunks/chunk-QU4DACYI.js";

// src/ui/shared/geographyFlowchart.js
var require_geographyFlowchart = __commonJS({
  "src/ui/shared/geographyFlowchart.js"(exports, module) {
    "use strict";
    var isBrowser = typeof document !== "undefined";
    var GEOGRAPHY_STAGES = [
      {
        id: "discovery",
        label: "Discovery",
        description: "Query Wikidata for all countries",
        icon: "\u{1F50D}",
        estimatedDuration: "5-10s"
      },
      {
        id: "countries",
        label: "Countries",
        description: "Fetch detailed data for ~195 countries",
        icon: "\u{1F30D}",
        estimatedDuration: "30-60s"
      },
      {
        id: "regions",
        label: "Regions",
        description: "Fetch regions for each country",
        icon: "\u{1F5FA}\uFE0F",
        estimatedDuration: "2-5min"
      },
      {
        id: "boundaries",
        label: "Boundaries",
        description: "Fetch OSM boundary data",
        icon: "\u{1F4CD}",
        estimatedDuration: "3-8min"
      },
      {
        id: "completion",
        label: "Completion",
        description: "Validation and summary",
        icon: "\u2705",
        estimatedDuration: "5-10s"
      }
    ];
    var COLORS = {
      pending: {
        fill: "#f3f4f6",
        stroke: "#d1d5db",
        text: "#6b7280"
      },
      active: {
        fill: "#dbeafe",
        stroke: "#3b82f6",
        text: "#1e40af"
      },
      complete: {
        fill: "#d1fae5",
        stroke: "#10b981",
        text: "#065f46"
      },
      error: {
        fill: "#fee2e2",
        stroke: "#ef4444",
        text: "#991b1b"
      },
      connection: "#9ca3af"
    };
    function generateStageBox(stage, state, x, y, width, height, progress = null) {
      const colors = COLORS[state] || COLORS.pending;
      const rx = 8;
      let progressBar = "";
      if (state === "active" && progress !== null && typeof progress === "object") {
        const { current = 0, total = 0 } = progress;
        const percent = total > 0 ? Math.round(current / total * 100) : 0;
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
      ${state !== "complete" ? `
      <text x="${x + width / 2}" y="${y + 95}" 
            font-family="system-ui, sans-serif" font-size="10" 
            fill="${colors.text}" text-anchor="middle" opacity="0.6">
        Est. ${stage.estimatedDuration}
      </text>` : ""}
      
      ${progressBar}
    </g>
  `;
    }
    function generateConnection(x1, y1, x2, y2, state = "pending") {
      const color = state === "complete" ? COLORS.complete.stroke : COLORS.connection;
      const strokeWidth = state === "complete" ? 3 : 2;
      const opacity = state === "complete" ? 1 : 0.5;
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
    function generateFlowchart2(progressData = {}, options = {}) {
      const {
        width = 1e3,
        stageWidth = 180,
        stageHeight = 140,
        stageSpacing = 40,
        title = "Geography Crawl Progress"
      } = options;
      const {
        currentStage = null,
        stages = {},
        completedStages = [],
        errors = []
      } = progressData;
      const totalStages = GEOGRAPHY_STAGES.length;
      const flowWidth = stageWidth * totalStages + stageSpacing * (totalStages - 1);
      const flowHeight = stageHeight + 100;
      const startX = (width - flowWidth) / 2;
      const stageY = 60;
      let svgContent = "";
      let connections = "";
      for (let i = 0; i < GEOGRAPHY_STAGES.length; i++) {
        const stage = GEOGRAPHY_STAGES[i];
        const x = startX + i * (stageWidth + stageSpacing);
        let state = "pending";
        if (completedStages.includes(stage.id)) {
          state = "complete";
        } else if (currentStage === stage.id) {
          state = "active";
        } else if (errors.find((e) => e.stage === stage.id)) {
          state = "error";
        }
        const progress = state === "active" ? stages[stage.id] : null;
        svgContent += generateStageBox(stage, state, x, stageY, stageWidth, stageHeight, progress);
        if (i < GEOGRAPHY_STAGES.length - 1) {
          const connectionState = completedStages.includes(stage.id) ? "complete" : "pending";
          const x1 = x + stageWidth;
          const y1 = stageY + stageHeight / 2;
          const x2 = x + stageWidth + stageSpacing;
          const y2 = stageY + stageHeight / 2;
          connections += generateConnection(x1, y1, x2, y2, connectionState);
        }
      }
      const titleSvg = `
    <text x="${width / 2}" y="30" 
          font-family="system-ui, sans-serif" font-size="20" font-weight="700"
          fill="#111827" text-anchor="middle">
      ${title}
    </text>
  `;
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
    function parseProgressFromEvents2(events = []) {
      const progressData = {
        currentStage: null,
        stages: {},
        completedStages: [],
        errors: []
      };
      for (const event of events) {
        if (event.type === "milestone" && event.data) {
          const kind = event.data.kind || "";
          if (kind.includes("discovery") || kind.includes("countries:start")) {
            if (!progressData.completedStages.includes("discovery")) {
              progressData.completedStages.push("discovery");
            }
            progressData.currentStage = "countries";
          } else if (kind.includes("countries:complete")) {
            if (!progressData.completedStages.includes("countries")) {
              progressData.completedStages.push("countries");
            }
            progressData.currentStage = "regions";
          } else if (kind.includes("regions:complete")) {
            if (!progressData.completedStages.includes("regions")) {
              progressData.completedStages.push("regions");
            }
            progressData.currentStage = "cities";
          } else if (kind.includes("cities:complete")) {
            if (!progressData.completedStages.includes("cities")) {
              progressData.completedStages.push("cities");
            }
            progressData.currentStage = "boundaries";
          } else if (kind.includes("boundaries:complete")) {
            if (!progressData.completedStages.includes("boundaries")) {
              progressData.completedStages.push("boundaries");
            }
            progressData.currentStage = "completion";
          } else if (kind.includes("crawl-complete") || kind.includes("telemetry-completion")) {
            if (!progressData.completedStages.includes("completion")) {
              progressData.completedStages.push("completion");
            }
            progressData.currentStage = null;
          }
        }
        if (event.type === "progress" && event.data) {
          const stageId = progressData.currentStage;
          if (stageId && event.data.current !== void 0 && event.data.totalItems !== void 0) {
            progressData.stages[stageId] = {
              current: event.data.current || 0,
              total: event.data.totalItems || 0
            };
          }
        }
        if (event.type === "problem" && event.data) {
          progressData.errors.push({
            stage: progressData.currentStage,
            kind: event.data.kind,
            message: event.data.message
          });
        }
      }
      return progressData;
    }
    function createSvgElement(svgMarkup) {
      if (!isBrowser) {
        throw new Error("createSvgElement is only available in browser");
      }
      const div = document.createElement("div");
      div.innerHTML = svgMarkup.trim();
      return div.firstElementChild;
    }
    function updateFlowchart2(containerId, progressData, options = {}) {
      if (!isBrowser) {
        throw new Error("updateFlowchart is only available in browser");
      }
      const container = document.getElementById(containerId);
      if (!container) {
        console.warn(`Container #${containerId} not found`);
        return;
      }
      const svgMarkup = generateFlowchart2(progressData, options);
      const svgElement = createSvgElement(svgMarkup);
      const existing = container.querySelector(".geography-flowchart");
      if (existing) {
        existing.replaceWith(svgElement);
      } else {
        container.appendChild(svgElement);
      }
    }
    if (typeof module !== "undefined" && module.exports) {
      module.exports = {
        generateFlowchart: generateFlowchart2,
        parseProgressFromEvents: parseProgressFromEvents2,
        createSvgElement: isBrowser ? createSvgElement : null,
        updateFlowchart: isBrowser ? updateFlowchart2 : null,
        GEOGRAPHY_STAGES,
        COLORS
      };
    } else if (typeof window !== "undefined") {
      window.GeographyFlowchart = {
        generateFlowchart: generateFlowchart2,
        parseProgressFromEvents: parseProgressFromEvents2,
        createSvgElement,
        updateFlowchart: updateFlowchart2,
        GEOGRAPHY_STAGES,
        COLORS
      };
    }
  }
});

// src/ui/public/components/geographyFlowchart.js
var import_geographyFlowchart = __toESM(require_geographyFlowchart());
function createGeographyFlowchart({ containerId, sseSource = null }) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`[GeographyFlowchart] Container #${containerId} not found`);
    return null;
  }
  let events = [];
  let progressData = { currentStage: null, stages: {}, completedStages: [], errors: [] };
  let updateInterval = null;
  const initialSvg = (0, import_geographyFlowchart.generateFlowchart)(progressData, { title: "Geography Crawl Progress" });
  container.innerHTML = initialSvg;
  function refresh() {
    progressData = (0, import_geographyFlowchart.parseProgressFromEvents)(events);
    (0, import_geographyFlowchart.updateFlowchart)(containerId, progressData, { title: "Geography Crawl Progress" });
  }
  if (sseSource) {
    sseSource.addEventListener("milestone", (e) => {
      try {
        const data = JSON.parse(e.data);
        events.push({ type: "milestone", data });
        refresh();
      } catch (err) {
        console.warn("[GeographyFlowchart] Failed to parse milestone:", err);
      }
    });
    sseSource.addEventListener("progress", (e) => {
      try {
        const data = JSON.parse(e.data);
        events.push({ type: "progress", data });
        refresh();
      } catch (err) {
        console.warn("[GeographyFlowchart] Failed to parse progress:", err);
      }
    });
    sseSource.addEventListener("problem", (e) => {
      try {
        const data = JSON.parse(e.data);
        events.push({ type: "problem", data });
        refresh();
      } catch (err) {
        console.warn("[GeographyFlowchart] Failed to parse problem:", err);
      }
    });
    updateInterval = setInterval(refresh, 1e3);
  }
  return {
    refresh,
    destroy() {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
      container.innerHTML = "";
    },
    getProgressData() {
      return progressData;
    },
    getEvents() {
      return events;
    }
  };
}
export {
  createGeographyFlowchart
};
