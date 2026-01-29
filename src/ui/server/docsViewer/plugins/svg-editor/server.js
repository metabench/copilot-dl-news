const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function init(app, ctx) {
    const { docsPath } = ctx;
    const LOG_PATH = path.join(docsPath, '..', 'svg-edits.log'); // Store log one level up from docs
    const clients = [];

    // SSE Endpoint: Listen for changes
    app.get('/api/plugins/svg-editor/stream', (req, res) => {
        const headers = {
            'Content-Type': 'text/event-stream',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache'
        };
        res.writeHead(200, headers);

        const clientId = Date.now();
        const newClient = { id: clientId, res };
        clients.push(newClient);

        console.log(`[SSE] Client connected: ${clientId}. Total clients: ${clients.length}`);

        // Keep-alive heartbeat
        const heartbeat = setInterval(() => {
            res.write(`: heartbeat\n\n`);
        }, 30000);

        req.on('close', () => {
            console.log(`[SSE] Client disconnected: ${clientId}`);
            clearInterval(heartbeat);
            const index = clients.findIndex(c => c.id === clientId);
            if (index !== -1) {
                clients.splice(index, 1);
            }
        });
    });

    app.post('/api/plugins/svg-editor/save', express.json({ limit: '50mb' }), (req, res) => {
        const { filePath, content, logEntry } = req.body;

        console.log(`[SVG-Save] Request received for: ${filePath}`);
        if (content) console.log(`[SVG-Save] Payload size: ${content.length} bytes`);

        if (!filePath || !content) {
            console.error('[SVG-Save] Missing filePath or content');
            return res.status(400).json({ error: 'Missing filePath or content' });
        }

        // Security check: prevent directory traversal
        const safePath = filePath.replace(/\.\./g, '').replace(/^\/+/, '');
        const fullPath = path.join(docsPath, safePath);

        console.log(`[SVG-Save] Target Path: ${fullPath}`);
        console.log(`[SVG-Save] Docs Root: ${docsPath}`);

        if (!fullPath.startsWith(docsPath)) {
            console.error('[SVG-Save] Access denied: Path escapes root');
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(fullPath)) {
            // Allow creation if it's a new SVG file (and we are in the docs path, checked above)
            if (path.extname(fullPath).toLowerCase() !== '.svg') {
                console.error('[SVG-Save] File not found and creation restricted to .svg');
                return res.status(404).json({ error: 'File not found' });
            }
            console.log('[SVG-Save] File does not exist, creating new SVG...');
        }

        try {
            let oldStats = { size: 0 };
            if (fs.existsSync(fullPath)) {
                oldStats = fs.statSync(fullPath);
                console.log(`[SVG-Save] Pre-write size: ${oldStats.size}`);
            } else {
                // Ensure parent dir exists
                const parentDir = path.dirname(fullPath);
                if (!fs.existsSync(parentDir)) {
                    fs.mkdirSync(parentDir, { recursive: true });
                }
            }

            // Calculate Hash of RECEIVED content
            const hash = crypto.createHash('sha256').update(content).digest('hex');
            console.log(`[SVG-Save] Computed Hash: ${hash}`);

            // 1. Save File
            fs.writeFileSync(fullPath, content, 'utf8');

            const newStats = fs.statSync(fullPath);
            console.log(`[SVG-Save] Post-write size: ${newStats.size}`);

            // 2. Append to Log
            if (logEntry) {
                const timestamp = new Date().toISOString();
                const entry = `[${timestamp}] [${safePath}] ${logEntry} (Hash: ${hash.substring(0, 8)})\n`;
                fs.appendFileSync(LOG_PATH, entry);
            }

            // 3. Broadcast Event to SSE Clients 📡
            console.log(`[SSE] Broadcasting 'file_changed' for ${safePath} to ${clients.length} clients`);
            clients.forEach(client => {
                client.res.write(`data: ${JSON.stringify({ type: 'file_changed', file: safePath, timestamp: Date.now() })}\n\n`);
            });

            // Return hash to client for verification
            res.json({ ok: true, hash: hash });
        } catch (err) {
            console.error('SVG Save Error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    // Expose Log API
    app.get('/api/plugins/svg-editor/log', (req, res) => {
        if (fs.existsSync(LOG_PATH)) {
            res.sendFile(LOG_PATH);
        } else {
            res.type('text').send('');
        }
    });

    console.log('   ✓ [svg-editor] Saving SVGs enabled');
}

// Need to require express inside init if not passed, but usually passed app instance is enough.
// We used express.json() above, so we need express. 
// Ideally the main server should expose it or we require it.
const express = require('express');

module.exports = { init };
