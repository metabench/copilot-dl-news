# Analysis Tray Monitor

A system tray application to monitor and control the background analysis process.

## Features
- **Status Monitoring**: Shows if the analysis daemon is running or stopped.
- **Progress Tracking**: Displays real-time progress percentage and processing speed.
- **Uptime**: Shows how long the current analysis session has been running.
- **Control**: Start and Stop the analysis directly from the tray menu.
- **Logs**: Quick access to the daemon logs.

## Usage

### Starting the Monitor
```bash
npm run electron:tray-monitor
```

### CLI Control (Alternative)
You can also control the daemon via the CLI:
```bash
# Start the daemon
node tools/analysis-daemon.js start

# Stop the daemon
node tools/analysis-daemon.js stop

# Check status
node tools/analysis-daemon.js status
```

## Architecture
- **Daemon**: `tools/analysis-daemon.js` runs the analysis script (`labs/analysis-observable/run-lab.js`) in a detached process.
- **State**: The daemon writes its PID to `tmp/analysis-daemon.json`.
- **Status**: The analyzer writes detailed progress to `tmp/tray-status.json`.
- **Monitor**: The Electron app reads these files to update the UI.
