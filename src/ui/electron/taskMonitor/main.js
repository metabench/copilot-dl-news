'use strict';

/**
 * Task Monitor Electron App - Shows progress of background tasks
 * 
 * Features:
 * - Progress bars for active tasks
 * - Task history
 * - Start/pause/cancel controls
 * - Real-time updates via IPC
 */

const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { TaskManager } = require('../../../tasks/TaskManager');
const { ClassificationBackfillTask } = require('../../../tasks/ClassificationBackfillTask');

const PORT = 0; // Not a web server, but keep for consistency
let mainWindow = null;
let taskManager = null;

function getAppRoot() {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 700,
    minWidth: 400,
    minHeight: 500,
    resizable: true,
    backgroundColor: '#0a0d14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    sendUpdate();
  });
}

function sendUpdate() {
  if (mainWindow && taskManager) {
    mainWindow.webContents.send('tasks:update', taskManager.getAllTasksInfo());
  }
}

// --- IPC Handlers ---

// Get all tasks info
ipcMain.handle('tasks:getAll', () => {
  return taskManager ? taskManager.getAllTasksInfo() : { active: [], completed: [], stats: {} };
});

// Start a new classification backfill task
ipcMain.handle('tasks:startBackfill', async (event, options = {}) => {
  const dbPath = options.dbPath || path.join(getAppRoot(), 'data', 'news.db');
  const decisionTreePath = options.decisionTreePath || 
    path.join(getAppRoot(), 'config', 'decision-trees', 'url-classification.json');
  
  const task = new ClassificationBackfillTask({
    dbPath,
    decisionTreePath,
    batchSize: options.batchSize || 100
  });
  
  taskManager.addTask(task);
  
  // Start the task (don't await - let it run in background)
  task.start().catch(err => {
    console.error('[TaskMonitor] Task error:', err);
  });
  
  return task.getInfo();
});

// Pause a task
ipcMain.handle('tasks:pause', (event, taskId) => {
  taskManager.pauseTask(taskId);
  return true;
});

// Resume a task
ipcMain.handle('tasks:resume', (event, taskId) => {
  taskManager.resumeTask(taskId);
  return true;
});

// Cancel a task
ipcMain.handle('tasks:cancel', (event, taskId) => {
  taskManager.cancelTask(taskId);
  return true;
});

// Get available task types
ipcMain.handle('tasks:getTypes', () => {
  return [
    {
      id: 'classification-backfill',
      name: 'URL Classification Backfill',
      description: 'Reclassify all URLs in the database using the decision tree',
      icon: '🏷️'
    }
  ];
});

// --- App Lifecycle ---

app.whenReady().then(() => {
  // Initialize task manager
  taskManager = new TaskManager({ updateIntervalMs: 250 });
  
  // Forward updates to renderer
  taskManager.on('update', (info) => {
    sendUpdate();
  });
  
  createMainWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (taskManager) {
    taskManager.shutdown();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (taskManager) {
    taskManager.shutdown();
  }
});
