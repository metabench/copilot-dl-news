const http = require('http');

function parsePort(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const port = Math.trunc(n);
  if (port < 0 || port > 65535) return null;
  return port;
}

function buildPortCandidates(envPort = parsePort(process.env.PORT)) {
  const candidates = [];
  const seen = new Set();
  if (envPort !== null) {
    candidates.push(envPort);
    seen.add(envPort);
    if (envPort === 0) {
      return candidates;
    }
  }
  const HIGH_PORT_BASE = 41000;
  const HIGH_PORT_END = 61000;
  for (let port = HIGH_PORT_BASE; port <= HIGH_PORT_END; port++) {
    if (seen.has(port)) continue;
    candidates.push(port);
    seen.add(port);
  }
  if (!seen.has(0)) {
    candidates.push(0);
  }
  return candidates;
}

function attachSignalHandlers(server, {
  jobRegistry = null,
  realtime = null,
  cleanupTempDb = null,
  configManager = null,
  benchmarkManager = null,
  compressionWorkerPool = null,
  analysisRunManager = null,
  quiet = false
} = {}) {
  if (!server) return;
  const sockets = new Set();
  try {
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
  } catch (_) {}
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (!quiet) {
      try {
        console.log(`[server] shutting down (${signal})`);
      } catch (_) {}
    }
    if (jobRegistry && typeof jobRegistry.getJobs === 'function') {
      for (const job of jobRegistry.getJobs().values()) {
        try {
          jobRegistry.stopJob(job.id || null);
        } catch (_) {}
      }
    }
    try {
      configManager?.close?.();
    } catch (_) {}
    try {
      benchmarkManager?.destroy?.();
    } catch (_) {}
    try {
      // Shutdown compression worker pool
      compressionWorkerPool?.shutdown?.();
    } catch (_) {}
    try {
      // Stop analysis run monitoring
      analysisRunManager?.stopMonitoring?.();
    } catch (_) {}
    try {
      cleanupTempDb?.();
    } catch (_) {}
    if (realtime && typeof realtime.getSseClients === 'function') {
      for (const client of realtime.getSseClients()) {
        try {
          client.res.end();
        } catch (_) {}
      }
    }
    try {
      server.close(() => {
        try {
          if (!quiet) console.log('[server] shutdown complete');
        } catch (_) {}
        process.exit(0);
      });
      const timer = setTimeout(() => {
        for (const socket of sockets) {
          try {
            socket.destroy();
          } catch (_) {}
        }
        try {
          process.exit(0);
        } catch (_) {
          /* noop */
        }
      }, 500);
      timer.unref?.();
    } catch (err) {
      try {
        console.error('[server] shutdown error', err?.message || err);
      } catch (_) {}
      process.exit(0);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function startServer(app, {
  quiet = false,
  jobRegistry = null,
  realtime = null,
  configManager = null,
  benchmarkManager = null,
  compressionWorkerPool = null,
  analysisRunManager = null,
  cleanupTempDb = null,
  detached = false,
  autoShutdownMs = null,
  candidates = buildPortCandidates()
} = {}) {
  if (!app) throw new Error('startServer requires an Express app instance');
  const server = http.createServer(app);
  server.on('close', () => {
    try {
      configManager?.close?.();
    } catch (_) {}
    try {
      benchmarkManager?.destroy?.();
    } catch (_) {}
    try {
      cleanupTempDb?.();
    } catch (_) {}
  });

  let attemptIndex = 0;
  let lastRequestedPort = null;
  let listeningLogged = false;

  const tryListen = () => {
    if (attemptIndex >= candidates.length) {
      const err = new Error('Unable to find an available port');
      if (!quiet) {
        try {
          console.error(`[server] ${err.message}`);
        } catch (_) {}
      }
      server.emit('error', err);
      return;
    }
    const nextPort = candidates[attemptIndex++];
    lastRequestedPort = nextPort;
    try {
      server.listen(nextPort);
    } catch (err) {
      if ((err.code === 'EADDRINUSE' || err.code === 'EACCES') && attemptIndex < candidates.length) {
        if (!quiet) {
          const fallbackPort = candidates[attemptIndex];
          try {
            console.warn(`[server] Port ${nextPort} unavailable (${err.code}); retrying with ${fallbackPort}${fallbackPort === 0 ? ' (ephemeral)' : ''}`);
          } catch (_) {}
        }
        tryListen();
        return;
      }
      throw err;
    }
  };

  server.on('error', (err) => {
    if ((err.code === 'EADDRINUSE' || err.code === 'EACCES') && attemptIndex < candidates.length) {
      if (!quiet) {
        const fallbackPort = candidates[attemptIndex];
        try {
          console.warn(`[server] Port ${lastRequestedPort} unavailable (${err.code}); retrying with ${fallbackPort}${fallbackPort === 0 ? ' (ephemeral)' : ''}`);
        } catch (_) {}
      }
      tryListen();
      return;
    }
    if (!quiet) {
      try {
        console.error(`[server] Failed to start: ${err.message || err}`);
      } catch (_) {}
    }
  });

  server.on('listening', () => {
    if (listeningLogged) return;
    listeningLogged = true;
    try {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : lastRequestedPort;
      console.log(`GUI server listening on http://localhost:${port}`);
      
      // Setup auto-shutdown timer if requested
      if (autoShutdownMs && Number.isFinite(autoShutdownMs) && autoShutdownMs > 0) {
        if (!quiet) {
          console.log(`[server] Auto-shutdown scheduled in ${autoShutdownMs / 1000}s`);
        }
        const shutdownTimer = setTimeout(() => {
          if (!quiet) {
            console.log(`[server] Auto-shutdown timer expired (${autoShutdownMs}ms)`);
          }
          try {
            server.close();
          } catch (_) {}
          setTimeout(() => {
            process.exit(0);
          }, 100);
        }, autoShutdownMs);
        
        // In detached mode, keep the timer referenced so process doesn't exit
        // In normal mode, unref so it doesn't prevent exit
        if (!detached && shutdownTimer.unref) {
          shutdownTimer.unref();
        }
      }
    } catch (_) {
      if (lastRequestedPort != null) {
        console.log(`GUI server listening on http://localhost:${lastRequestedPort}`);
      } else {
        console.log('GUI server listening');
      }
    }
  });

  tryListen();
  
  // In detached mode, disable SIGINT/SIGTERM handlers so the terminal can be released
  if (!detached) {
    attachSignalHandlers(server, { jobRegistry, realtime, cleanupTempDb, configManager, benchmarkManager, compressionWorkerPool, analysisRunManager, quiet });
  }
  
  return server;
}

module.exports = {
  parsePort,
  buildPortCandidates,
  attachSignalHandlers,
  startServer
};
