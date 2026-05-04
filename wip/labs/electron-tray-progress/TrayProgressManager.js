/**
 * TrayProgressManager - Encapsulated Electron tray icon with popup progress UI
 * 
 * Provides a reusable tray icon that displays background process progress.
 * Handles tray lifecycle, popup window, SSE/polling connections, and events.
 * 
 * @example
 * const tray = new TrayProgressManager({ title: 'My Process' });
 * await tray.init();
 * tray.updateProgress({ phase: 'running', processed: 50, total: 100 });
 */
'use strict';

const path = require('path');
const { EventEmitter } = require('events');
const { Tray, Menu, BrowserWindow, nativeImage, ipcMain, screen } = require('electron');

// Default icon paths (relative to this file)
const DEFAULT_ICONS_DIR = path.join(__dirname, 'icons');

/**
 * @typedef {Object} ProgressState
 * @property {'idle'|'running'|'paused'|'complete'|'error'} phase
 * @property {number} processed
 * @property {number} total
 * @property {number} [updated]
 * @property {number} [recordsPerSecond]
 * @property {number} [bytesPerSecond]
 * @property {number} [elapsedMs]
 * @property {number} [etaMs]
 * @property {string} [currentItem]
 * @property {Array<{type: string, message: string}>} [warnings]
 * @property {string} [error]
 */

/**
 * @typedef {Object} TrayProgressManagerOptions
 * @property {string} [title='Background Process'] - Process title shown in popup
 * @property {string} [iconsDir] - Path to icons directory
 * @property {Object} [popupSize] - Popup window dimensions
 * @property {number} [popupSize.width=320]
 * @property {number} [popupSize.height=280]
 * @property {string} [popupHtml] - Path to custom popup HTML
 * @property {boolean} [showOnStart=false] - Show popup on init
 * @property {boolean} [animateWhenRunning=true] - Animate icon when running
 */

class TrayProgressManager extends EventEmitter {
  /**
   * @param {TrayProgressManagerOptions} options
   */
  constructor(options = {}) {
    super();

    this.title = options.title || 'Background Process';
    this.iconsDir = options.iconsDir || DEFAULT_ICONS_DIR;
    this.popupSize = {
      width: options.popupSize?.width || 320,
      height: options.popupSize?.height || 280
    };
    this.popupHtml = options.popupHtml || path.join(__dirname, 'popup.html');
    this.showOnStart = options.showOnStart === true;
    this.animateWhenRunning = options.animateWhenRunning !== false;

    /** @type {Tray|null} */
    this._tray = null;

    /** @type {BrowserWindow|null} */
    this._popup = null;

    /** @type {ProgressState} */
    this._state = {
      phase: 'idle',
      processed: 0,
      total: 0
    };

    this._icons = {};
    this._animationFrame = 0;
    this._animationTimer = null;
    this._eventSource = null;
    this._pollTimer = null;

    // Bind methods
    this._onTrayClick = this._onTrayClick.bind(this);
    this._onPopupBlur = this._onPopupBlur.bind(this);
    this._handleIpcCommand = this._handleIpcCommand.bind(this);
  }

  /**
   * Initialize tray icon and popup window
   */
  async init() {
    await this._loadIcons();
    this._createTray();
    this._createPopup();
    this._setupIpc();

    if (this.showOnStart) {
      this.showPopup();
    }

    return this;
  }

  /**
   * Load tray icons
   */
  async _loadIcons() {
    const iconNames = ['idle', 'running', 'running2', 'paused', 'complete', 'error'];

    for (const name of iconNames) {
      const iconPath = path.join(this.iconsDir, `${name}.png`);
      try {
        this._icons[name] = nativeImage.createFromPath(iconPath);
        // Resize for tray (16x16 on Windows/Linux, varies on macOS)
        if (!this._icons[name].isEmpty()) {
          this._icons[name] = this._icons[name].resize({ width: 16, height: 16 });
        }
      } catch (e) {
        // Use fallback
        this._icons[name] = this._createFallbackIcon(name);
      }
    }

    // Ensure we have at least idle icon
    if (!this._icons.idle || this._icons.idle.isEmpty()) {
      this._icons.idle = this._createFallbackIcon('idle');
    }
  }

