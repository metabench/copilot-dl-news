"use strict";

/**
 * Unit Tests for serverDetector.js
 * 
 * Tests the pure functions and parsing logic in serverDetector.
 * Mocks system calls (exec) for predictable testing.
 */

const path = require('path');
const fs = require('fs');

// Mock child_process.exec before requiring the module
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

const { exec } = require('child_process');
const serverDetector = require('../../lib/serverDetector');

describe('serverDetector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    serverDetector.clearCache();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getExpectedPort
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getExpectedPort', () => {
    it('should return port from metadata if available', () => {
      const server = {
        file: '/some/path/server.js',
        metadata: { defaultPort: 8080 }
      };
      expect(serverDetector.getExpectedPort(server)).toBe(8080);
    });

    it('should return port from pattern matching for artPlayground', () => {
      const server = {
        file: 'src/ui/server/artPlayground/server.js'
      };
      expect(serverDetector.getExpectedPort(server)).toBe(4950);
    });

    it('should return port from pattern matching for dataExplorer', () => {
      const server = {
        file: 'src/ui/server/dataExplorerServer.js'
      };
      expect(serverDetector.getExpectedPort(server)).toBe(3000);
    });

    it('should return port from pattern matching for diagramAtlas', () => {
      const server = {
        file: 'src/ui/server/diagramAtlasServer.js'
      };
      expect(serverDetector.getExpectedPort(server)).toBe(3001);
    });

    it('should return port from pattern matching using relativeFile', () => {
      const server = {
        file: '/absolute/path/server.js',
        relativeFile: 'src/ui/server/gazetteerInfo/server.js'
      };
      expect(serverDetector.getExpectedPort(server)).toBe(3004);
    });

    it('should return null for unknown server', () => {
      const server = {
        file: 'src/unknown/mystery-server.js'
      };
      expect(serverDetector.getExpectedPort(server)).toBe(null);
    });

    it('should prioritize metadata over pattern matching', () => {
      const server = {
        file: 'src/ui/server/artPlayground/server.js',
        metadata: { defaultPort: 9999 }
      };
      expect(serverDetector.getExpectedPort(server)).toBe(9999);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // parsePortFromSource
  // ═══════════════════════════════════════════════════════════════════════════

  describe('parsePortFromSource', () => {
    const tmpDir = path.join(__dirname, '..', '..', 'tmp-test');
    
    beforeAll(() => {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    });

    afterAll(() => {
      // Clean up temp files
      if (fs.existsSync(tmpDir)) {
        const files = fs.readdirSync(tmpDir);
        for (const file of files) {
          fs.unlinkSync(path.join(tmpDir, file));
        }
        fs.rmdirSync(tmpDir);
      }
    });

    it('should parse @port annotation', () => {
      const filePath = path.join(tmpDir, 'test-annotation.js');
      fs.writeFileSync(filePath, `
        /**
         * @port 4500
         */
        const express = require('express');
        app.listen(PORT);
      `);
      expect(serverDetector.parsePortFromSource(filePath)).toBe(4500);
    });

    it('should parse DEFAULT_PORT constant', () => {
      const filePath = path.join(tmpDir, 'test-default-port.js');
      fs.writeFileSync(filePath, `
        const DEFAULT_PORT = 3500;
        app.listen(DEFAULT_PORT);
      `);
      expect(serverDetector.parsePortFromSource(filePath)).toBe(3500);
    });

    it('should parse PORT constant with env fallback', () => {
      const filePath = path.join(tmpDir, 'test-port-env.js');
      fs.writeFileSync(filePath, `
        const PORT = process.env.PORT || 4000;
        app.listen(PORT);
      `);
      expect(serverDetector.parsePortFromSource(filePath)).toBe(4000);
    });

    it('should parse simple PORT constant', () => {
      const filePath = path.join(tmpDir, 'test-port-simple.js');
      fs.writeFileSync(filePath, `
        const PORT = 5000;
        app.listen(PORT);
      `);
      expect(serverDetector.parsePortFromSource(filePath)).toBe(5000);
    });

    it('should parse .listen() with literal port', () => {
      const filePath = path.join(tmpDir, 'test-listen.js');
      fs.writeFileSync(filePath, `
        const app = express();
        app.listen(6000, () => console.log('Running'));
      `);
      expect(serverDetector.parsePortFromSource(filePath)).toBe(6000);
    });

    it('should parse .listen() with port only', () => {
      const filePath = path.join(tmpDir, 'test-listen-only.js');
      fs.writeFileSync(filePath, `
        server.listen(7000);
      `);
      expect(serverDetector.parsePortFromSource(filePath)).toBe(7000);
    });

    it('should prioritize @port over other patterns', () => {
      const filePath = path.join(tmpDir, 'test-priority.js');
      fs.writeFileSync(filePath, `
        /**
         * @port 1111
         */
        const DEFAULT_PORT = 2222;
        const PORT = 3333;
        app.listen(4444);
      `);
      expect(serverDetector.parsePortFromSource(filePath)).toBe(1111);
    });

    it('should return null for non-existent file', () => {
      expect(serverDetector.parsePortFromSource('/does/not/exist.js')).toBe(null);
    });

    it('should return null for file without port', () => {
      const filePath = path.join(tmpDir, 'test-no-port.js');
      fs.writeFileSync(filePath, `
        const express = require('express');
        const app = express();
        module.exports = app;
      `);
      expect(serverDetector.parsePortFromSource(filePath)).toBe(null);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getListeningPorts (mocked)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getListeningPorts', () => {
    it('should parse IPv4 netstat output', async () => {
      const mockNetstat = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1234
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       5678
  TCP    127.0.0.1:4950         0.0.0.0:0              LISTENING       9999
  TCP    192.168.1.1:80         0.0.0.0:0              LISTENING       1111
`;
      exec.mockImplementation((cmd, opts, callback) => {
        callback(null, mockNetstat, '');
      });

      const ports = await serverDetector.getListeningPorts();
      
      expect(ports.get(135)).toBe(1234);
      expect(ports.get(3000)).toBe(5678);
      expect(ports.get(4950)).toBe(9999);
      expect(ports.get(80)).toBe(1111);
    });

    it('should parse IPv6 netstat output', async () => {
      const mockNetstat = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    [::]:3000              [::]:0                 LISTENING       5678
  TCP    [::1]:4950             [::]:0                 LISTENING       9999
`;
      exec.mockImplementation((cmd, opts, callback) => {
        callback(null, mockNetstat, '');
      });

      const ports = await serverDetector.getListeningPorts();
      
      expect(ports.get(3000)).toBe(5678);
      expect(ports.get(4950)).toBe(9999);
    });

    it('should return empty map on error', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        callback(new Error('Command failed'), '', '');
      });

      const ports = await serverDetector.getListeningPorts();
      expect(ports.size).toBe(0);
    });

    it('should not overwrite IPv4 with IPv6 for same port', async () => {
      const mockNetstat = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1111
  TCP    [::]:3000              [::]:0                 LISTENING       2222
`;
      exec.mockImplementation((cmd, opts, callback) => {
        callback(null, mockNetstat, '');
      });

      const ports = await serverDetector.getListeningPorts();
      // First entry (IPv4) should win
      expect(ports.get(3000)).toBe(1111);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getProcessInfo (mocked)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getProcessInfo', () => {
    it('should parse tasklist CSV output for node process', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        callback(null, '"node.exe","12345","Console","1","50,000 K"\r\n', '');
      });

      const info = await serverDetector.getProcessInfo(12345);
      
      expect(info).toEqual({
        name: 'node.exe',
        pid: 12345
      });
    });

    it('should return null for non-existent PID', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        callback(null, 'INFO: No tasks are running which match the specified criteria.', '');
      });

      const info = await serverDetector.getProcessInfo(99999);
      expect(info).toBe(null);
    });

    it('should use cache for repeated calls', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        callback(null, '"node.exe","12345","Console","1","50,000 K"\r\n', '');
      });

      // First call
      await serverDetector.getProcessInfo(12345);
      // Second call (should use cache)
      await serverDetector.getProcessInfo(12345);
      
      // exec should only be called once
      expect(exec).toHaveBeenCalledTimes(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getProcessCommandLine (mocked)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getProcessCommandLine', () => {
    it('should parse wmic output', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        callback(null, '\r\nCommandLine=node src/ui/server/artPlayground/server.js\r\n\r\n', '');
      });

      const cmdLine = await serverDetector.getProcessCommandLine(12345);
      expect(cmdLine).toBe('node src/ui/server/artPlayground/server.js');
    });

    it('should return null on error', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        callback(new Error('Access denied'), '', '');
      });

      const cmdLine = await serverDetector.getProcessCommandLine(12345);
      expect(cmdLine).toBe(null);
    });

    it('should return null for empty output', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        callback(null, '', '');
      });

      const cmdLine = await serverDetector.getProcessCommandLine(12345);
      expect(cmdLine).toBe(null);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getNodeProcesses (mocked)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getNodeProcesses', () => {
    it('should parse wmic CSV output', async () => {
      const mockOutput = `Node,CommandLine,ProcessId
DESKTOP-ABC,node src/server1.js,1111
DESKTOP-ABC,node src/server2.js --port 3000,2222
`;
      exec.mockImplementation((cmd, opts, callback) => {
        callback(null, mockOutput, '');
      });

      const processes = await serverDetector.getNodeProcesses();
      
      expect(processes).toHaveLength(2);
      expect(processes[0]).toEqual({
        pid: 1111,
        commandLine: 'node src/server1.js'
      });
      expect(processes[1]).toEqual({
        pid: 2222,
        commandLine: 'node src/server2.js --port 3000'
      });
    });

    it('should return empty array on error', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        callback(new Error('Failed'), '', '');
      });

      const processes = await serverDetector.getNodeProcesses();
      expect(processes).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // checkPortInUse (mocked)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('checkPortInUse', () => {
    it('should return inUse: false for free port', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        // Empty netstat
        callback(null, 'Active Connections\n\n', '');
      });

      const result = await serverDetector.checkPortInUse(9999);
      expect(result.inUse).toBe(false);
    });

    it('should detect port in use by node', async () => {
      let callCount = 0;
      exec.mockImplementation((cmd, opts, callback) => {
        callCount++;
        if (cmd.includes('netstat')) {
          callback(null, '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234\n', '');
        } else if (cmd.includes('tasklist')) {
          callback(null, '"node.exe","1234","Console","1","50,000 K"\r\n', '');
        } else if (cmd.includes('wmic')) {
          callback(null, 'CommandLine=node server.js\r\n', '');
        }
      });

      const result = await serverDetector.checkPortInUse(3000);
      
      expect(result.inUse).toBe(true);
      expect(result.pid).toBe(1234);
      expect(result.isNode).toBe(true);
      expect(result.commandLine).toBe('node server.js');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // detectRunningServers (mocked)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('detectRunningServers', () => {
    it('should detect server running on expected port', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        if (cmd.includes('netstat')) {
          callback(null, '  TCP    0.0.0.0:4950           0.0.0.0:0              LISTENING       5678\n', '');
        } else if (cmd.includes('tasklist')) {
          callback(null, '"node.exe","5678","Console","1","50,000 K"\r\n', '');
        } else if (cmd.includes('wmic') && cmd.includes('ProcessId=5678')) {
          callback(null, 'CommandLine=node src/ui/server/artPlayground/server.js\r\n', '');
        } else if (cmd.includes('wmic')) {
          callback(null, '', '');
        }
      });

      const servers = [
        { file: 'src/ui/server/artPlayground/server.js', metadata: { defaultPort: 4950 } }
      ];

      const results = await serverDetector.detectRunningServers(servers);
      
      expect(results).toHaveLength(1);
      expect(results[0].running).toBe(true);
      expect(results[0].detectedPort).toBe(4950);
      expect(results[0].detectedPid).toBe(5678);
      expect(results[0].detectionMethod).toBe('port-and-cmdline');
    });

    it('should mark server as not running when port is free', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        if (cmd.includes('netstat')) {
          callback(null, 'Active Connections\n\n', '');
        } else if (cmd.includes('wmic')) {
          callback(null, 'Node,CommandLine,ProcessId\n', '');
        }
      });

      const servers = [
        { file: 'src/ui/server/artPlayground/server.js', metadata: { defaultPort: 4950 } }
      ];

      const results = await serverDetector.detectRunningServers(servers);
      
      expect(results).toHaveLength(1);
      expect(results[0].running).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getQuickPortStatus (mocked)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getQuickPortStatus', () => {
    it('should return status for common ports', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        if (cmd.includes('netstat')) {
          callback(null, `
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1111
  TCP    0.0.0.0:4950           0.0.0.0:0              LISTENING       2222
`, '');
        } else if (cmd.includes('tasklist') && cmd.includes('1111')) {
          callback(null, '"node.exe","1111","Console","1","50,000 K"\r\n', '');
        } else if (cmd.includes('tasklist') && cmd.includes('2222')) {
          callback(null, '"python.exe","2222","Console","1","30,000 K"\r\n', '');
        } else if (cmd.includes('wmic') && cmd.includes('1111')) {
          callback(null, 'CommandLine=node dataExplorer.js\r\n', '');
        } else {
          callback(null, '', '');
        }
      });

      const status = await serverDetector.getQuickPortStatus();
      
      expect(status[3000]).toBeDefined();
      expect(status[3000].inUse).toBe(true);
      expect(status[3000].isNode).toBe(true);
      
      expect(status[4950]).toBeDefined();
      expect(status[4950].inUse).toBe(true);
      expect(status[4950].isNode).toBe(false);
      expect(status[4950].processName).toBe('python.exe');
      
      // Port 3001 not in use
      expect(status[3001]).toBeUndefined();
    });
  });
});
