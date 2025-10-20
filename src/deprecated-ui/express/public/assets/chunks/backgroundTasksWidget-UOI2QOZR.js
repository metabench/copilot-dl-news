import {
  require_lang
} from "./chunk-BOXXWBMA.js";
import {
  __toESM
} from "./chunk-QU4DACYI.js";

// src/ui/public/index/backgroundTasksWidget.js
var import_lang_tools = __toESM(require_lang());
function createBackgroundTasksWidget({ widgetSection, tasksList, eventSource } = {}) {
  let activeTasks = /* @__PURE__ */ new Map();
  let sseConnection = eventSource;
  let listenerCleanup = [];
  function renderCompactTask(task) {
    const hasProgress = (0, import_lang_tools.is_defined)(task.progress_current) && (0, import_lang_tools.is_defined)(task.progress_total);
    const progressPercent = hasProgress && task.progress_total > 0 ? Math.round(task.progress_current / task.progress_total * 100) : 0;
    const statusClass = task.status === "resuming" ? "status-resuming" : task.status === "running" ? "status-running" : task.status === "paused" ? "status-paused" : "";
    const progressText = hasProgress ? `${task.progress_current.toLocaleString()} / ${task.progress_total.toLocaleString()} (${progressPercent}%)` : "Starting...";
    return `
      <div class="compact-task-card ${statusClass}" data-task-id="${task.id}">
        <div class="compact-task-header">
          <span class="compact-task-type">${task.task_type}</span>
          <span class="compact-task-status badge badge-${task.status === "running" ? "ok" : "neutral"}">${task.status}</span>
        </div>
        <div class="compact-progress-bar-container">
          <div class="compact-progress-bar ${task.status === "resuming" ? "resuming-shimmer" : ""}" 
               style="width: ${progressPercent}%"></div>
        </div>
        <div class="compact-progress-text">${progressText}</div>
        ${task.progress_message ? `<div class="compact-progress-message">${task.progress_message}</div>` : ""}
      </div>
    `;
  }
  function updateWidget() {
    if (!tasksList || !widgetSection) return;
    if (activeTasks.size === 0) {
      widgetSection.classList.remove("is-hidden");
      widgetSection.dataset.hasTasks = "0";
      tasksList.innerHTML = `
        <div class="compact-task-card compact-task-card--empty">
          <div class="compact-task-header">
            <span class="compact-task-type">No active background tasks</span>
          </div>
          <div class="compact-progress-text">Background tasks will appear here when running</div>
        </div>
      `;
      return;
    }
    widgetSection.classList.remove("is-hidden");
    widgetSection.dataset.hasTasks = "1";
    const tasksHtml = Array.from(activeTasks.values()).map((task) => renderCompactTask(task)).join("");
    tasksList.innerHTML = tasksHtml;
  }
  function updateTask(task) {
    if (!task || !task.id) return;
    if (task.status === "running" || task.status === "resuming") {
      activeTasks.set(task.id, task);
    } else {
      activeTasks.delete(task.id);
    }
    updateWidget();
  }
  function removeTask(taskId) {
    activeTasks.delete(taskId);
    updateWidget();
  }
  async function loadActiveTasks() {
    try {
      const response = await fetch("/api/background-tasks");
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.tasks) {
        activeTasks.clear();
        (0, import_lang_tools.each)(data.tasks, (task) => {
          if (task.status === "running" || task.status === "resuming") {
            activeTasks.set(task.id, task);
          }
        });
        updateWidget();
      }
    } catch (err) {
      console.error("[BackgroundTasksWidget] Failed to load tasks:", err);
    }
  }
  function detachListeners() {
    if (!listenerCleanup.length) return;
    for (const cleanup of listenerCleanup) {
      try {
        cleanup();
      } catch (err) {
        console.error("[BackgroundTasksWidget] Failed to remove previous SSE listener:", err);
      }
    }
    listenerCleanup = [];
  }
  function createListenerAdapter(source) {
    if (!source) return null;
    if (typeof source.addEventListener === "function") {
      return {
        add(type, handler) {
          source.addEventListener(type, handler);
          const remove = typeof source.removeEventListener === "function" ? () => source.removeEventListener(type, handler) : null;
          return remove;
        }
      };
    }
    if (typeof source.on === "function") {
      return {
        add(type, handler) {
          source.on(type, handler);
          const remove = typeof source.off === "function" ? () => source.off(type, handler) : typeof source.removeListener === "function" ? () => source.removeListener(type, handler) : null;
          return remove;
        }
      };
    }
    if (typeof source.addListener === "function") {
      return {
        add(type, handler) {
          source.addListener(type, handler);
          const remove = typeof source.removeListener === "function" ? () => source.removeListener(type, handler) : null;
          return remove;
        }
      };
    }
    return null;
  }
  function connectSSE(eventSourceInstance) {
    if (eventSourceInstance === sseConnection && listenerCleanup.length) {
      return;
    }
    detachListeners();
    sseConnection = eventSourceInstance;
    if (!sseConnection) return;
    const adapter = createListenerAdapter(sseConnection);
    if (!adapter) {
      console.warn("[BackgroundTasksWidget] Provided event source does not support event listeners; skipping SSE binding.");
      return;
    }
    const register = (type, handler) => {
      const remove = adapter.add(type, handler);
      if (typeof remove === "function") {
        listenerCleanup.push(remove);
      }
    };
    register("task-created", (e) => {
      try {
        const task = JSON.parse(e.data);
        updateTask(task);
      } catch (err) {
        console.error("[BackgroundTasksWidget] task-created parse error:", err);
      }
    });
    register("task-progress", (e) => {
      try {
        const task = JSON.parse(e.data);
        updateTask(task);
      } catch (err) {
        console.error("[BackgroundTasksWidget] task-progress parse error:", err);
      }
    });
    register("task-status-changed", (e) => {
      try {
        const task = JSON.parse(e.data);
        updateTask(task);
      } catch (err) {
        console.error("[BackgroundTasksWidget] task-status-changed parse error:", err);
      }
    });
    register("task-completed", (e) => {
      try {
        const data = JSON.parse(e.data);
        removeTask(data.task?.id || data.id);
      } catch (err) {
        console.error("[BackgroundTasksWidget] task-completed parse error:", err);
      }
    });
  }
  function init() {
    loadActiveTasks();
  }
  return {
    init,
    updateTask,
    removeTask,
    loadActiveTasks,
    connectSSE
  };
}
export {
  createBackgroundTasksWidget
};
