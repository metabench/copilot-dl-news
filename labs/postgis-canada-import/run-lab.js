const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const serverPath = path.join(__dirname, 'server.js');
const checkPath = path.join(__dirname, 'check.js');

console.log('Starting server...');
const server = spawn('node', [serverPath], { stdio: 'pipe' });

server.stdout.on('data', (data) => {
    process.stdout.write(`[Server] ${data}`);
    if (data.toString().includes('running at http://localhost:3009')) {
        console.log('Server is ready. Running check...');
        runCheck();
    }
});

server.stderr.on('data', (data) => {
    process.stderr.write(`[Server Error] ${data}`);
});

function runCheck() {
    const check = spawn('node', [checkPath], { stdio: 'inherit' });

    check.on('close', (code) => {
        console.log(`Check process exited with code ${code}`);
        console.log('Stopping server...');
        server.kill();
        process.exit(code);
    });
}
