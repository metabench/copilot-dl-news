const express = require('express');
const path = require('path');
const GazetteerImportSimulation = require('./simulation');

const app = express();
const port = 3008; // Lab port

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// SSE Endpoint
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (type, data) => {
        res.write(`event: ${type}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const sim = new GazetteerImportSimulation();

    sim.on('log', (entry) => send('log', entry));
    sim.on('progress', (data) => send('progress', data));
    sim.on('complete', () => {
        send('complete', {});
        res.end();
    });

    // Start simulation automatically on connection (for this lab)
    sim.start();

    req.on('close', () => {
        // Cleanup if needed
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Lab running at http://localhost:${port}`);
});
