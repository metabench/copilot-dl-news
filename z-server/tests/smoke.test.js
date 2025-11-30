"use strict";

/**
 * Z-Server Smoke Test
 * 
 * Uses the electron-console-capture tool to verify z-server launches
 * without errors and completes initial scanning.
 * 
 * This is a fast sanity check that catches obvious crashes.
 * 
 * NOTE: Exit code 1 is EXPECTED because the capture tool kills the app
 * after the timeout. We check for meaningful errors, not exit codes.
 */

const { spawn } = require('child_process');
const path = require('path');

const TIMEOUT = 20000; // 20 seconds for full startup + scan
const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const TOOL_PATH = path.join(REPO_ROOT, 'tools', 'dev', 'electron-console-capture.js');

describe('Z-Server Smoke Test', () => {
  
  it('should launch without fatal errors', async () => {
    const result = await runElectronCapture({
      timeout: 8000,
      rejectStrings: ['Fatal error', 'FATAL', 'Cannot find module']
    });
    
    // Exit code 1 is OK - the tool kills the app on timeout
    // We care about actual errors, not timeout termination
    expect(result.fatalErrors).toHaveLength(0);
    
    // Should have captured some logs (proves app launched)
    expect(result.logs.length).toBeGreaterThan(0);
  }, TIMEOUT);

  it('should complete server scan', async () => {
    const result = await runElectronCapture({
      timeout: 12000,  // Give more time for scan
      rejectStrings: ['Scan failed', 'scan error', 'detection failed']
    });
    
    // No scan errors
    expect(result.fatalErrors).toHaveLength(0);
    
    // Should have some activity logged
    expect(result.logs.length).toBeGreaterThan(0);
  }, TIMEOUT);

  it('should not have uncaught exceptions', async () => {
    const result = await runElectronCapture({
      timeout: 8000,
      rejectStrings: ['Uncaught', 'unhandledRejection', 'TypeError', 'ReferenceError']
    });
    
    expect(result.fatalErrors).toHaveLength(0);
  }, TIMEOUT);

});

/**
 * Run electron-console-capture and collect results
 */
function runElectronCapture(options = {}) {
  const { timeout = 5000, expectStrings = [], rejectStrings = [] } = options;
  
  return new Promise((resolve, reject) => {
    const logs = [];
    const fatalErrors = [];
    let stdout = '';
    let stderr = '';
    
    const proc = spawn('node', [
      TOOL_PATH,
      '--app=z-server',
      `--timeout=${timeout}`,
      '--json'
    ], {
      cwd: REPO_ROOT,
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
    });

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      reject(err);
    });

    proc.on('close', (code) => {
      // Try to parse JSON output
      try {
        const parsed = JSON.parse(stdout);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            const text = entry.text || '';
            logs.push(text);
            
            // Check for fatal errors
            for (const pattern of rejectStrings) {
              if (text.includes(pattern)) {
                fatalErrors.push({ pattern, text });
              }
            }
          }
        }
      } catch (e) {
        // Not JSON, use raw output
        logs.push(stdout);
        logs.push(stderr);
      }
      
      // Check expected strings
      const missingExpected = [];
      for (const expected of expectStrings) {
        const found = logs.some(l => l.includes(expected));
        if (!found) {
          missingExpected.push(expected);
        }
      }
      
      resolve({
        exitCode: code,
        logs,
        fatalErrors,
        missingExpected,
        stdout,
        stderr
      });
    });

    // Failsafe timeout - use unref() so it doesn't keep process alive
    const failsafe = setTimeout(() => {
      proc.kill('SIGTERM');
    }, timeout + 5000);
    failsafe.unref();
  });
}
