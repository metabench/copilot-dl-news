#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { setupPowerShellEncoding } = require('./shared/powershellEncoding');
setupPowerShellEncoding();

const { CliFormatter } = require('../../src/utils/CliFormatter');
const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');

const fmt = new CliFormatter();

function createParser() {
  const parser = new CliArgumentParser(
    'js-server-scan',
    'Scan workspace for JavaScript server entry points'
  );

  parser
    .add('--dir <path>', 'Directory to scan (default: current directory)', process.cwd())
    .add('--json', 'Emit JSON output', false, 'boolean')
    .add('--verbose', 'Show detailed scoring info', false, 'boolean')
    .add('--html-only', 'Only show servers with HTML interfaces', false, 'boolean')
    .add('--progress', 'Emit progress events (JSON lines) during scan', false, 'boolean');

  return parser;
}

const SERVER_INDICATORS = [
  { pattern: /\.listen\s*\(/, score: 5, reason: 'Calls .listen()' },
  { pattern: /http\.createServer\s*\(/, score: 5, reason: 'Calls http.createServer()' },
  { pattern: /https\.createServer\s*\(/, score: 5, reason: 'Calls https.createServer()' },
  { pattern: /require\(['"]express['"]\)/, score: 2, reason: 'Imports express' },
  { pattern: /require\(['"]koa['"]\)/, score: 2, reason: 'Imports koa' },
  { pattern: /require\(['"]fastify['"]\)/, score: 2, reason: 'Imports fastify' },
  { pattern: /require\(['"]http['"]\)/, score: 1, reason: 'Imports http' },
  { pattern: /require\(['"]https['"]\)/, score: 1, reason: 'Imports https' },
  { pattern: /process\.env\.PORT/, score: 1, reason: 'References process.env.PORT' },
];

// Indicators for servers that serve HTML/UI interfaces
const HTML_INTERFACE_INDICATORS = [
  { pattern: /\.sendFile\s*\(/, score: 3, reason: 'Serves files via sendFile' },
  { pattern: /\.render\s*\(/, score: 3, reason: 'Renders templates' },
  { pattern: /res\.send\s*\([^)]*<html/i, score: 4, reason: 'Sends HTML content' },
  { pattern: /text\/html/, score: 2, reason: 'Sets text/html content type' },
  { pattern: /\.html\s*\(/, score: 2, reason: 'Uses .html() method' },
  { pattern: /express\.static\s*\(/, score: 3, reason: 'Serves static files' },
  { pattern: /\.use\s*\(\s*['"]\/['"]?\s*,?\s*express\.static/, score: 3, reason: 'Mounts static middleware' },
  { pattern: /index\.html/, score: 2, reason: 'References index.html' },
  { pattern: /\.ejs|\.pug|\.hbs|\.handlebars/, score: 2, reason: 'Uses template engine' },
  { pattern: /jsgui/, score: 3, reason: 'Uses jsgui framework' },
  { pattern: /all_html_render/, score: 4, reason: 'Renders HTML via jsgui' },
  { pattern: /@ui\s+true|@html\s+true|@interface\s+html/i, score: 5, reason: 'Annotated as UI server' },
];

const FILENAME_INDICATORS = [
  { pattern: /Server\.js$/i, score: 3, reason: 'Filename ends in Server.js' },
  { pattern: /^server\.js$/i, score: 3, reason: 'Filename is server.js' },
  { pattern: /app\.js$/i, score: 1, reason: 'Filename is app.js' },
];

function analyzeFile(fileRecord) {
  const source = fileRecord.source;
  const filename = path.basename(fileRecord.filePath);
  let score = 0;
  let htmlInterfaceScore = 0;
  const reasons = [];
  const htmlReasons = [];

  // Check source code patterns
  for (const indicator of SERVER_INDICATORS) {
    if (indicator.pattern.test(source)) {
      score += indicator.score;
      reasons.push(indicator.reason);
    }
  }

  // Check HTML interface patterns
  for (const indicator of HTML_INTERFACE_INDICATORS) {
    if (indicator.pattern.test(source)) {
      htmlInterfaceScore += indicator.score;
      htmlReasons.push(indicator.reason);
    }
  }

  // Check filename patterns
  for (const indicator of FILENAME_INDICATORS) {
    if (indicator.pattern.test(filename)) {
      score += indicator.score;
      reasons.push(indicator.reason);
    }
  }

  // Extract metadata from comments
  // Supports:
  // @server Name
  // @description Description
  // @ui true (marks as HTML interface)
  // @port 3000 (default port)
  const nameMatch = source.match(/@server\s+(.+)/);
  const descMatch = source.match(/@description\s+(.+)/);
  const uiMatch = source.match(/@ui\s+(true|false)/i);
  const portMatch = source.match(/@port\s+(\d+)/);
  
  const metadata = {
    name: nameMatch ? nameMatch[1].trim() : null,
    description: descMatch ? descMatch[1].trim() : null,
    hasHtmlInterface: uiMatch ? uiMatch[1].toLowerCase() === 'true' : null,
    defaultPort: portMatch ? parseInt(portMatch[1], 10) : null
  };

  // If explicitly marked as UI server, boost HTML score
  if (metadata.hasHtmlInterface === true) {
    htmlInterfaceScore += 10;
    htmlReasons.push('Explicitly marked @ui true');
  }

  // Heuristic: If it has .listen() AND (express OR http), it's very likely a server
  const hasListen = reasons.some(r => r.includes('.listen()'));
  const hasFramework = reasons.some(r => r.includes('express') || r.includes('koa') || r.includes('fastify') || r.includes('http.createServer'));

  if (hasListen && hasFramework) {
    score += 5;
    reasons.push('High confidence combination (.listen + framework)');
  }

  // Determine if this is likely an HTML interface server
  const hasHtmlInterface = metadata.hasHtmlInterface === true || htmlInterfaceScore >= 3;

  return {
    file: fileRecord.filePath,
    relativeFile: path.relative(process.cwd(), fileRecord.filePath),
    score,
    htmlInterfaceScore,
    hasHtmlInterface,
    reasons,
    htmlReasons,
    metadata
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESS EMITTER - Debounced at 17ms (60fps max)
// ═══════════════════════════════════════════════════════════════════════════

class ProgressEmitter {
  constructor(debounceMs = 17) {
    this._debounceMs = debounceMs;
    this._lastEmitTime = 0;
    this._pending = null;
  }

  emit(data) {
    const now = Date.now();
    const elapsed = now - this._lastEmitTime;

    // Always emit immediately for "count" (first) and "result" (final) messages
    if (data.type === 'count' || data.type === 'result') {
      this._flush(); // Flush any pending progress first
      console.log(JSON.stringify(data));
      this._lastEmitTime = now;
      return;
    }

    // For progress messages, debounce
    if (elapsed >= this._debounceMs) {
      console.log(JSON.stringify(data));
      this._lastEmitTime = now;
      this._pending = null;
    } else {
      // Store as pending - will be emitted on next opportunity or at end
      this._pending = data;
    }
  }

  _flush() {
    if (this._pending) {
      console.log(JSON.stringify(this._pending));
      this._pending = null;
      this._lastEmitTime = Date.now();
    }
  }

  finish() {
    this._flush();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE DISCOVERY - Count files before scanning
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_EXTENSIONS = ['.js', '.cjs', '.mjs', '.jsx'];
const DEFAULT_EXCLUDES = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.idea',
  '.vscode',
  'coverage',
  'dist',
  'build',
  'tmp',
  'logs',
  'deprecated-ui',
  'deprecated-ui-root',
  'public/assets',
  'screenshots'
];

function discoverJsFiles(rootDir, excludes = DEFAULT_EXCLUDES, extensions = DEFAULT_EXTENSIONS, progressEmitter = null) {
  const files = [];
  let lastEmit = Date.now();
  const emitIntervalMs = 125;
  
  function maybeEmitCount(relativePath) {
    if (!progressEmitter) return;
    const now = Date.now();
    if (now - lastEmit >= emitIntervalMs) {
      progressEmitter.emit({ type: 'count-progress', current: files.length, file: relativePath });
      lastEmit = now;
    }
  }
  
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);
      
      // Check exclusions
      const segments = relativePath.split(/[/\\]/);
      const shouldExclude = excludes.some(pattern => 
        segments.includes(pattern) || relativePath.includes(pattern)
      );
      
      if (shouldExclude) continue;
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
          maybeEmitCount(relativePath);
        }
      }
    }
  }
  
  walk(rootDir);
  // Emit a final count-progress in case the tree was small and never emitted
  if (progressEmitter) {
    progressEmitter.emit({ type: 'count-progress', current: files.length, file: null });
  }
  return files;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

function main() {
  const parser = createParser();
  const options = parser.parse(process.argv);

  if (options.help) {
    console.log(parser.getProgram().helpInformation());
    return;
  }

  const rootDir = path.resolve(options.dir);
  
  // Progress mode: emit JSON lines with debouncing
  if (options.progress) {
    const emitter = new ProgressEmitter(17); // 17ms = ~60fps
    
    // Phase 1: Count files first (with live progress)
    emitter.emit({ type: 'count-start' });
    const files = discoverJsFiles(rootDir, DEFAULT_EXCLUDES, DEFAULT_EXTENSIONS, emitter);
    emitter.emit({ type: 'count', total: files.length });
    
    // Phase 2: Scan and analyze each file with progress
    let servers = [];
    let current = 0;
    
    for (const filePath of files) {
      current++;
      const relativePath = path.relative(rootDir, filePath);
      
      // Emit progress
      emitter.emit({ 
        type: 'progress', 
        current, 
        total: files.length, 
        file: relativePath 
      });
      
      // Read and analyze file
      let source;
      try {
        source = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }
      
      const fileRecord = { filePath, source };
      const analysis = analyzeFile(fileRecord);
      
      if (analysis.score >= 3) {
        servers.push(analysis);
      }
    }
    
    // Filter to HTML-only if requested
    if (options.htmlOnly) {
      servers = servers.filter(s => s.hasHtmlInterface);
    }
    
    // Sort by score descending
    servers.sort((a, b) => b.score - a.score);
    
    // Emit final result
    emitter.finish();
    emitter.emit({ type: 'result', servers });
    return;
  }

  // Standard mode: use the scanner library
  try {
    const { scanWorkspace } = require('./js-scan/shared/scanner');
    
    const scanResult = scanWorkspace({
      dir: options.dir,
      rootDir: options.dir,
      includeDeprecated: false,
      deprecatedOnly: false,
      followDependencies: false
    });

    let servers = [];

    for (const fileRecord of scanResult.files) {
      const analysis = analyzeFile(fileRecord);
      if (analysis.score >= 3) { // Threshold for considering it a server candidate
        servers.push(analysis);
      }
    }

    // Filter to HTML-only if requested
    if (options.htmlOnly) {
      servers = servers.filter(s => s.hasHtmlInterface);
    }

    // Sort by score descending
    servers.sort((a, b) => b.score - a.score);

    if (options.json) {
      console.log(JSON.stringify(servers, null, 2));
    } else {
      fmt.header('Detected Server Entry Points');
      if (servers.length === 0) {
        fmt.warn('No servers detected.');
      } else {
        servers.forEach(server => {
          const scoreColor = server.score > 7 ? fmt.COLORS.success : (server.score > 4 ? fmt.COLORS.accent : fmt.COLORS.muted);
          console.log(`${scoreColor(`[Score: ${server.score}]`)} ${fmt.COLORS.bold(server.relativeFile)}`);
          if (options.verbose) {
            server.reasons.forEach(reason => {
              console.log(`  - ${fmt.COLORS.muted(reason)}`);
            });
          }
        });
      }
      fmt.footer();
    }

  } catch (error) {
    fmt.error(error.message);
    process.exit(1);
  }
}

main();
