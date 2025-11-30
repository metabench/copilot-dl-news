"use strict";

/**
 * Running Server Detector for Z-Server
 * 
 * Detects servers that are already running by checking ports and process lists.
 * Uses netstat, tasklist, and wmic on Windows.
 * 
 * Detection strategies:
 * 1. Port-based: Check if expected port is listening
 * 2. Process-based: Check if node process with matching file is running
 * 3. Source parsing: Extract port from server source code
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Cache for process info to avoid repeated tasklist calls
const processCache = new Map();
const CACHE_TTL = 5000; // 5 seconds

/**
 * Extract default port from server metadata or source code
 */
function getExpectedPort(server) {
  // First try metadata
  if (server.metadata && server.metadata.defaultPort) {
    return server.metadata.defaultPort;
  }
  
  // Try to parse from source file if available
  if (server.file && fs.existsSync(server.file)) {
    const port = parsePortFromSource(server.file);
    if (port) return port;
  }
  
  // Common ports by server type (fallback)
  const portPatterns = {
    'artPlayground': 4950,
    'designStudio': 4900,
    'docsViewer': 4800,
    'dataExplorer': 3000,
    'diagramAtlas': 3001,
    'factsServer': 3002,
    'geoImport': 3003,
    'gazetteerInfo': 3004,
    'api/server': 3100
  };
  
  for (const [pattern, port] of Object.entries(portPatterns)) {
    if (server.file && server.file.includes(pattern)) {
      return port;
    }
    if (server.relativeFile && server.relativeFile.includes(pattern)) {
      return port;
    }
  }
  
  return null;
}

/**
 * Parse port number from server source code
 * Looks for common patterns like:
 * - @port 3000
 * - const PORT = 3000
 * - .listen(3000)
 * - process.env.PORT || 3000
 */
function parsePortFromSource(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // @port annotation (highest priority)
    const annotationMatch = content.match(/@port\s+(\d+)/);
    if (annotationMatch) {
      return parseInt(annotationMatch[1], 10);
    }
    
    // DEFAULT_PORT constant
    const defaultPortMatch = content.match(/(?:const|let|var)\s+DEFAULT_PORT\s*=\s*(\d+)/);
    if (defaultPortMatch) {
      return parseInt(defaultPortMatch[1], 10);
    }
    
    // PORT constant  
    const portConstMatch = content.match(/(?:const|let|var)\s+PORT\s*=\s*(?:process\.env\.PORT\s*\|\|\s*)?(\d+)/);
    if (portConstMatch) {
      return parseInt(portConstMatch[1], 10);
    }
    
    // .listen(port) call with literal number
    const listenMatch = content.match(/\.listen\s*\(\s*(\d{4,5})\s*[,)]/);
    if (listenMatch) {
      return parseInt(listenMatch[1], 10);
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Get listening ports and their PIDs using netstat (Windows)
 * Returns Map<port, pid>
 */
async function getListeningPorts() {
  return new Promise((resolve) => {
    // netstat -ano shows all connections with PIDs
    exec('netstat -ano', { encoding: 'utf8', maxBuffer: 1024 * 1024 }, (err, stdout) => {
      const portToPid = new Map();
      
      if (err || !stdout) {
        resolve(portToPid);
        return;
      }
      
      // Parse netstat output
      // IPv4: TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345
      // IPv6: TCP    [::]:3000              [::]:0                 LISTENING       12345
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (!line.includes('LISTENING')) continue;
        
        // IPv4 format
        let match = line.match(/TCP\s+[\d.]+:(\d+)\s+[\d.]+:\d+\s+LISTENING\s+(\d+)/);
        if (!match) {
          // IPv6 format
          match = line.match(/TCP\s+\[.*?\]:(\d+)\s+\[.*?\]:\d+\s+LISTENING\s+(\d+)/);
        }
        
        if (match) {
          const port = parseInt(match[1], 10);
          const pid = parseInt(match[2], 10);
          // Don't overwrite - first entry wins (usually IPv4)
          if (!portToPid.has(port)) {
            portToPid.set(port, pid);
          }
        }
      }
      
      resolve(portToPid);
    });
  });
}

/**
 * Get process info by PID using tasklist (Windows)
 * Returns { name, pid } or null
 * Uses caching to avoid repeated calls
 */
async function getProcessInfo(pid) {
  // Check cache first
  const cached = processCache.get(pid);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.info;
  }
  
  return new Promise((resolve) => {
    exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' }, (err, stdout) => {
      if (err || !stdout.trim() || stdout.includes('No tasks')) {
        processCache.set(pid, { info: null, timestamp: Date.now() });
        resolve(null);
        return;
      }
      
      // Parse CSV output: "node.exe","12345","Console","1","50,000 K"
      const match = stdout.match(/"([^"]+)","(\d+)"/);
      if (match) {
        const info = {
          name: match[1],
          pid: parseInt(match[2], 10)
        };
        processCache.set(pid, { info, timestamp: Date.now() });
        resolve(info);
      } else {
        processCache.set(pid, { info: null, timestamp: Date.now() });
        resolve(null);
      }
    });
  });
}

