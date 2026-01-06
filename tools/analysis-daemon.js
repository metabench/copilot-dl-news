#!/usr/bin/env node
/**
 * Analysis Daemon Controller
 * 
 * Manages the background analysis process.
 * 
 * Usage:
 *   node tools/analysis-daemon.js [start|stop|status]
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '../tmp');
const STATE_FILE = path.join(TMP_DIR, 'analysis-daemon.json');
const LOG_FILE = path.join(TMP_DIR, 'analysis-daemon.log');
const SCRIPT_PATH = path.join(__dirname, '../labs/analysis-observable/run-all.js');

if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

function getStatus() {
    if (!fs.existsSync(STATE_FILE)) {
        return { running: false, pid: null };
    }
    try {
        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        try {
            process.kill(state.pid, 0); // Check if process exists
            return { running: true, pid: state.pid, startTime: state.startTime };
        } catch (e) {
            return { running: false, pid: null }; // Process dead
        }
    } catch (e) {
        return { running: false, pid: null };
    }
}

function start() {
    const status = getStatus();
    if (status.running) {
        console.log(`Analysis daemon already running (PID: ${status.pid})`);
        return;
    }

    console.log('Starting analysis daemon...');
    const out = fs.openSync(LOG_FILE, 'a');
    const err = fs.openSync(LOG_FILE, 'a');

    const child = spawn('node', [SCRIPT_PATH, '--daemon'], {
        detached: true,
        stdio: ['ignore', out, err],
        cwd: path.join(__dirname, '..')
    });

    child.unref();

    const state = {
        pid: child.pid,
        startTime: new Date().toISOString()
    };

    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`Analysis daemon started (PID: ${child.pid})`);
    console.log(`Logs: ${LOG_FILE}`);
}

function stop() {
    const status = getStatus();
    if (!status.running) {
        console.log('Analysis daemon is not running.');
        if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
        return;
    }

    console.log(`Stopping analysis daemon (PID: ${status.pid})...`);
    try {
        process.kill(status.pid);
        console.log('Stopped.');
    } catch (e) {
        console.error(`Failed to stop process: ${e.message}`);
    }
    
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
}

function status() {
    const s = getStatus();
    if (s.running) {
        console.log(`Running (PID: ${s.pid}) since ${s.startTime}`);
    } else {
        console.log('Stopped');
    }
}

const command = process.argv[2] || 'status';

switch (command) {
    case 'start': start(); break;
    case 'stop': stop(); break;
    case 'status': status(); break;
    default:
        console.log('Usage: node tools/analysis-daemon.js [start|stop|status]');
        process.exit(1);
}
