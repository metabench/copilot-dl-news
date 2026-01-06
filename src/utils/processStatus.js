const fs = require('fs');
const path = require('path');

// Ensure tmp/status exists relative to the workspace root
// We assume this file is in src/utils/processStatus.js, so root is ../../
const ROOT_DIR = path.resolve(__dirname, '../../');
const STATUS_DIR = path.join(ROOT_DIR, 'tmp', 'status');

if (!fs.existsSync(STATUS_DIR)) {
    try {
        fs.mkdirSync(STATUS_DIR, { recursive: true });
    } catch (e) {
        console.error('Failed to create status directory:', e);
    }
}

class ProcessStatus {
    /**
     * @param {string} id - Unique ID for the process (e.g., 'analysis-daemon')
     * @param {string} name - Human readable name (e.g., 'Analysis Daemon')
     */
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.filePath = path.join(STATUS_DIR, `${id}.json`);
        this.startTime = new Date().toISOString();
    }

    /**
     * Update the status file
     * @param {Object} data
     * @param {string} [data.status] - 'running', 'paused', 'stopped', 'completed', 'error'
     * @param {Object} [data.progress] - { current, total, percent, unit }
     * @param {string} [data.message] - Short status message
     * @param {Object} [data.metrics] - { speed, eta, ... }
     * @param {string} [data.error] - Error message
     */
    update(data) {
        const status = {
            id: this.id,
            pid: process.pid,
            name: this.name,
            status: data.status || 'running',
            startTime: this.startTime,
            updatedAt: Date.now(),
            progress: data.progress || null,
            message: data.message || '',
            metrics: data.metrics || {},
            error: data.error || null
        };

        try {
            // Ensure dir exists in case it was deleted
            if (!fs.existsSync(STATUS_DIR)) {
                fs.mkdirSync(STATUS_DIR, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(status, null, 2));
        } catch (e) {
            // Silent fail to avoid crashing the main process
        }
    }

    stop(message = 'Stopped') {
        this.update({ status: 'stopped', message });
    }
    
    complete(message = 'Completed') {
        this.update({ status: 'completed', message, progress: { percent: 1 } });
    }

    error(err) {
        this.update({ status: 'error', error: err.message || String(err), message: 'Error occurred' });
    }
}

module.exports = ProcessStatus;
