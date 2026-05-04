#!/usr/bin/env node
const http = require('http');

const urls = [];
for (let i = 0; i < 500; i++) {
    urls.push('https://www.theguardian.com/world/' + Date.now() + '/' + i);
}

const data = JSON.stringify({ urls });

const req = http.request({
    hostname: 'localhost',
    port: 3120,
    path: '/api/jobs',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
}, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log('Response:', body);
        process.exit(0);
    });
});

req.on('error', (e) => {
    console.error('Error:', e.message);
    process.exit(1);
});

req.write(data);
req.end();
