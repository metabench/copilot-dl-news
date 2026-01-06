'use strict';

// State
let taskTypes = [];

// Initialize
async function init() {
  // Load task types
  taskTypes = await window.taskAPI.getTaskTypes();
  renderTaskTypes();
  
  // Initial data load
  const data = await window.taskAPI.getTasks();
  updateUI(data);
  
  // Subscribe to updates
  window.taskAPI.onUpdate(updateUI);
}

// Render task type buttons
function renderTaskTypes() {
  const container = document.getElementById('taskTypes');
  container.innerHTML = taskTypes.map(type => `
    <button class="task-type-btn" data-type="${type.id}">
      <span class="icon">${type.icon}</span>
      <span>${type.name}</span>
    </button>
  `).join('');
  
  // Add click handlers
  container.querySelectorAll('.task-type-btn').forEach(btn => {
    btn.addEventListener('click', () => startTask(btn.dataset.type));
  });
}

// Start a new task
async function startTask(typeId) {
  if (typeId === 'classification-backfill') {
    await window.taskAPI.startBackfill();
  }
}

// Update UI with task data
function updateUI(data) {
  const { active, completed, stats } = data;
  
  // Update header stats
  document.getElementById('statsRunning').textContent = `${stats.runningCount || 0} running`;
  document.getElementById('statsPaused').textContent = `${stats.pausedCount || 0} paused`;
  
  // Update counts
  document.getElementById('activeCount').textContent = active.length;
  document.getElementById('completedCount').textContent = completed.length;
  
  // Render active tasks
  const activeContainer = document.getElementById('activeTasks');
  const noActive = document.getElementById('noActiveTasks');
  
  if (active.length === 0) {
    noActive.style.display = 'block';
    activeContainer.innerHTML = '';
    activeContainer.appendChild(noActive);
  } else {
    noActive.style.display = 'none';
    activeContainer.innerHTML = active.map(renderActiveTask).join('');
    attachTaskControls(activeContainer);
  }
  
  // Render completed tasks
  const completedContainer = document.getElementById('completedTasks');
  const noCompleted = document.getElementById('noCompletedTasks');
  
  if (completed.length === 0) {
    noCompleted.style.display = 'block';
    completedContainer.innerHTML = '';
    completedContainer.appendChild(noCompleted);
  } else {
    noCompleted.style.display = 'none';
    completedContainer.innerHTML = completed.map(renderCompletedTask).join('');
  }
}

// Render an active task card
function renderActiveTask(task) {
  const { id, name, state, progress } = task;
  const { current, total, percent, rate, message, eta } = progress;
  
  const etaStr = eta ? formatDuration(eta) : '--:--';
  const rateStr = rate > 0 ? `${rate.toFixed(1)}/s` : '--';
  const isPaused = state === 'paused';
  
  return `
    <div class="task-card" data-task-id="${id}">
      <div class="task-header">
        <span class="task-name">${name}</span>
        <span class="task-state ${state}">${state}</span>
      </div>
      
      <div class="progress-container">
        <div class="progress-track">
          <div class="progress-fill ${isPaused ? 'paused' : ''}" style="width: ${percent}%"></div>
        </div>
        <div class="progress-stats">
          <span>${current.toLocaleString()} / ${total.toLocaleString()}</span>
          <span class="progress-percent">${percent.toFixed(1)}%</span>
          <span>ETA: ${etaStr}</span>
          <span>${rateStr}</span>
        </div>
      </div>
      
      ${message ? `<div class="task-message">${escapeHtml(message)}</div>` : ''}
      
      <div class="task-controls">
        ${state === 'running' ? `
          <button class="task-btn" data-action="pause">⏸️ Pause</button>
        ` : ''}
        ${state === 'paused' ? `
          <button class="task-btn" data-action="resume">▶️ Resume</button>
        ` : ''}
        ${(state === 'running' || state === 'paused') ? `
          <button class="task-btn danger" data-action="cancel">✖️ Cancel</button>
        ` : ''}
      </div>
    </div>
  `;
}

// Render a completed task card (compact)
function renderCompletedTask(task) {
  const { id, name, state, completedAt, progress } = task;
  const { current, total } = progress;
  
  const timeStr = completedAt ? new Date(completedAt).toLocaleTimeString() : '';
  const stateIcon = state === 'completed' ? '✅' : state === 'error' ? '❌' : '⚪';
  
  return `
    <div class="task-card compact" data-task-id="${id}">
      <div class="task-header">
        <span class="task-name">${stateIcon} ${name}</span>
        <span class="task-state ${state}">${state}</span>
      </div>
      <div class="task-summary">
        ${current.toLocaleString()} / ${total.toLocaleString()} • ${timeStr}
      </div>
    </div>
  `;
}

// Attach click handlers to task control buttons
function attachTaskControls(container) {
  container.querySelectorAll('.task-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const taskCard = e.target.closest('.task-card');
      const taskId = taskCard?.dataset.taskId;
      const action = btn.dataset.action;
      
      if (!taskId || !action) return;
      
      switch (action) {
        case 'pause':
          await window.taskAPI.pauseTask(taskId);
          break;
        case 'resume':
          await window.taskAPI.resumeTask(taskId);
          break;
        case 'cancel':
          if (confirm('Cancel this task?')) {
            await window.taskAPI.cancelTask(taskId);
          }
          break;
      }
    });
  });
}

// Format duration in seconds to MM:SS or HH:MM:SS
function formatDuration(seconds) {
  if (seconds < 60) return `0:${String(seconds).padStart(2, '0')}`;
  
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins < 60) {
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }
  
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}:${String(remainingMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Escape HTML for safe rendering
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Start
init();
