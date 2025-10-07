/**
 * @file backgroundTasksWidget.js
 * @description Widget for showing active background tasks on the main crawler page
 */

import { each, is_defined } from 'lang-tools';

/**
 * Creates background tasks widget
 * @param {Object} deps - Dependencies
 * @param {HTMLElement} deps.widgetSection - Widget container section
 * @param {HTMLElement} deps.tasksList - List container for tasks
 * @param {EventSource} deps.eventSource - SSE connection (optional, can be set later)
 * @returns {Object} Widget API
 */
export function createBackgroundTasksWidget({ widgetSection, tasksList, eventSource } = {}) {
  let activeTasks = new Map(); // taskId -> task data
  let sseConnection = eventSource;

  /**
   * Render a compact task card for the widget
   */
  function renderCompactTask(task) {
    const hasProgress = is_defined(task.progress_current) && is_defined(task.progress_total);
    const progressPercent = hasProgress && task.progress_total > 0
      ? Math.round((task.progress_current / task.progress_total) * 100)
      : 0;
    
    const statusClass = task.status === 'resuming' ? 'status-resuming' :
                        task.status === 'running' ? 'status-running' :
                        task.status === 'paused' ? 'status-paused' : '';
    
    const progressText = hasProgress
      ? `${task.progress_current.toLocaleString()} / ${task.progress_total.toLocaleString()} (${progressPercent}%)`
      : 'Starting...';

    return `
      <div class="compact-task-card ${statusClass}" data-task-id="${task.id}">
        <div class="compact-task-header">
          <span class="compact-task-type">${task.task_type}</span>
          <span class="compact-task-status badge badge-${task.status === 'running' ? 'ok' : 'neutral'}">${task.status}</span>
        </div>
        <div class="compact-progress-bar-container">
          <div class="compact-progress-bar ${task.status === 'resuming' ? 'resuming-shimmer' : ''}" 
               style="width: ${progressPercent}%"></div>
        </div>
        <div class="compact-progress-text">${progressText}</div>
        ${task.progress_message ? `<div class="compact-progress-message">${task.progress_message}</div>` : ''}
      </div>
    `;
  }

  /**
   * Update the widget display
   */
  function updateWidget() {
    if (!tasksList || !widgetSection) return;

    if (activeTasks.size === 0) {
      // Show widget with placeholder message
      widgetSection.classList.remove('is-hidden');
      widgetSection.dataset.hasTasks = '0';
      
      // Render grey placeholder bar
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

    // Show widget
    widgetSection.classList.remove('is-hidden');
    widgetSection.dataset.hasTasks = '1';

    // Render all active tasks
    const tasksHtml = Array.from(activeTasks.values())
      .map(task => renderCompactTask(task))
      .join('');
    
    tasksList.innerHTML = tasksHtml;
  }

  /**
   * Add or update a task
   */
  function updateTask(task) {
    if (!task || !task.id) return;

    // Only show running/resuming tasks
    if (task.status === 'running' || task.status === 'resuming') {
      activeTasks.set(task.id, task);
    } else {
      // Remove completed/paused/failed/cancelled tasks
      activeTasks.delete(task.id);
    }

    updateWidget();
  }

  /**
   * Remove a task
   */
  function removeTask(taskId) {
    activeTasks.delete(taskId);
    updateWidget();
  }

  /**
   * Fetch and display active tasks
   */
  async function loadActiveTasks() {
    try {
      const response = await fetch('/api/background-tasks');
      if (!response.ok) return;
      
      const data = await response.json();
      if (data && data.tasks) {
        // Clear and rebuild
        activeTasks.clear();
        each(data.tasks, (task) => {
          if (task.status === 'running' || task.status === 'resuming') {
            activeTasks.set(task.id, task);
          }
        });
        updateWidget();
      }
    } catch (err) {
      console.error('[BackgroundTasksWidget] Failed to load tasks:', err);
    }
  }

  /**
   * Set SSE connection and register event listeners
   */
  function connectSSE(eventSourceInstance) {
    sseConnection = eventSourceInstance;
    if (!sseConnection) return;

    // Listen for task events
    sseConnection.addEventListener('task-created', (e) => {
      try {
        const task = JSON.parse(e.data);
        updateTask(task);
      } catch (err) {
        console.error('[BackgroundTasksWidget] task-created parse error:', err);
      }
    });

    sseConnection.addEventListener('task-progress', (e) => {
      try {
        const task = JSON.parse(e.data);
        updateTask(task);
      } catch (err) {
        console.error('[BackgroundTasksWidget] task-progress parse error:', err);
      }
    });

    sseConnection.addEventListener('task-status-changed', (e) => {
      try {
        const task = JSON.parse(e.data);
        updateTask(task);
      } catch (err) {
        console.error('[BackgroundTasksWidget] task-status-changed parse error:', err);
      }
    });

    sseConnection.addEventListener('task-completed', (e) => {
      try {
        const data = JSON.parse(e.data);
        removeTask(data.task?.id || data.id);
      } catch (err) {
        console.error('[BackgroundTasksWidget] task-completed parse error:', err);
      }
    });
  }

  /**
   * Initialize the widget
   */
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
