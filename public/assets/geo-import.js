(() => {
  // src/ui/client/geoImport/index.js
  (function() {
    "use strict";
    const dashboard = document.querySelector(".geo-import-dashboard");
    const progressRing = document.querySelector(".progress-ring-circle");
    const progressText = document.querySelector(".progress-ring-text");
    const progressStat = document.querySelector(".progress-stat");
    const progressPhase = document.querySelector(".progress-phase");
    const logBody = document.querySelector(".log-body");
    const startBtn = document.querySelector('[data-action="start-import"]');
    const pauseBtn = document.querySelector('[data-action="pause-import"]');
    const cancelBtn = document.querySelector('[data-action="cancel-import"]');
    const statusEl = document.createElement("div");
    statusEl.className = "connection-status disconnected";
    statusEl.textContent = "\u26A1 Connecting...";
    document.body.appendChild(statusEl);
    let currentState = null;
    let eventSource = null;
    let metricsHistory = [];
    let stageTimes = {};
    let lastProgressUpdate = Date.now();
    let recordsPerSecond = 0;
    const toastContainer = document.createElement("div");
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);
    function connectSSE() {
      eventSource = new EventSource("/api/geo-import/events");
      eventSource.onopen = () => {
        statusEl.className = "connection-status connected";
        statusEl.textContent = "\u{1F7E2} Connected";
        console.log("[GeoImport] SSE connected");
      };
      eventSource.onerror = (err) => {
        statusEl.className = "connection-status disconnected";
        statusEl.textContent = "\u{1F534} Disconnected";
        console.error("[GeoImport] SSE error:", err);
        setTimeout(connectSSE, 3e3);
      };
      eventSource.addEventListener("init", (e) => {
        const data = JSON.parse(e.data);
        currentState = data.state;
        updateUI(currentState);
        console.log("[GeoImport] Initial state:", currentState);
      });
      eventSource.addEventListener("progress", (e) => {
        const data = JSON.parse(e.data);
        currentState = data.state;
        updateProgress(currentState);
      });
      eventSource.addEventListener("stage-change", (e) => {
        const data = JSON.parse(e.data);
        currentState = data.state;
        updateUI(currentState);
      });
      eventSource.addEventListener("log", (e) => {
        const data = JSON.parse(e.data);
        appendLog(data.entry);
      });
      eventSource.addEventListener("state-change", (e) => {
        const data = JSON.parse(e.data);
        currentState = data.state;
        updateUI(currentState);
      });
    }
    function updateUI(state) {
      updateProgress(state);
      updateStagesStepper(state);
      updateButtons(state);
      updateSourceCards(state);
    }
    function updateStagesStepper(state) {
      var _a, _b;
      const stepper = document.querySelector(".stages-stepper");
      if (!stepper) return;
      const currentStageId = state.status || ((_a = state.stage) == null ? void 0 : _a.id) || "idle";
      const prevStageId = stepper.getAttribute("data-current-stage");
      stepper.setAttribute("data-current-stage", currentStageId);
      const now = Date.now();
      if (currentStageId !== prevStageId) {
        if (prevStageId && ((_b = stageTimes[prevStageId]) == null ? void 0 : _b.start)) {
          stageTimes[prevStageId].end = now;
          stageTimes[prevStageId].duration = now - stageTimes[prevStageId].start;
        }
        stageTimes[currentStageId] = { start: now };
        if (currentStageId !== "idle") {
          showToast(getStageEmoji(currentStageId) + " " + getStageLabel(currentStageId), "info");
        }
        if (currentStageId === "complete") {
          showToast("\u{1F389} Import completed successfully!", "success");
          playCompletionSound();
        }
      }
      const stages = stepper.querySelectorAll(".stage-item");
      const stageIds = ["idle", "validating", "counting", "preparing", "importing", "indexing", "verifying", "complete"];
      const currentIndex = stageIds.indexOf(currentStageId);
      stages.forEach((stageEl, index) => {
        const stageId = stageIds[index];
        stageEl.classList.remove("stage-completed", "stage-current", "stage-pending");
        const connector = stageEl.querySelector(".stage-connector");
        if (connector) {
          connector.classList.remove("connector-completed");
        }
        if (index < currentIndex) {
          stageEl.classList.add("stage-completed");
          if (connector) connector.classList.add("connector-completed");
          addStageDuration(stageEl, stageId);
        } else if (index === currentIndex) {
          stageEl.classList.add("stage-current");
          updateLiveStageDuration(stageEl, stageId);
        } else {
          stageEl.classList.add("stage-pending");
        }
      });
    }
    function addStageDuration(stageEl, stageId) {
      let durationEl = stageEl.querySelector(".stage-duration");
      if (!durationEl) {
        durationEl = document.createElement("div");
        durationEl.className = "stage-duration";
        stageEl.appendChild(durationEl);
      }
      const timing = stageTimes[stageId];
      if (timing == null ? void 0 : timing.duration) {
        durationEl.textContent = formatDuration(Math.floor(timing.duration / 1e3));
      }
    }
    function updateLiveStageDuration(stageEl, stageId) {
      let durationEl = stageEl.querySelector(".stage-duration");
      if (!durationEl) {
        durationEl = document.createElement("div");
        durationEl.className = "stage-duration";
        stageEl.appendChild(durationEl);
      }
      const timing = stageTimes[stageId];
      if (timing == null ? void 0 : timing.start) {
        const elapsed = Math.floor((Date.now() - timing.start) / 1e3);
        durationEl.textContent = formatDuration(elapsed) + "...";
      }
    }
    function getStageEmoji(stageId) {
      const emojis = {
        "idle": "\u23F8\uFE0F",
        "validating": "\u{1F50D}",
        "counting": "\u{1F4CA}",
        "preparing": "\u2699\uFE0F",
        "importing": "\u{1F4BE}",
        "indexing": "\u{1F5C2}\uFE0F",
        "verifying": "\u2705",
        "complete": "\u{1F389}"
      };
      return emojis[stageId] || "\u2022";
    }
    function getStageLabel(stageId) {
      const labels = {
        "idle": "Ready",
        "validating": "Validating files...",
        "counting": "Counting records...",
        "preparing": "Preparing database...",
        "importing": "Importing records...",
        "indexing": "Building indexes...",
        "verifying": "Verifying data...",
        "complete": "Complete"
      };
      return labels[stageId] || stageId;
    }
    function updateProgress(state) {
      const { progress, stage } = state;
      const percent = progress.percent || 0;
      const now = Date.now();
      if (progress.current > 0) {
        const timeDiff = (now - lastProgressUpdate) / 1e3;
        if (timeDiff > 0 && metricsHistory.length > 0) {
          const lastProgress = metricsHistory[metricsHistory.length - 1];
          const recordsDiff = progress.current - lastProgress.current;
          if (recordsDiff > 0) {
            recordsPerSecond = Math.round(recordsDiff / timeDiff);
          }
        }
        metricsHistory.push({ current: progress.current, time: now });
        if (metricsHistory.length > 10) metricsHistory.shift();
        lastProgressUpdate = now;
      }
      const remaining = (progress.total || 0) - (progress.current || 0);
      const etaSeconds = recordsPerSecond > 0 ? Math.ceil(remaining / recordsPerSecond) : 0;
      const etaFormatted = formatDuration(etaSeconds);
      if (progressRing) {
        const radius = progressRing.r.baseVal.value;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - percent / 100 * circumference;
        progressRing.style.strokeDashoffset = offset;
      }
      if (progressText) {
        progressText.textContent = percent + "%";
      }
      if (progressStat) {
        progressStat.innerHTML = '<span class="stat-value counting">' + formatNumber(progress.current) + '</span> / <span class="stat-total">' + formatNumber(progress.total) + "</span> records";
      }
      if (progressPhase && stage) {
        progressPhase.textContent = stage.emoji + " " + stage.description;
      }
      updateMetrics(etaFormatted, recordsPerSecond, state.elapsed);
    }
    function updateMetrics(eta, speed, elapsed) {
      let metricsEl = document.querySelector(".progress-metrics");
      if (!metricsEl) {
        metricsEl = document.createElement("div");
        metricsEl.className = "progress-metrics";
        metricsEl.innerHTML = '<div class="metric-item"><span class="metric-value speed" data-metric="speed">0</span><span class="metric-label">Records/sec</span></div><div class="metric-item"><span class="metric-value eta" data-metric="eta">--:--</span><span class="metric-label">ETA</span></div><div class="metric-item"><span class="metric-value" data-metric="elapsed">00:00</span><span class="metric-label">Elapsed</span></div>';
        const progressStats = document.querySelector(".progress-stats");
        if (progressStats) progressStats.appendChild(metricsEl);
      }
      const speedEl = metricsEl.querySelector('[data-metric="speed"]');
      const etaEl = metricsEl.querySelector('[data-metric="eta"]');
      const elapsedEl = metricsEl.querySelector('[data-metric="elapsed"]');
      if (speedEl) speedEl.textContent = formatNumber(speed);
      if (etaEl) etaEl.textContent = eta || "--:--";
      if (elapsedEl) elapsedEl.textContent = formatDuration(Math.floor((elapsed || 0) / 1e3));
    }
    function formatDuration(totalSeconds) {
      if (!totalSeconds || totalSeconds < 0) return "--:--";
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor(totalSeconds % 3600 / 60);
      const seconds = totalSeconds % 60;
      if (hours > 0) {
        return hours + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
      }
      return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
    }
    function updateButtons(state) {
      const { status } = state;
      const isRunning = ["validating", "counting", "preparing", "importing", "indexing", "verifying"].includes(status);
      const isPaused = status === "paused";
      if (startBtn) {
        startBtn.disabled = isRunning || isPaused;
        startBtn.textContent = isRunning ? "\u{1F504} Running..." : "\u{1F680} Start Import";
      }
      if (pauseBtn) {
        pauseBtn.disabled = !isRunning && !isPaused;
        pauseBtn.textContent = isPaused ? "\u25B6\uFE0F Resume" : "\u23F8\uFE0F Pause";
      }
      if (cancelBtn) {
        cancelBtn.disabled = !isRunning && !isPaused;
      }
    }
    function updateSourceCards(state) {
      const geonamesCard = document.querySelector(".source-geonames");
      if (geonamesCard && state.sources.geonames) {
        const badge = geonamesCard.querySelector(".status-badge");
        if (badge) {
          const status = state.sources.geonames.status;
          badge.className = "status-badge status-" + status;
          badge.textContent = getStatusLabel(status);
        }
        const statsGrid = geonamesCard.querySelector(".stats-grid");
        if (statsGrid && state.stats) {
          const statItems = statsGrid.querySelectorAll(".stat-item");
          if (statItems[1]) {
            statItems[1].querySelector(".stat-value").textContent = formatNumber(state.stats.processed);
          }
          if (statItems[2]) {
            statItems[2].querySelector(".stat-value").textContent = formatNumber(state.stats.inserted);
          }
        }
      }
    }
    function appendLog(entry) {
      if (!logBody) return;
      const row = document.createElement("div");
      row.className = "log-entry log-" + (entry.level || "info");
      const timestamp = document.createElement("span");
      timestamp.className = "log-timestamp";
      timestamp.textContent = entry.time;
      row.appendChild(timestamp);
      const message = document.createElement("span");
      message.className = "log-message";
      message.textContent = entry.message;
      row.appendChild(message);
      logBody.appendChild(row);
      logBody.scrollTop = logBody.scrollHeight;
    }
    function handleStart() {
      fetch("/api/geo-import/preflight").then((r) => r.json()).then((preflight) => {
        if (!preflight.ready) {
          showMissingFileAlert(preflight);
          return;
        }
        return fetch("/api/geo-import/start", { method: "POST" }).then((r) => r.json()).then((data) => {
          if (data.error) {
            if (data.instructions) {
              showMissingFileAlert(data);
            } else {
              addLogEntry({ time: (/* @__PURE__ */ new Date()).toLocaleTimeString(), level: "error", message: data.error });
            }
          } else {
            console.log("[GeoImport] Start:", data);
          }
        });
      }).catch((err) => {
        console.error("[GeoImport] Start error:", err);
        addLogEntry({ time: (/* @__PURE__ */ new Date()).toLocaleTimeString(), level: "error", message: "Failed to start import: " + err.message });
      });
    }
    function showMissingFileAlert(info) {
      const instructions = info.instructions || [
        "1. Download cities15000.zip from " + info.downloadUrl,
        "2. Extract cities15000.txt to data/geonames/",
        '3. Click "Start Import" again'
      ];
      addLogEntry({ time: (/* @__PURE__ */ new Date()).toLocaleTimeString(), level: "warning", message: "\u26A0\uFE0F GeoNames data file not found" });
      instructions.forEach((step) => {
        addLogEntry({ time: (/* @__PURE__ */ new Date()).toLocaleTimeString(), level: "info", message: step });
      });
      const alertMsg = "GeoNames data file not found!\\n\\n" + instructions.join("\\n") + "\\n\\nDownload URL: " + info.downloadUrl;
      if (confirm(alertMsg + "\\n\\nOpen download page?")) {
        window.open(info.downloadUrl, "_blank");
      }
    }
    function handlePause() {
      const isPaused = (currentState == null ? void 0 : currentState.status) === "paused";
      const endpoint = isPaused ? "/api/geo-import/resume" : "/api/geo-import/pause";
      fetch(endpoint, { method: "POST" }).then((r) => r.json()).then((data) => console.log("[GeoImport] Pause/Resume:", data)).catch((err) => console.error("[GeoImport] Pause/Resume error:", err));
    }
    function handleCancel() {
      if (confirm("Cancel the import?")) {
        fetch("/api/geo-import/cancel", { method: "POST" }).then((r) => r.json()).then((data) => console.log("[GeoImport] Cancel:", data)).catch((err) => console.error("[GeoImport] Cancel error:", err));
      }
    }
    function formatNumber(n) {
      return typeof n === "number" ? n.toLocaleString() : n || "0";
    }
    function getStatusLabel(status) {
      const labels = {
        "idle": "\u23F8\uFE0F Idle",
        "ready": "\u2705 Ready",
        "running": "\u{1F504} Running",
        "validating": "\u{1F50D} Validating",
        "importing": "\u{1F4BE} Importing",
        "complete": "\u2705 Complete",
        "error": "\u274C Error",
        "pending": "\u23F3 Pending"
      };
      return labels[status] || status;
    }
    function showToast(message, type = "info") {
      const toast = document.createElement("div");
      toast.className = "toast " + type;
      toast.textContent = message;
      toastContainer.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100px)";
        setTimeout(() => toast.remove(), 300);
      }, 4e3);
    }
    function playCompletionSound() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.frequency.value = 523.25;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.5);
        setTimeout(() => {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.frequency.value = 659.25;
          osc2.type = "sine";
          gain2.gain.setValueAtTime(0.3, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
          osc2.start(ctx.currentTime);
          osc2.stop(ctx.currentTime + 0.5);
        }, 150);
      } catch (e) {
        console.log("[GeoImport] Audio notification not available");
      }
    }
    function addLogEntry(entry) {
      appendLog(entry);
    }
    if (startBtn) startBtn.addEventListener("click", handleStart);
    if (pauseBtn) pauseBtn.addEventListener("click", handlePause);
    if (cancelBtn) cancelBtn.addEventListener("click", handleCancel);
    connectSSE();
    const dbSelector = document.querySelector(".database-selector");
    function initDatabaseSelector() {
      if (!dbSelector) return;
      dbSelector.addEventListener("click", function(e) {
        const item = e.target.closest(".db-item");
        if (item) {
          const dbPath = item.getAttribute("data-db-path");
          if (dbPath === "__new__") {
            toggleNewDbInput(true);
          } else {
            selectDatabase(dbPath);
          }
          return;
        }
        const action = e.target.getAttribute("data-action");
        if (action === "select-default") {
          selectDefaultDatabase();
        } else if (action === "refresh-list") {
          refreshDatabaseList();
        } else if (action === "create-new-db") {
          createNewDatabase();
        }
      });
      const newDbInput = dbSelector.querySelector('[data-input="new-db-name"]');
      if (newDbInput) {
        newDbInput.addEventListener("keypress", function(e) {
          if (e.key === "Enter") {
            createNewDatabase();
          }
        });
      }
    }
    function selectDatabase(dbPath) {
      showToast("Switching to " + dbPath.split("/").pop() + "...", "info");
      fetch("/api/databases/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dbPath })
      }).then((r) => r.json()).then((data) => {
        if (data.error) {
          showToast("Error: " + data.error, "error");
          return;
        }
        showToast("Switched to " + data.path.split(/[\\\\\\/]/).pop(), "success");
        updateSelectedDatabase(dbPath, data.stats);
        setTimeout(() => location.reload(), 500);
      }).catch((err) => {
        showToast("Failed to switch: " + err.message, "error");
      });
    }
    function selectDefaultDatabase() {
      const defaultItem = dbSelector.querySelector(".db-item.default");
      if (defaultItem) {
        const dbPath = defaultItem.getAttribute("data-db-path");
        selectDatabase(dbPath);
      }
    }
    function refreshDatabaseList() {
      showToast("Refreshing database list...", "info");
      fetch("/api/databases").then((r) => r.json()).then((data) => {
        updateDatabaseList(data.databases, data.current);
        showToast("Found " + data.databases.length + " databases", "success");
      }).catch((err) => {
        showToast("Failed to refresh: " + err.message, "error");
      });
    }
    function createNewDatabase() {
      const input = dbSelector.querySelector('[data-input="new-db-name"]');
      if (!input) return;
      const name = input.value.trim();
      if (!name) {
        showToast("Please enter a database name", "warning");
        input.focus();
        return;
      }
      showToast("Creating " + name + "...", "info");
      fetch("/api/databases/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      }).then((r) => r.json()).then((data) => {
        if (data.error) {
          showToast("Error: " + data.error, "error");
          return;
        }
        showToast("Created " + data.name, "success");
        input.value = "";
        toggleNewDbInput(false);
        refreshDatabaseList();
        setTimeout(() => selectDatabase(data.path), 500);
      }).catch((err) => {
        showToast("Failed to create: " + err.message, "error");
      });
    }
    function toggleNewDbInput(visible) {
      const inputGroup = dbSelector.querySelector(".db-new-input-group");
      const newItem = dbSelector.querySelector(".db-item.new-db");
      if (inputGroup) {
        inputGroup.setAttribute("data-visible", visible ? "true" : "false");
      }
      if (newItem) {
        newItem.classList.toggle("selected", visible);
      }
      if (visible) {
        const input = inputGroup == null ? void 0 : inputGroup.querySelector("input");
        if (input) input.focus();
      }
    }
    function updateSelectedDatabase(dbPath, stats) {
      dbSelector.querySelectorAll(".db-item").forEach((item) => {
        const isSelected = item.getAttribute("data-db-path") === dbPath;
        item.classList.toggle("selected", isSelected);
        const check = item.querySelector(".db-check");
        if (check) check.textContent = isSelected ? "\u2713" : "";
      });
      const infoPanel = dbSelector.querySelector('[data-panel="selected-info"]');
      if (infoPanel && stats) {
        infoPanel.innerHTML = '<div class="info-title">\u{1F4CA} ' + dbPath.split(/[\\\\\\/]/).pop() + '</div><div class="info-stats-grid"><div class="info-stat"><span class="stat-emoji">\u{1F4CD}</span><span class="stat-value">' + formatNumber(stats.places) + '</span><span class="stat-label">Places</span></div><div class="info-stat"><span class="stat-emoji">\u{1F3F7}\uFE0F</span><span class="stat-value">' + formatNumber(stats.names) + '</span><span class="stat-label">Names</span></div><div class="info-stat"><span class="stat-emoji">\u{1F4BE}</span><span class="stat-value">' + formatFileSize(stats.size) + '</span><span class="stat-label">Size</span></div></div><div class="info-path"><span class="path-label">Path: </span><code class="path-value">' + dbPath + "</code></div>";
      }
      const coverageBefore = document.querySelector(".coverage-before");
      if (coverageBefore && stats) {
        const placesBefore = coverageBefore.querySelector(".coverage-item:first-child .coverage-value");
        const namesBefore = coverageBefore.querySelector(".coverage-item:nth-child(2) .coverage-value");
        if (placesBefore) placesBefore.textContent = formatNumber(stats.places);
        if (namesBefore) namesBefore.textContent = formatNumber(stats.names);
      }
    }
    function updateDatabaseList(databases, currentPath) {
      const list = dbSelector.querySelector('[data-list="databases"]');
      if (!list) return;
      list.querySelectorAll(".db-item").forEach((item) => item.remove());
      databases.forEach((db) => {
        const item = document.createElement("div");
        item.className = "db-item" + (db.path === currentPath ? " selected" : "") + (db.isDefault ? " default" : "");
        item.setAttribute("data-db-path", db.path);
        item.innerHTML = '<span class="db-icon">\u{1F5C4}\uFE0F</span><div class="db-info"><div class="db-name-row"><span class="db-name">' + db.name + "</span>" + (db.isDefault ? '<span class="db-badge default-badge">\u2B50 Default</span>' : "") + '</div><div class="db-stats-row"><span class="db-stat">\u{1F4CD} ' + formatNumber(db.places) + ' places</span><span class="db-stat">\u{1F3F7}\uFE0F ' + formatNumber(db.names) + ' names</span><span class="db-stat">\u{1F4BE} ' + formatFileSize(db.size) + '</span></div></div><span class="db-check">' + (db.path === currentPath ? "\u2713" : "") + "</span>";
        list.appendChild(item);
      });
    }
    function formatFileSize(bytes) {
      if (!bytes) return "0 B";
      const units = ["B", "KB", "MB", "GB"];
      let i = 0;
      while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
      }
      return bytes.toFixed(i > 0 ? 1 : 0) + " " + units[i];
    }
    initDatabaseSelector();
    console.log("[GeoImport] Dashboard initialized");
  })();
})();
//# sourceMappingURL=geo-import.js.map
