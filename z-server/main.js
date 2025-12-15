const { app, BrowserWindow, ipcMain, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const treeKill = require('tree-kill');

// Logging and detection modules
const serverLogger = require('./lib/serverLogger');
const serverDetector = require('./lib/serverDetector');
const ipcGuards = require('./lib/ipcGuards');
const { createScanServersObservable } = require('./lib/scanServersObservable');

const { getClientBundleStatus } = require(path.join(__dirname, '..', 'src', 'ui', 'server', 'utils', 'ensureClientBundle'));

let mainWindow;
const runningProcesses = new Map(); // filePath -> { pid, process, port }
const BASE_PATH = path.join(__dirname, '..');
let allowedServerFiles = new Set(); // absolute, resolved server file paths from last scan

let lastScannedServers = []; // last scan results (server records with .file, .metadata, etc.)
const lastKnownServerState = new Map(); // filePath -> { running, pid, port, url }
let serverStatusPollTimer = null;
let serverStatusPollInFlight = false;

function sendUiClientLog(logToFilePath, type, data) {
  if (!mainWindow || !logToFilePath) return;
  mainWindow.webContents.send('server-log', { filePath: logToFilePath, type, data });
}

function sendServerStatusChange(payload) {
  if (!mainWindow) return;
  mainWindow.webContents.send('server-status-change', payload);
}

function maybeEmitServerStatusChange({ filePath, running, pid = null, port = null, url = null, source = null, detectionMethod = null, uncertain = null }) {
  if (!filePath) return;
  const prev = lastKnownServerState.get(filePath);
  const next = { running: !!running, pid: pid ?? null, port: port ?? null, url: url ?? null };

  const changed = !prev
    || prev.running !== next.running
    || prev.pid !== next.pid
    || prev.port !== next.port
    || prev.url !== next.url;

  if (!changed) return;
  lastKnownServerState.set(filePath, next);
  sendServerStatusChange({ filePath, running: next.running, pid: next.pid, port: next.port, url: next.url, source, detectionMethod, uncertain });
}

function stopServerStatusPolling() {
  if (serverStatusPollTimer) {
    clearInterval(serverStatusPollTimer);
    serverStatusPollTimer = null;
  }
}

function startServerStatusPolling() {
  stopServerStatusPolling();
  if (!Array.isArray(lastScannedServers) || lastScannedServers.length === 0) return;

  serverStatusPollTimer = setInterval(() => {
    if (serverStatusPollInFlight) return;
    if (!mainWindow) return;
    if (!Array.isArray(lastScannedServers) || lastScannedServers.length === 0) return;

    serverStatusPollInFlight = true;

    (async () => {
      try {
        const detected = await serverDetector.detectRunningServers(lastScannedServers);

        for (const s of detected) {
          const filePath = path.resolve(s.file);
          const tracked = runningProcesses.get(filePath);

          if (tracked && tracked.pid) {
            const port = tracked.port || s.detectedPort || null;
            const url = port ? `http://localhost:${port}` : null;
            maybeEmitServerStatusChange({
              filePath,
              running: true,
              pid: tracked.pid,
              port,
              url,
              source: 'poll',
              detectionMethod: 'tracked'
            });
            continue;
          }

          const port = s.detectedPort || null;
          const url = s.running && port ? `http://localhost:${port}` : null;

          maybeEmitServerStatusChange({
            filePath,
            running: !!s.running,
            pid: s.running ? (s.detectedPid || null) : null,
            port,
            url,
            source: 'poll',
            detectionMethod: s.detectionMethod || null,
            uncertain: s.uncertain === true
          });
        }
      } catch (e) {
        // Keep polling resilient; log once per tick.
        serverLogger.logError('Server status poll failed', e);
      } finally {
        serverStatusPollInFlight = false;
      }
    })();
  }, 2000);
}

async function resolveLikelyServerPid(filePath) {
  try {
    // First: prefer port-based lookups if we can infer a port.
    const expectedPort = serverDetector.getExpectedPort({ file: filePath });
    if (expectedPort) {
      const portStatus = await serverDetector.checkPortInUse(expectedPort);
      if (portStatus && portStatus.inUse && portStatus.isNode && portStatus.pid) {
        return portStatus.pid;
      }
    }

    // Fallback: scan node processes for a file match.
    const running = await serverDetector.isServerFileRunning(filePath);
    if (running && running.running && running.pid) return running.pid;
  } catch {
    // Best-effort only.
  }
  return null;
}

async function runUiClientBuild({ projectRoot, force = false, logToFilePath } = {}) {
  const status = getClientBundleStatus({ projectRoot });

  if (!force && !status.needsBuild) {
    return { success: true, built: false, status };
  }

  if (!status.buildScript || !fs.existsSync(status.buildScript)) {
    return {
      success: false,
      built: false,
      status,
      message: `Missing build script: ${status.buildScript}`
    };
  }

  return new Promise((resolve) => {
    sendUiClientLog(logToFilePath, 'system', '[ui-client] Building client bundle...');

    const child = spawn('node', [status.buildScript], {
      cwd: status.projectRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', (data) => {
      sendUiClientLog(logToFilePath, 'stdout', data.toString());
    });

    child.stderr.on('data', (data) => {
      sendUiClientLog(logToFilePath, 'stderr', data.toString());
    });

    child.on('error', (err) => {
      sendUiClientLog(logToFilePath, 'stderr', `[ui-client] Build failed: ${err.message}`);
      resolve({ success: false, built: false, status, message: err.message });
    });

    child.on('close', (code, signal) => {
      if (code === 0) {
        sendUiClientLog(logToFilePath, 'system', '[ui-client] Build complete.');
        resolve({ success: true, built: true, status: getClientBundleStatus({ projectRoot }) });
        return;
      }

      const msg = signal
        ? `[ui-client] Build terminated (signal ${signal})`
        : `[ui-client] Build failed (exit ${code})`;
      sendUiClientLog(logToFilePath, 'stderr', msg);
      resolve({ success: false, built: false, status, message: msg });
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#121212',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true  // Keep available but don't open automatically
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#121212',
      symbolColor: '#D4AF37',
      height: 30
    }
  });

  mainWindow.loadFile('index.html');
  
  // Register Ctrl+Shift+I to toggle dev tools (for debugging)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  // Log z-server startup
  serverLogger.logZServerStart();
  
  createWindow();

  app.on('before-quit', () => {
    // Best-effort cleanup: stop any servers started by this z-server session.
    for (const [filePath, procInfo] of runningProcesses.entries()) {
      try {
        if (procInfo && procInfo.pid) {
          serverLogger.logActivity(`CLEANUP_STOP: ${path.relative(BASE_PATH, filePath)} (PID ${procInfo.pid})`);
          treeKill(procInfo.pid, 'SIGKILL', () => {});
        }
      } catch {
        // Best-effort cleanup only
      }
    }
    runningProcesses.clear();
    stopServerStatusPolling();
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers

ipcMain.handle('scan-servers', async () => {
  return new Promise((resolve, reject) => {
    const obs = createScanServersObservable({
      basePath: BASE_PATH,
      cwd: BASE_PATH,
      htmlOnly: true
    });

    let servers = null;
    let completed = false;

    obs.on('next', (msg) => {
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'result') {
        servers = msg.servers;
        return;
      }

      if (mainWindow) {
        mainWindow.webContents.send('scan-progress', msg);
      }
    });

    obs.on('error', (err) => {
      if (completed) return;
      completed = true;
      reject(err);
    });

    obs.on('complete', () => {
      if (completed) return;
      completed = true;

      if (servers === null) {
        reject(new Error('Scan completed without result'));
        return;
      }

      (async () => {
        try {
          // Filter out the tool itself and test files if desired
          const filtered = servers.filter(s => !s.file.includes('js-server-scan.js'));

          lastScannedServers = filtered;

          // Update allowlist from scan results (absolute, resolved paths)
          allowedServerFiles = new Set(filtered.map(s => path.resolve(s.file)));

          // Detect already-running servers by checking ports
          const withDetection = await serverDetector.detectRunningServers(filtered);

          // Log any detected running servers
          for (const s of withDetection) {
            if (s.running && s.detectedPid) {
              serverLogger.logDetectedRunning(s.file, BASE_PATH, s.detectedPort, s.detectedPid, s.detectionMethod);
            }
          }

          // Merge with our tracked processes (in case we started them this session)
          const result = withDetection.map(s => {
            const tracked = runningProcesses.get(s.file);
            if (tracked) {
              return {
                ...s,
                running: true,
                pid: tracked.pid,
                detectedPort: tracked.port || s.detectedPort
              };
            }
            return {
              ...s,
              pid: s.detectedPid || null
            };
          });

          // Start background polling so external stop/restart is reflected in the UI.
          startServerStatusPolling();

          // Send completion signal
          if (mainWindow) {
            mainWindow.webContents.send('scan-progress', { type: 'complete' });
          }

          resolve(result);
        } catch (e) {
          serverLogger.logError('Scan post-processing failed', e);
          reject(e);
        }
      })();
    });
  });
});

ipcMain.handle('start-server', async (event, filePath, options = {}) => {
  const validated = ipcGuards.validateServerFilePath(filePath, {
    basePath: BASE_PATH,
    allowedServerFiles
  });
  if (!validated.ok) {
    serverLogger.logActivity(`START_REJECTED: ${validated.message}`);
    return { success: false, message: validated.message };
  }

  filePath = validated.filePath;
  serverLogger.logStartRequest(filePath, BASE_PATH);

  const isUiServer = options && typeof options === 'object' && options.isUiServer === true;
  const ensureUiClientBundle = options && typeof options === 'object' && options.ensureUiClientBundle === true;
  const logToFilePath = options && typeof options === 'object' && typeof options.logToFilePath === 'string'
    ? options.logToFilePath
    : filePath;
  
  if (runningProcesses.has(filePath)) {
    serverLogger.logActivity(`START_SKIPPED: ${path.relative(BASE_PATH, filePath)} - already tracked as running`);
    return { success: false, message: 'Already running' };
  }

  // Get expected port for this server
  const expectedPort = serverDetector.getExpectedPort({ file: filePath });
  
  // Check if port is already in use
  if (expectedPort) {
    const portStatus = await serverDetector.checkPortInUse(expectedPort);
    if (portStatus.inUse) {
      serverLogger.logActivity(`PORT_IN_USE: Port ${expectedPort} occupied by PID ${portStatus.pid} (${portStatus.processName || 'unknown'})`);
      // Don't block - let the server try to start and report the error itself
    }
  }

  if (isUiServer && ensureUiClientBundle) {
    const buildResult = await runUiClientBuild({ projectRoot: BASE_PATH, force: false, logToFilePath });
    if (!buildResult.success) {
      return { success: false, message: buildResult.message || 'ui-client build failed' };
    }
  }

  try {
    const child = spawn('node', [filePath], {
      cwd: BASE_PATH,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    runningProcesses.set(filePath, { pid: child.pid, process: child, port: expectedPort });
    serverLogger.logStartSuccess(filePath, BASE_PATH, child.pid);

    {
      const url = expectedPort ? `http://localhost:${expectedPort}` : null;
      maybeEmitServerStatusChange({ filePath, running: true, pid: child.pid, port: expectedPort || null, url, source: 'start' });
    }

    // Handle spawn errors (e.g., ENOENT)
    child.on('error', (err) => {
      serverLogger.logStartFailure(filePath, BASE_PATH, err);
      runningProcesses.delete(filePath);
      if (mainWindow) {
        mainWindow.webContents.send('server-log', { filePath, type: 'stderr', data: `Process error: ${err.message}` });
        mainWindow.webContents.send('server-status-change', { filePath, running: false });
      }
    });

    child.stdout.on('data', (data) => {
      const output = data.toString();
      if (mainWindow) {
        mainWindow.webContents.send('server-log', { filePath, type: 'stdout', data: output });
      }
      
      // Detect URL in output and log it
      const urlMatch = output.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/i);
      if (urlMatch) {
        const detectedPort = parseInt(urlMatch[1], 10);
        const tracked = runningProcesses.get(filePath);
        if (tracked && !tracked.port) {
          tracked.port = detectedPort;
        }
        serverLogger.logActivity(`SERVER_URL_DETECTED: ${path.relative(BASE_PATH, filePath)} → ${urlMatch[0]}`);

        maybeEmitServerStatusChange({
          filePath,
          running: true,
          pid: child.pid,
          port: detectedPort,
          url: urlMatch[0],
          source: 'stdout'
        });
      }
    });

    child.stderr.on('data', (data) => {
      const output = data.toString();
      if (mainWindow) {
        mainWindow.webContents.send('server-log', { filePath, type: 'stderr', data: output });
      }
      
      // Log significant errors
      if (output.includes('EADDRINUSE') || output.includes('Error:') || output.includes('error:')) {
        serverLogger.logServerError(filePath, BASE_PATH, output);
      }
    });

    child.on('close', (code, signal) => {
      serverLogger.logServerExit(filePath, BASE_PATH, code, signal);
      runningProcesses.delete(filePath);
      if (mainWindow) {
        // Send exit info so user knows why it stopped
        const exitMsg = signal ? `Process killed by signal: ${signal}` : `Process exited with code: ${code}`;
        mainWindow.webContents.send('server-log', { filePath, type: code === 0 ? 'system' : 'stderr', data: exitMsg });
        mainWindow.webContents.send('server-status-change', { filePath, running: false });
      }

      maybeEmitServerStatusChange({ filePath, running: false, pid: null, port: null, url: null, source: 'exit' });
    });

    return { success: true, pid: child.pid, port: expectedPort };
  } catch (err) {
    serverLogger.logStartFailure(filePath, BASE_PATH, err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('ui-client-status', async () => {
  try {
    return { success: true, status: getClientBundleStatus({ projectRoot: BASE_PATH }) };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('ui-client-rebuild', async (event, options = {}) => {
  const force = options && typeof options === 'object' && options.force === true;
  const logToFilePath = options && typeof options === 'object' && typeof options.logToFilePath === 'string'
    ? options.logToFilePath
    : null;

  const result = await runUiClientBuild({ projectRoot: BASE_PATH, force, logToFilePath });
  return result;
});

ipcMain.handle('stop-server', async (event, filePath, detectedPid) => {
  const validated = ipcGuards.validateServerFilePath(filePath, {
    basePath: BASE_PATH,
    allowedServerFiles
  });
  if (!validated.ok) {
    serverLogger.logActivity(`STOP_REJECTED: ${validated.message}`);
    return { success: false, message: validated.message };
  }

  filePath = validated.filePath;
  serverLogger.logStopRequest(filePath, BASE_PATH);
  
  const procInfo = runningProcesses.get(filePath);

  const killConfirmedPid = async (pid, { wasExternal = false } = {}) => {
    return new Promise((resolve) => {
      treeKill(pid, 'SIGKILL', async (err) => {
        if (err) {
          const message = String(err.message || err);

          // If PID is already gone, attempt to stop the *current* server PID (restart case).
          if (/no running instance|not found|process.*not exist/i.test(message)) {
            const refreshedPid = await resolveLikelyServerPid(filePath);
            if (refreshedPid && refreshedPid !== pid) {
              const allowed = await ipcGuards.isPidLikelyRunningServer(refreshedPid, filePath, {
                getProcessInfo: serverDetector.getProcessInfo,
                getProcessCommandLine: serverDetector.getProcessCommandLine
              });

              if (allowed) {
                treeKill(refreshedPid, 'SIGKILL', (err2) => {
                  if (err2) {
                    serverLogger.logStopFailure(filePath, BASE_PATH, err2);
                    resolve({ success: false, message: err2.message });
                    return;
                  }
                  serverLogger.logStopSuccess(filePath, BASE_PATH, refreshedPid);
                  maybeEmitServerStatusChange({ filePath, running: false, pid: null, port: null, url: null, source: 'stop' });
                  resolve({ success: true, wasExternal, refreshedPid });
                });
                return;
              }
            }

            // Treat missing PID as already stopped (best-effort).
            const stillRunningPid = await resolveLikelyServerPid(filePath);
            if (!stillRunningPid) {
              serverLogger.logStopSuccess(filePath, BASE_PATH, pid);
              maybeEmitServerStatusChange({ filePath, running: false, pid: null, port: null, url: null, source: 'stop' });
              resolve({ success: true, wasExternal, alreadyStopped: true });
              return;
            }
          }

          serverLogger.logStopFailure(filePath, BASE_PATH, err);
          resolve({ success: false, message });
        } else {
          serverLogger.logStopSuccess(filePath, BASE_PATH, pid);
          maybeEmitServerStatusChange({ filePath, running: false, pid: null, port: null, url: null, source: 'stop' });
          resolve({ success: true, wasExternal });
        }
      });
    });
  };
  
  // If we don't have it tracked but were given a detected PID, attempt a conservative external stop.
  if (!procInfo && detectedPid) {
    let pid = Number(detectedPid);
    if (!Number.isFinite(pid)) pid = null;

    if (pid) {
      const allowed = await ipcGuards.isPidLikelyRunningServer(pid, filePath, {
        getProcessInfo: serverDetector.getProcessInfo,
        getProcessCommandLine: serverDetector.getProcessCommandLine
      });

      if (!allowed) {
        // PID may be stale due to a restart; attempt to refresh.
        const refreshedPid = await resolveLikelyServerPid(filePath);
        if (refreshedPid && refreshedPid !== pid) {
          const allowedRefreshed = await ipcGuards.isPidLikelyRunningServer(refreshedPid, filePath, {
            getProcessInfo: serverDetector.getProcessInfo,
            getProcessCommandLine: serverDetector.getProcessCommandLine
          });
          if (allowedRefreshed) {
            pid = refreshedPid;
          }
        }
      }
    }

    if (!pid) {
      serverLogger.logActivity(`STOP_EXTERNAL_REJECTED: Invalid PID for ${path.basename(filePath)}`);
      return { success: false, message: 'Refusing to stop external PID (invalid)' };
    }

    const allowedFinal = await ipcGuards.isPidLikelyRunningServer(pid, filePath, {
      getProcessInfo: serverDetector.getProcessInfo,
      getProcessCommandLine: serverDetector.getProcessCommandLine
    });
    if (!allowedFinal) {
      serverLogger.logActivity(`STOP_EXTERNAL_REJECTED: Could not confirm PID ${pid} is running ${path.basename(filePath)}`);
      return { success: false, message: 'Refusing to stop external PID (not confirmed)' };
    }

    serverLogger.logActivity(`STOP_EXTERNAL_CONFIRMED: Stopping PID ${pid} for ${path.relative(BASE_PATH, filePath)}`);
    return killConfirmedPid(pid, { wasExternal: true });
  }
  
  if (!procInfo) {
    serverLogger.logActivity(`STOP_SKIPPED: ${path.relative(BASE_PATH, filePath)} - not tracked as running`);
    return { success: false, message: 'Not running' };
  }

  const pid = procInfo.pid;

  const res = await killConfirmedPid(pid, { wasExternal: false });
  if (res && res.success) {
    runningProcesses.delete(filePath);
  }
  return res;
});

ipcMain.handle('open-in-browser', async (event, url) => {
  const validated = ipcGuards.validateExternalUrl(url);
  if (!validated.ok) {
    serverLogger.logActivity(`OPEN_BROWSER_REJECTED: ${validated.message}`);
    return { success: false, message: validated.message };
  }

  url = validated.url;
  serverLogger.logActivity(`OPEN_BROWSER: ${url}`);
  
  // Try Chrome Canary first, fall back to default browser
  const chromeCanaryPaths = [
    'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome SxS\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome SxS\\Application\\chrome.exe'
  ];
  
  let chromeCanaryPath = null;
  for (const p of chromeCanaryPaths) {
    if (fs.existsSync(p)) {
      chromeCanaryPath = p;
      break;
    }
  }
  
  if (chromeCanaryPath) {
    spawn(chromeCanaryPath, [url], { detached: true, stdio: 'ignore' }).unref();
    return { success: true, browser: 'Chrome Canary' };
  } else {
    // Fall back to default browser
    await shell.openExternal(url);
    return { success: true, browser: 'default' };
  }
});

// Get recent activity logs
ipcMain.handle('get-activity-logs', async (event, count = 50) => {
  return serverLogger.getRecentLogs(count);
});

// Get current port status (which ports have servers running)
ipcMain.handle('get-port-status', async () => {
  return serverDetector.getQuickPortStatus();
});