/**
 * Get command line for a process using wmic (Windows)
 * Returns the full command line string or null
 */
async function getProcessCommandLine(pid) {
  return new Promise((resolve) => {
    exec(`wmic process where "ProcessId=${pid}" get CommandLine /format:list`, { encoding: 'utf8' }, (err, stdout) => {
      if (err || !stdout) {
        resolve(null);
        return;
      }
      
      // Parse: CommandLine=node src/ui/server/artPlayground/server.js
      const match = stdout.match(/CommandLine=(.+)/);
      if (match) {
        resolve(match[1].trim());
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Get all running Node.js processes with their command lines
 * Returns array of { pid, commandLine }
 */
async function getNodeProcesses() {
  return new Promise((resolve) => {
    exec('wmic process where "Name=\'node.exe\'" get ProcessId,CommandLine /format:csv', { encoding: 'utf8', maxBuffer: 1024 * 1024 }, (err, stdout) => {
      const processes = [];
      
      if (err || !stdout) {
        resolve(processes);
        return;
      }
      
      // Parse CSV: Node,CommandLine,ProcessId
      // Skip header line
      const lines = stdout.trim().split('\n').slice(1);
      for (const line of lines) {
        if (!line.trim()) continue;
        
        // Format: HOSTNAME,command line here,12345
        const parts = line.split(',');
        if (parts.length >= 3) {
          const pid = parseInt(parts[parts.length - 1], 10);
          // Command line is everything between first comma and last comma
          const cmdLine = parts.slice(1, -1).join(',').trim();
          if (pid && cmdLine) {
            processes.push({ pid, commandLine: cmdLine });
          }
        }
      }
      
      resolve(processes);
    });
  });
}

/**
 * Check if a specific port is in use by a Node.js process
 */
async function checkPortInUse(port) {
  const portToPid = await getListeningPorts();
  const pid = portToPid.get(port);
  
  if (!pid) {
    return { inUse: false };
  }
  
  const procInfo = await getProcessInfo(pid);
  if (!procInfo) {
    return { inUse: true, pid, isNode: false };
  }
  
  const isNode = procInfo.name.toLowerCase().includes('node');
  
  // If it's node, try to get command line for more info
  let commandLine = null;
  if (isNode) {
    commandLine = await getProcessCommandLine(pid);
  }
  
  return { inUse: true, pid, isNode, processName: procInfo.name, commandLine };
}

/**
 * Check if a server file is currently being run by any Node process
 */
async function isServerFileRunning(serverFile) {
  const nodeProcesses = await getNodeProcesses();
  const normalizedServerFile = path.normalize(serverFile).toLowerCase();
  const serverBasename = path.basename(serverFile).toLowerCase();
  
  for (const proc of nodeProcesses) {
    const cmdLower = proc.commandLine.toLowerCase();
    
    // Check if full path matches
    if (cmdLower.includes(normalizedServerFile)) {
      return { running: true, pid: proc.pid, matchType: 'full-path' };
    }
    
    // Check if relative path matches
    if (cmdLower.includes(serverBasename)) {
      // Verify it's likely the same file by checking more context
      const serverDir = path.basename(path.dirname(serverFile)).toLowerCase();
      if (cmdLower.includes(serverDir)) {
        return { running: true, pid: proc.pid, matchType: 'basename-with-dir' };
      }
    }
  }
  
  return { running: false };
}

/**
 * Detect which servers from the list are already running
 * Uses multiple detection strategies for reliability
 * Returns array of { server, port, pid, running: true }
 */
async function detectRunningServers(servers) {
  // Get all listening ports once
  const portToPid = await getListeningPorts();
  
  // Get all node processes once
  const nodeProcesses = await getNodeProcesses();
  
  const results = [];
  
  for (const server of servers) {
    const expectedPort = getExpectedPort(server);
    let detected = {
      ...server,
      running: false,
      detectedPort: expectedPort,
      detectedPid: null,
      detectionMethod: null
    };
    
    // Strategy 1: Check if expected port is listening
    if (expectedPort) {
      const pid = portToPid.get(expectedPort);
      
      if (pid) {
        // Port is in use - check if it's Node
        const procInfo = await getProcessInfo(pid);
        const isNode = procInfo && procInfo.name.toLowerCase().includes('node');
        
        if (isNode) {
          // Verify it's this server by checking command line
          const cmdLine = await getProcessCommandLine(pid);
          const serverBasename = path.basename(server.file).toLowerCase();
          
          if (cmdLine && cmdLine.toLowerCase().includes(serverBasename)) {
            detected = {
              ...server,
              running: true,
              detectedPort: expectedPort,
              detectedPid: pid,
              detectionMethod: 'port-and-cmdline',
              commandLine: cmdLine
            };
          } else {
            // Port matches, is Node, but can't confirm it's this specific server
            // Still mark as running since port would conflict anyway
            detected = {
              ...server,
              running: true,
              detectedPort: expectedPort,
              detectedPid: pid,
              detectionMethod: 'port-only',
              commandLine: cmdLine,
              uncertain: true
            };
          }
        } else {
          // Port in use but not by Node
          detected = {
            ...server,
            running: false,
            detectedPort: expectedPort,
            detectedPid: null,
            portBlocked: true,
            blockingProcess: procInfo ? procInfo.name : 'unknown'
          };
        }
        
        results.push(detected);
        continue;
      }
    }
    
    // Strategy 2: Check if server file is in any node process command line
    const serverBasename = path.basename(server.file).toLowerCase();
    const serverDir = path.basename(path.dirname(server.file)).toLowerCase();
    
    for (const proc of nodeProcesses) {
      const cmdLower = proc.commandLine.toLowerCase();
      
      // Check for file match
      if (cmdLower.includes(serverBasename) && cmdLower.includes(serverDir)) {
        // Find what port this process is listening on
        let foundPort = null;
        for (const [port, pid] of portToPid.entries()) {
          if (pid === proc.pid) {
            foundPort = port;
            break;
          }
        }
        
        detected = {
          ...server,
          running: true,
          detectedPort: foundPort || expectedPort,
          detectedPid: proc.pid,
          detectionMethod: 'cmdline-match',
          commandLine: proc.commandLine
        };
        break;
      }
    }
    
    results.push(detected);
  }
  
  return results;
}

/**
 * Quick check if any common server ports are in use
 * Useful for startup status display
 */
async function getQuickPortStatus() {
  const commonPorts = [3000, 3001, 3002, 3003, 3004, 3100, 4800, 4900, 4950];
  const portToPid = await getListeningPorts();
  const status = {};
  
  for (const port of commonPorts) {
    const pid = portToPid.get(port);
    if (pid) {
      const procInfo = await getProcessInfo(pid);
      const isNode = procInfo && procInfo.name.toLowerCase().includes('node');
      
      let commandLine = null;
      if (isNode) {
        commandLine = await getProcessCommandLine(pid);
      }
      
      status[port] = {
        inUse: true,
        pid,
        isNode,
        processName: procInfo ? procInfo.name : 'unknown',
        commandLine
      };
    }
  }
  
  return status;
}

/**
 * Clear the process info cache
 */
function clearCache() {
  processCache.clear();
}

module.exports = {
  getExpectedPort,
  parsePortFromSource,
  getListeningPorts,
  getProcessInfo,
  getProcessCommandLine,
  getNodeProcesses,
  checkPortInUse,
  isServerFileRunning,
  detectRunningServers,
  getQuickPortStatus,
  clearCache
};
