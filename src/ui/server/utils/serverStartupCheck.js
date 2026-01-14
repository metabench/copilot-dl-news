"use strict";

/**
 * Server Startup Check Utility
 * 
 * Provides a standardized --check flag handler for Express servers.
 * When --check is passed, the server:
 * 1. Starts normally
 * 2. Verifies it's listening on the expected port
 * 3. Optionally hits a health endpoint
 * 4. Shuts down immediately with exit code 0 (success) or 1 (failure)
 * 
 * This enables AI agents to verify servers start correctly without
 * blocking on long-running processes.
 * 
 * @example
 * // In server.js CLI section:
 * const { handleStartupCheck, wrapServerForCheck } = require('../utils/serverStartupCheck');
 * 
 * if (require.main === module) {
 *   const args = parseArgs(process.argv.slice(2));
 *   
 *   // Handle --check early (before starting server)
 *   if (args.check) {
 *     handleStartupCheck({
 *       serverPath: __filename,
 *       port: args.port || DEFAULT_PORT,
 *       healthEndpoint: '/api/health', // optional
 *       timeout: 5000 // optional, default 5s
 *     });
 *     return; // handleStartupCheck calls process.exit()
 *   }
 *   
 *   // Normal server startup...
 * }
 */

const http = require("http");
const { spawn } = require("child_process");

/**
 * Check if a server is responding on a given port
 * @param {number} port - Port to check
 * @param {string} host - Host to check (default: 127.0.0.1)
 * @param {string} [path] - Optional path to request (default: /)
 * @param {number} [timeout] - Timeout in ms (default: 2000)
 * @returns {Promise<{ok: boolean, statusCode?: number, error?: string}>}
 */
function checkServerResponds(port, host = "127.0.0.1", path = "/", timeout = 2000) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: host,
        port: port,
        path: path,
        method: "GET",
        timeout: timeout,
        // Prevent keep-alive sockets from keeping the server open in --check mode.
        // Without this, server.close() can hang waiting for pooled connections.
        agent: false,
        headers: {
          Connection: "close"
        }
      },
      (res) => {
        // Consume response data to prevent memory leak
        res.on("data", () => {});
        res.on("end", () => {
          resolve({ ok: res.statusCode < 500, statusCode: res.statusCode });
        });
      }
    );

    req.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });

    req.end();
  });
}

/**
 * Wait for server to become available
 * @param {number} port - Port to check
 * @param {string} host - Host to check
 * @param {string} path - Path to request
 * @param {number} maxWait - Maximum wait time in ms
 * @param {number} interval - Check interval in ms
 * @returns {Promise<{ok: boolean, took: number, error?: string}>}
 */
async function waitForServer(port, host = "127.0.0.1", path = "/", maxWait = 5000, interval = 200) {
  const start = Date.now();
  
  while (Date.now() - start < maxWait) {
    const result = await checkServerResponds(port, host, path);
    if (result.ok) {
      return { ok: true, took: Date.now() - start, statusCode: result.statusCode };
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  
  return { ok: false, took: Date.now() - start, error: "Server did not respond in time" };
}

/**
 * Handle --check flag by spawning server, verifying startup, then killing it
 * 
 * This function:
 * 1. Spawns the server as a child process
 * 2. Waits for it to respond on the specified port
 * 3. Kills the child process
 * 4. Exits with code 0 (success) or 1 (failure)
 * 
 * @param {Object} options
 * @param {string} options.serverPath - Absolute path to server script
 * @param {number} options.port - Port the server should listen on
 * @param {string} [options.host] - Host to check (default: 127.0.0.1)
 * @param {string} [options.healthEndpoint] - Path to health check (default: /)
 * @param {number} [options.timeout] - Max wait time in ms (default: 5000)
 * @param {string[]} [options.args] - Additional args to pass to server
 * @param {string} [options.serverName] - Display name for logging
 */
async function handleStartupCheck(options) {
  const {
    serverPath,
    port,
    host = "127.0.0.1",
    healthEndpoint = "/",
    timeout = 5000,
    args = [],
    serverName = "Server"
  } = options;

  console.log(`🔍 ${serverName} startup check (port ${port})...`);

  // Build args for child process - remove --check to prevent recursion
  const childArgs = [serverPath, "--port", String(port), ...args.filter(a => a !== "--check")];
  
  // Spawn server
  const child = spawn(process.execPath, childArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd()
  });

  let output = "";
  child.stdout?.on("data", (data) => { output += data.toString(); });
  child.stderr?.on("data", (data) => { output += data.toString(); });

  // Wait for server to respond
  const result = await waitForServer(port, host, healthEndpoint, timeout);

  // Kill the server
  child.kill("SIGTERM");
  
  // Wait a bit for graceful shutdown
  await new Promise((r) => setTimeout(r, 300));
  
  // Force kill if still running
  try {
    child.kill("SIGKILL");
  } catch (e) {
    // Already dead, that's fine
  }

  if (result.ok) {
    console.log(`✅ ${serverName} started successfully (${result.took}ms)`);
    console.log(`   Port: ${port}, Status: ${result.statusCode}`);
    process.exit(0);
  } else {
    console.error(`❌ ${serverName} failed to start`);
    console.error(`   Error: ${result.error}`);
    if (output) {
      console.error(`   Output:\n${output.slice(0, 500)}`);
    }
    process.exit(1);
  }
}

/**
 * Wrap an Express app.listen() call to support --check mode
 * 
 * When --check is in process.argv, this wrapper:
 * 1. Calls the original listen
 * 2. Verifies the server is responding
 * 3. Closes the server and exits
 * 
 * @param {Object} app - Express app
 * @param {number} port - Port to listen on
 * @param {string} host - Host to bind to
 * @param {Function} [onListening] - Original callback
 * @returns {http.Server} - The server instance
 */
function wrapServerForCheck(app, port, host, onListening) {
  const isCheckMode = process.argv.includes("--check");
  const serverName = process.env.SERVER_NAME || "Server";
  
  const server = app.listen(port, host, async () => {
    // Call original callback
    if (onListening) onListening();
    
    if (isCheckMode) {
      // Brief delay to ensure server is fully ready
      await new Promise((r) => setTimeout(r, 100));
      
      const result = await checkServerResponds(port, host, "/");
      
      server.close(() => {
        if (result.ok) {
          console.log(`✅ ${serverName} startup check passed (port ${port})`);
          process.exit(0);
        } else {
          console.error(`❌ ${serverName} startup check failed: ${result.error}`);
          process.exit(1);
        }
      });
    }
  });
  
  return server;
}

/**
 * Simple check mode that can be added to any server's CLI parsing
 * 
 * Call this right after parsing args:
 * 
 * @example
 * const args = parseArgs(process.argv.slice(2));
 * if (args.check) {
 *   runStartupCheck(__filename, args.port || 3000);
 *   return; // Never reached - runStartupCheck exits
 * }
 * 
 * @param {string} serverPath - Path to the server script
 * @param {number} port - Port to test
 * @param {Object} [options] - Additional options
 */
function runStartupCheck(serverPath, port, options = {}) {
  handleStartupCheck({
    serverPath,
    port,
    serverName: options.serverName || "Server",
    healthEndpoint: options.healthEndpoint || "/",
    timeout: options.timeout || 5000,
    args: options.args || []
  });
}

module.exports = {
  checkServerResponds,
  waitForServer,
  handleStartupCheck,
  wrapServerForCheck,
  runStartupCheck
};

