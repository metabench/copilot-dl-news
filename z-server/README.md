# Z-Server Manager

An Industrial Luxury Obsidian style server manager for the repository.

## Features

- **Server Detection**: Automatically scans the repository for server entry points using `js-server-scan`.
- **Process Management**: Start and stop servers directly from the UI.
- **Live Logs**: View stdout/stderr logs for running servers.
- **Visuals**: Designed with a dark, glassmorphic, gold-accented aesthetic.

## Setup

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Start the app:
    ```bash
    npm start
    ```

## Architecture

- **Main Process**: Handles process spawning and management.
- **Renderer**: Handles the UI and communicates with the main process via IPC.
- **Tooling**: Relies on `tools/dev/js-server-scan.js` for discovery.