  /**
   * Create a simple fallback icon
   */
  _createFallbackIcon(name) {
    // Create a simple colored circle as fallback
    const colors = {
      idle: '#808080',
      running: '#00aaff',
      running2: '#0088cc',
      paused: '#ffaa00',
      complete: '#00ff88',
      error: '#ff4444'
    };
    const color = colors[name] || colors.idle;

    // Create 16x16 data URL
    const size = 16;
    const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="${color}" stroke="#fff" stroke-width="1"/>
    </svg>`;

    return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`);
  }

  /**
   * Create the tray icon
   */
  _createTray() {
    this._tray = new Tray(this._icons.idle);
    this._tray.setToolTip(this.title);

    // Build context menu
    this._updateContextMenu();

    // Handle click
    this._tray.on('click', this._onTrayClick);
  }

  /**
   * Update context menu based on state
   */
  _updateContextMenu() {
    const isRunning = this._state.phase === 'running';
    const isPaused = this._state.phase === 'paused';

    const menu = Menu.buildFromTemplate([
      {
        label: this.title,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Show Progress',
        click: () => this.showPopup()
      },
      { type: 'separator' },
      {
        label: isPaused ? 'Resume' : 'Pause',
        enabled: isRunning || isPaused,
        click: () => this.emit(isPaused ? 'resume' : 'pause')
      },
      {
        label: 'Stop',
        enabled: isRunning || isPaused,
        click: () => this.emit('stop')
      },
      { type: 'separator' },
      {
        label: 'Show Details...',
        click: () => this.emit('showDetails')
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => this.emit('quit')
      }
    ]);

    this._tray.setContextMenu(menu);
  }

  /**
   * Create the popup window
   */
  _createPopup() {
    this._popup = new BrowserWindow({
      width: this.popupSize.width,
      height: this.popupSize.height,
      show: false,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      transparent: false,
      backgroundColor: '#1a1a2e',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    this._popup.loadFile(this.popupHtml);

    // Hide on blur (clicking outside)
    this._popup.on('blur', this._onPopupBlur);

    // Prevent closing (just hide)
    this._popup.on('close', (e) => {
      e.preventDefault();
      this._popup.hide();
    });
  }

  /**
   * Setup IPC handlers
   */
  _setupIpc() {
    ipcMain.on('tray-command', this._handleIpcCommand);
  }

  /**
   * Handle IPC commands from popup
   */
  _handleIpcCommand(event, command, data) {
    switch (command) {
      case 'pause':
        this.emit('pause');
        break;
      case 'resume':
        this.emit('resume');
        break;
      case 'stop':
        this.emit('stop');
        break;
      case 'showDetails':
        this.emit('showDetails');
        this.hidePopup();
        break;
      case 'close':
        this.hidePopup();
        break;
    }
  }

  /**
   * Handle tray icon click
   */
  _onTrayClick() {
    if (this._popup.isVisible()) {
      this.hidePopup();
    } else {
      this.showPopup();
    }
  }

  /**
   * Handle popup blur
   */
  _onPopupBlur() {
    // Small delay to allow button clicks to register
    setTimeout(() => {
      if (this._popup && !this._popup.isFocused()) {
        this.hidePopup();
      }
    }, 100);
  }

  /**
   * Show popup window positioned near tray
   */
  showPopup() {
    if (!this._popup || !this._tray) return;

    const trayBounds = this._tray.getBounds();
    const popupBounds = this._popup.getBounds();
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
    const workArea = display.workArea;

    // Position popup above/below tray icon
    let x = Math.round(trayBounds.x - popupBounds.width / 2 + trayBounds.width / 2);
    let y;

    // Check if tray is at top or bottom
    if (trayBounds.y < workArea.height / 2) {
      // Tray at top - show below
      y = trayBounds.y + trayBounds.height + 4;
    } else {
      // Tray at bottom - show above
      y = trayBounds.y - popupBounds.height - 4;
    }

    // Keep within screen bounds
    x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - popupBounds.width));
    y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - popupBounds.height));

    this._popup.setPosition(x, y, false);
    this._popup.show();
    this._popup.focus();

    // Send current state to popup
    this._sendStateToPopup();
  }

  /**
   * Hide popup window
   */
  hidePopup() {
    if (this._popup) {
      this._popup.hide();
    }
  }

  /**
   * Update progress state
   * @param {Partial<ProgressState>} state
   */
  updateProgress(state) {
    const prevPhase = this._state.phase;
    this._state = { ...this._state, ...state };

    // Update icon
    this._updateIcon();

    // Update tooltip
    this._updateTooltip();

    // Update context menu if phase changed
    if (state.phase && state.phase !== prevPhase) {
      this._updateContextMenu();
    }

    // Send to popup
    this._sendStateToPopup();
  }

  /**
   * Update tray icon based on state
   */
  _updateIcon() {
    if (!this._tray) return;

    const iconName = this._state.phase;

    if (iconName === 'running' && this.animateWhenRunning) {
      this._startIconAnimation();
    } else {
      this._stopIconAnimation();
      const icon = this._icons[iconName] || this._icons.idle;
      this._tray.setImage(icon);
    }
  }

  /**
   * Start icon animation
   */
  _startIconAnimation() {
    if (this._animationTimer) return;

    const frames = [this._icons.running, this._icons.running2 || this._icons.running];

    this._animationTimer = setInterval(() => {
      this._animationFrame = (this._animationFrame + 1) % frames.length;
      if (this._tray) {
        this._tray.setImage(frames[this._animationFrame]);
      }
    }, 500);
  }

  /**
   * Stop icon animation
   */
  _stopIconAnimation() {
    if (this._animationTimer) {
      clearInterval(this._animationTimer);
      this._animationTimer = null;
    }
  }

  /**
   * Update tooltip text
   */
  _updateTooltip() {
    if (!this._tray) return;

    const { phase, processed, total } = this._state;
    const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

    let tooltip = this.title;

    switch (phase) {
      case 'running':
        tooltip = `${this.title}: ${pct}% (${processed.toLocaleString()} / ${total.toLocaleString()})`;
        break;
      case 'paused':
        tooltip = `${this.title}: Paused at ${pct}%`;
        break;
      case 'complete':
        tooltip = `${this.title}: Complete (${processed.toLocaleString()} items)`;
        break;
      case 'error':
        tooltip = `${this.title}: Error - ${this._state.error || 'Unknown'}`;
        break;
    }

    this._tray.setToolTip(tooltip);
  }

  /**
   * Send state to popup window
   */
  _sendStateToPopup() {
    if (this._popup && this._popup.webContents) {
      this._popup.webContents.send('progress-update', {
        title: this.title,
        ...this._state
      });
    }
  }

  /**
   * Connect to SSE progress source
   * @param {string} url - SSE endpoint URL
   */
  connectToSSE(url) {
    if (this._eventSource) {
      this._eventSource.close();
    }

    // Note: EventSource is not available in Node.js main process.
    // In a real implementation, use a library like 'eventsource' or 
    // make HTTP requests from the renderer process and forward via IPC.
    console.warn('[TrayProgressManager] SSE connection requires eventsource library or renderer process');

    // For now, fall back to polling if available
    this.connectToPolling(url.replace('/sse/', '/api/'));
  }

  /**
   * Connect to polling endpoint
   * @param {string} url - Polling endpoint URL
   * @param {number} [intervalMs=2000]
   */
  connectToPolling(url, intervalMs = 2000) {
    this.disconnectPolling();

    const poll = async () => {
      try {
        const http = require('http');
        const https = require('https');
        const client = url.startsWith('https') ? https : http;

        const data = await new Promise((resolve, reject) => {
          client.get(url, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(e);
              }
            });
          }).on('error', reject);
        });

        if (data.state) {
          this.updateProgress(data.state);
        }
      } catch (e) {
        // Ignore polling errors
      }
    };

    poll();
    this._pollTimer = setInterval(poll, intervalMs);
  }

  /**
   * Disconnect polling
   */
  disconnectPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  /**
   * Get current state
   * @returns {ProgressState}
   */
  getState() {
    return { ...this._state };
  }

  /**
   * Cleanup and destroy tray
   */
  destroy() {
    this._stopIconAnimation();
    this.disconnectPolling();

    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }

    ipcMain.removeListener('tray-command', this._handleIpcCommand);

    if (this._popup) {
      this._popup.removeAllListeners();
      this._popup.destroy();
      this._popup = null;
    }

    if (this._tray) {
      this._tray.destroy();
      this._tray = null;
    }
  }
}

module.exports = { TrayProgressManager };
