const fs = require('fs');
const path = require('path');

const STATUS_FILE = path.join(__dirname, '../tmp/tray-status.json');

/**
 * Update the tray status file.
 * @param {string} processName - Name of the process (e.g., 'Analysis')
 * @param {string} status - Status (e.g., 'running', 'stopped', 'error')
 * @param {number} progress - Progress (0.0 to 1.0)
 * @param {string} message - Status message
 */
function updateStatus(processName, status, progress, message) {
    const data = {
        process: processName,
        status: status,
        progress: progress,
        message: message,
        updatedAt: Date.now()
    };

    try {
        // Ensure tmp dir exists
        const dir = path.dirname(STATUS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        // Ignore errors to prevent crashing the main process
        console.error('Failed to update tray status:', err.message);
    }
}

module.exports = { updateStatus };
