'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taskAPI', {
  // Get all tasks
  getTasks: () => ipcRenderer.invoke('tasks:getAll'),
  
  // Get available task types
  getTaskTypes: () => ipcRenderer.invoke('tasks:getTypes'),
  
  // Task control
  startBackfill: (options) => ipcRenderer.invoke('tasks:startBackfill', options),
  pauseTask: (taskId) => ipcRenderer.invoke('tasks:pause', taskId),
  resumeTask: (taskId) => ipcRenderer.invoke('tasks:resume', taskId),
  cancelTask: (taskId) => ipcRenderer.invoke('tasks:cancel', taskId),
  
  // Updates
  onUpdate: (callback) => {
    ipcRenderer.on('tasks:update', (event, data) => callback(data));
  }
});
