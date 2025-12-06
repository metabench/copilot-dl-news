const jsgui = require('jsgui3-html');
const express = require('express');
// Use Server_Page_Context if available, otherwise Page_Context
const Server_Page_Context = jsgui.Server_Page_Context || jsgui.Page_Context;
const Page = require('./Page');
const path = require('path');

const app = express();

// Port selection supports CLI flag or env override.
const getPortFromArgs = () => {
    const args = process.argv.slice(2);
    const portFlagIndex = args.findIndex(arg => arg === '--port');
    if (portFlagIndex !== -1 && args[portFlagIndex + 1]) {
        const parsed = parseInt(args[portFlagIndex + 1], 10);
        if (!Number.isNaN(parsed)) return parsed;
    }
    const flagWithEquals = args.find(arg => arg.startsWith('--port='));
    if (flagWithEquals) {
        const parsed = parseInt(flagWithEquals.split('=')[1], 10);
        if (!Number.isNaN(parsed)) return parsed;
    }
    const envPort = process.env.PORT && parseInt(process.env.PORT, 10);
    if (!Number.isNaN(envPort)) return envPort;
    return 3020;
};

const port = getPortFromArgs();

// Serve static files (client bundle)
app.use('/js', express.static(path.join(__dirname, 'public/js')));

app.get('/', (req, res) => {
    const context = new Server_Page_Context({
        req, res,
        pool: {}
    });
    
    const page = new Page({ context });
    
    // Ensure page is composed
    if (!page._composed) page.compose();
    
    const html = page.all_html_render();
    res.send(html);
});

if (require.main === module) {
    if (process.argv.includes('--check')) {
        console.log('Running startup check...');
        // Safety timeout
        setTimeout(() => {
            console.error('Startup check timed out');
            process.exit(1);
        }, 5000);

        try {
            // Dry run render to verify controls
            const context = new Server_Page_Context({
                pool: {}
            });
            const page = new Page({ context });
            if (!page._composed) page.compose();
            const html = page.all_html_render();
            console.log('Render check passed. HTML length:', html.length);
            process.exit(0);
        } catch (e) {
            console.error('Startup check failed:', e);
            process.exit(1);
        }
    }

    const server = app.listen(port, () => {
        console.log(`WYSIWYG Demo running at http://localhost:${port}`);
        // Keep alive check
        setInterval(() => {}, 1000);
    });
    server.on('error', (e) => {
        console.error('Server error:', e);
        process.exit(1);
    });
}

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

module.exports = app;
