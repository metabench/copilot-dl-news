const { app, Tray, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const TMP_DIR = path.join(__dirname, '../../../../tmp');
const STATUS_DIR = path.join(TMP_DIR, 'status');
const DAEMON_SCRIPT = path.join(__dirname, '../../../../tools/analysis-daemon.js');
const ICON_PATH = path.join(__dirname, '../../../../public/icons/tray-icon.png');

let tray = null;

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
}

function getStatus() {
    if (!fs.existsSync(STATUS_DIR)) return {};

    const files = fs.readdirSync(STATUS_DIR).filter(f => f.endsWith('.json'));
    if (files.length === 0) return {};

    const statuses = {};

    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(STATUS_DIR, file), 'utf8');
            const status = JSON.parse(content);
            const name = file.replace('.json', '');

            // Check if process is actually running
            let isRunning = false;
            try {
                process.kill(status.pid, 0);
                isRunning = true;
            } catch (e) {
                isRunning = false;
            }

            // Check staleness (30s)
            if (Date.now() - status.updatedAt > 30000) {
                isRunning = false;
            }

            if (isRunning || status.status === 'failed') {
                 statuses[name] = {
                    running: isRunning,
                    pid: status.pid,
                    startTime: status.startTime,
                    richStatus: status
                };
            }
        } catch (e) {
            // ignore invalid files
        }
    }

    return statuses;
}

function runDaemonCommand(cmd) {
    spawn('node', [DAEMON_SCRIPT, cmd], {
        detached: true,
        stdio: 'ignore'
    }).unref();
    setTimeout(updateTray, 1000); // Refresh after a second
}

function updateTray() {
    if (!tray) return;
    
    const statuses = getStatus();
    const analysisStatus = statuses['analysis-daemon'] || { running: false };
    
    const uptime = analysisStatus.running && analysisStatus.startTime ? formatUptime(Date.now() - new Date(analysisStatus.startTime).getTime()) : '0s';
    
    let statusLabel = `Analysis: ${analysisStatus.running ? 'Running' : 'Stopped'}`;
    let progressLabel = 'Progress: --';
    let uptimeLabel = `Uptime: ${uptime}`;

    if (analysisStatus.running && analysisStatus.richStatus) {
        const { progress, message } = analysisStatus.richStatus;
        
        if (progress) {
            if (typeof progress.percent === 'number') {
                const percent = (progress.percent * 100).toFixed(1);
                progressLabel = `Progress: ${percent}%`;
            } else if (typeof progress === 'number') {
                const percent = (progress * 100).toFixed(1);
                progressLabel = `Progress: ${percent}%`;
            }
        }
        
        if (message) {
            statusLabel = `Analysis: ${message}`;
        }
    }

    const menuTemplate = [
        { label: statusLabel, enabled: false },
        { label: uptimeLabel, enabled: false },
        ...(analysisStatus.running ? [
            { label: progressLabel, enabled: false }
        ] : []),
        { type: 'separator' },
        { 
            label: 'Start Analysis', 
            click: () => runDaemonCommand('start'),
            enabled: !analysisStatus.running
        },
        { 
            label: 'Stop Analysis', 
            click: () => runDaemonCommand('stop'),
            enabled: analysisStatus.running
        }
    ];

    // Add other statuses
    const otherKeys = Object.keys(statuses).filter(k => k !== 'analysis-daemon');
    if (otherKeys.length > 0) {
        menuTemplate.push({ type: 'separator' });
        for (const key of otherKeys) {
            const s = statuses[key];
            const label = key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            const statusText = s.richStatus?.status || (s.running ? 'Running' : 'Stopped');
            menuTemplate.push({ label: `${label}: ${statusText}`, enabled: false });
            
            if (s.richStatus) {
                if (s.richStatus.processedCount !== undefined && s.richStatus.totalCount !== undefined) {
                    const pct = Math.round((s.richStatus.processedCount / s.richStatus.totalCount) * 100);
                    menuTemplate.push({ label: `Progress: ${s.richStatus.processedCount}/${s.richStatus.totalCount} (${pct}%)`, enabled: false });
                } else if (s.richStatus.domains && Array.isArray(s.richStatus.domains)) {
                     menuTemplate.push({ label: `Domains: ${s.richStatus.domains.length}`, enabled: false });
                }
            }
        }
    }

    menuTemplate.push(
        { type: 'separator' },
        { label: 'View Logs', click: () => shell.openPath(path.join(TMP_DIR, 'analysis-daemon.log')) },
        { type: 'separator' },
        { label: 'Exit Monitor', click: () => app.quit() }
    );

    const contextMenu = Menu.buildFromTemplate(menuTemplate);

    let tooltip = `Analysis: ${analysisStatus.running ? 'Running' : 'Stopped'}`;
    if (analysisStatus.running && analysisStatus.richStatus) {
        const p = analysisStatus.richStatus.progress;
        if (p && typeof p.percent === 'number') {
             tooltip += `\n${(p.percent * 100).toFixed(0)}% - ${uptime}`;
        }
    }
    
    if (otherKeys.length > 0) {
        tooltip += `\n+ ${otherKeys.length} other tasks`;
    }
    
    tray.setToolTip(tooltip);
    tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
    // Check if icon exists, otherwise use a default or fail gracefully
    if (!fs.existsSync(ICON_PATH)) {
        console.error('Icon not found at:', ICON_PATH);
    }
    
    tray = new Tray(ICON_PATH);
    updateTray();
    
    // Poll for status changes
    setInterval(updateTray, 5000);
});

// Hide from dock on macOS
if (process.platform === 'darwin') {
    app.dock.hide();
}
