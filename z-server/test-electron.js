const { app, BrowserWindow } = require('electron');
console.log('app:', app);
console.log('BrowserWindow:', BrowserWindow);
if (app) {
    app.whenReady().then(() => {
        console.log('Electron app is ready!');
        app.quit();
    });
} else {
    console.log('ERROR: app is undefined');
    process.exit(1);
}
