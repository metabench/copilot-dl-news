const express = require('express');
const path = require('path');
const PostgisImporter = require('./importer');

const app = express();
const port = 3009;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/import-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (type, data) => {
        res.write(`event: ${type}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const importer = new PostgisImporter();

    importer.on('log', (entry) => send('log', entry));
    
    importer.on('progress', (data) => {
        send('log', { level: 'info', msg: `[${data.step}] ${data.details}` });
    });

    importer.on('data', (data) => {
        if (data.type === 'subregion') {
            const status = Math.random() > 0.7 ? 'new' : 'exists';
            send('item', {
                name: data.data.name,
                adm1: data.parent,
                status: status
            });
        } else if (data.type === 'region') {
            send('log', { level: 'info', msg: `Found Region: ${data.data.name}` });
        }
    });

    importer.on('error', (err) => send('log', { level: 'error', msg: err.message }));
    
    importer.on('complete', () => {
        send('complete', {});
        res.end();
    });

    importer.start();

    req.on('close', () => {
        // Cleanup if needed
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`PostGIS Canada Import Lab running at http://localhost:${port}`);
});
