const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const RemoteServer = require('../core/RemoteServer');

const CONFIG_PATH = path.join(__dirname, '../../config.json');

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true, // For easier prototyping given jsgui usage, usually insecure but okay for internal tool
            contextIsolation: false
        }
    });

    win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

// IPC Handlers
ipcMain.handle('get-config', () => {
    if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH));
    }
    return {};
});

ipcMain.handle('run-deploy', async (event, { serverName, localDir, remoteDir }) => {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH));
    const serverConf = config[serverName];
    if (!serverConf) throw new Error('Server not found');

    const server = new RemoteServer(serverConf);
    try {
        await server.connect();
        const res = await server.deploy(localDir, remoteDir);
        await server.exec(`cd ${remoteDir} && npm install --production`);
        return res;
    } catch (e) {
        throw e;
    } finally {
        server.disconnect();
    }
});

ipcMain.handle('run-cmd', async (event, { serverName, command }) => {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH));
    const serverConf = config[serverName];
    if (!serverConf) throw new Error('Server not found');

    const server = new RemoteServer(serverConf);
    try {
        await server.connect();
        const res = await server.exec(command);
        return res;
    } finally {
        server.disconnect();
    }
});

ipcMain.handle('open-browser', async (event, url) => {
    await shell.openExternal(url);
});
