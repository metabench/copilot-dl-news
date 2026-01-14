const fs = require('fs');
const path = require('path');
const TokenCodec = require('../../../../src/shared/codec/TokenCodec');

let cachedStdinData = null;

function readAllStdin() {
  if (cachedStdinData !== null) {
    return Promise.resolve(cachedStdinData);
  }
  return new Promise((resolve, reject) => {
    if (!process.stdin) {
      cachedStdinData = '';
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('error', (error) => {
      reject(error);
    });
    process.stdin.on('end', () => {
      cachedStdinData = data;
      resolve(data);
    });
    try {
      process.stdin.resume();
    } catch (err) {
      cachedStdinData = '';
      resolve('');
    }
  });
}

async function readSnapshotJsonInput(ref) {
  if (!ref) {
    throw new Error('Provide a snapshot file path or "-" to read from stdin.');
  }
  if (ref === '-') {
    const stdinPayload = await readAllStdin();
    if (!stdinPayload || !stdinPayload.trim()) {
      throw new Error('No match snapshot data received from stdin. Pipe js-scan JSON output into --match-snapshot -.');
    }
    try {
      return JSON.parse(stdinPayload);
    } catch (error) {
      throw new Error(`Failed to parse match snapshot JSON from stdin: ${error.message}`);
    }
  }
  const absolute = path.isAbsolute(ref) ? ref : path.resolve(process.cwd(), ref);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Match snapshot file not found: ${absolute}`);
  }
  const raw = fs.readFileSync(absolute, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse match snapshot JSON from ${absolute}: ${error.message}`);
  }
}

async function readTokenInput(ref) {
  if (!ref) {
    throw new Error('Provide a continuation token reference or "-" to read from stdin.');
  }
  if (ref === '-') {
    const stdinPayload = await readAllStdin();
    const token = typeof stdinPayload === 'string' ? stdinPayload.trim() : '';
    if (!token) {
      throw new Error('No continuation token provided via stdin. Pipe the js-scan token into --from-token -.');
    }
    return token;
  }
  const absolute = path.isAbsolute(ref) ? ref : path.resolve(process.cwd(), ref);
  if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
    const tokenFromFile = fs.readFileSync(absolute, 'utf8').trim();
    if (!tokenFromFile) {
      throw new Error(`Continuation token file ${absolute} is empty.`);
    }
    return tokenFromFile;
  }
  return ref.trim();
}

function extractMatchSnapshotPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (payload.match && typeof payload.match === 'object') {
    return payload.match;
  }
  if (payload.snapshot && typeof payload.snapshot === 'object') {
    return payload.snapshot;
  }
  if (payload.relationship && payload.relationship.entry && payload.relationship.entry.match) {
    return payload.relationship.entry.match;
  }
  if (payload.file && typeof payload.file === 'string') {
    return payload;
  }
  return null;
}

function normalizeMatchSnapshotForIngestion(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }
  const clone = { ...snapshot };
  const candidateFile = typeof clone.file === 'string' && clone.file.length > 0
    ? clone.file
    : (typeof clone.relativeFile === 'string' ? path.resolve(process.cwd(), clone.relativeFile) : null);
  if (candidateFile) {
    clone.file = path.isAbsolute(candidateFile) ? candidateFile : path.resolve(process.cwd(), candidateFile);
    clone.relativeFile = clone.relativeFile || path.relative(process.cwd(), clone.file);
  }
  return clone;
}

function deriveSnapshotHints(snapshot) {
  const hints = {
    selector: null,
    selectHash: null,
    selectIndex: null,
    selectPath: null,
    expectHash: null
  };
  if (!snapshot || typeof snapshot !== 'object') {
    return hints;
  }
  const plan = snapshot.jsEditHint && snapshot.jsEditHint.plan ? snapshot.jsEditHint.plan : null;
  if (plan) {
    if (plan.selector && typeof plan.selector === 'string') {
      hints.selector = plan.selector;
    }
    if (plan.select && typeof plan.select === 'string') {
      const selectValue = plan.select.trim();
      const lower = selectValue.toLowerCase();
      if (lower.startsWith('hash:')) {
        hints.selectHash = selectValue.slice(selectValue.indexOf(':') + 1).trim();
      } else if (/^\d+$/.test(selectValue)) {
        hints.selectIndex = parseInt(selectValue, 10);
      } else if (lower.startsWith('path:')) {
        hints.selectPath = selectValue;
      }
    }
    if (plan.expectHash && typeof plan.expectHash === 'string') {
      hints.expectHash = plan.expectHash;
    }
  }

  if (!hints.selector) {
    if (snapshot.canonicalName) {
      hints.selector = snapshot.canonicalName;
    } else if (snapshot.name) {
      hints.selector = snapshot.name;
    } else if (snapshot.hash) {
      hints.selector = `hash:${snapshot.hash}`;
    }
  }

  if (!hints.selectHash && snapshot.hash) {
    hints.selectHash = snapshot.hash;
  }

  if (!hints.expectHash && snapshot.hash) {
    hints.expectHash = snapshot.hash;
  }

  return hints;
}

function findRepositoryRoot(startDir) {
  let currentDir = path.resolve(startDir);
  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'package.json')) || fs.existsSync(path.join(currentDir, '.git'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return startDir;
}

async function hydrateMatchSnapshotContext(options) {
  if (!options.matchSnapshotInput && !options.fromTokenInput) {
    return;
  }

  let rawPayload;
  let ingestSource = 'snapshot';
  let tokenMetadata = null;

  if (options.matchSnapshotInput) {
    rawPayload = await readSnapshotJsonInput(options.matchSnapshotInput);
  } else {
    ingestSource = 'token';
    const tokenString = await readTokenInput(options.fromTokenInput);
    let decoded;
    try {
      decoded = TokenCodec.decode(tokenString);
    } catch (error) {
      throw new Error(`Failed to decode continuation token: ${error.message}`);
    }
    const repoRoot = findRepositoryRoot(process.cwd());
    const secretKey = TokenCodec.deriveSecretKey({ repo_root: repoRoot });
    const validation = TokenCodec.validate(decoded, { secret_key: secretKey });
    if (!validation.valid) {
      throw new Error(validation.error || 'Continuation token validation failed.');
    }
    rawPayload = decoded.payload && decoded.payload.parameters
      ? { match: decoded.payload.parameters.match }
      : null;
    tokenMetadata = {
      tokenId: decoded._token_id || null,
      action: decoded.payload ? decoded.payload.action : null,
      requestId: decoded.payload && decoded.payload.context ? decoded.payload.context.request_id : null
    };
  }

  const snapshot = normalizeMatchSnapshotForIngestion(extractMatchSnapshotPayload(rawPayload));
  if (!snapshot || !snapshot.file) {
    throw new Error('Match snapshot payload is missing file metadata. Re-run js-scan --continuation --json to refresh tokens.');
  }

  if (!fs.existsSync(snapshot.file)) {
    throw new Error(`Snapshot target file not found: ${snapshot.file}`);
  }

  const hints = deriveSnapshotHints(snapshot);
  if (!hints.selector) {
    throw new Error('Snapshot missing selector hints; rerun js-scan with --ai-mode to capture canonical selectors.');
  }

  if (options.filePath) {
    const normalizedFile = path.isAbsolute(options.filePath)
      ? options.filePath
      : path.resolve(process.cwd(), options.filePath);
    if (path.normalize(normalizedFile) !== path.normalize(snapshot.file)) {
      throw new Error(`Snapshot points to ${snapshot.file}, but --file was set to ${options.filePath}. Run the command without --file or provide the matching path.`);
    }
    options.filePath = normalizedFile;
  } else {
    options.filePath = snapshot.file;
  }
  options.matchSnapshotContext = {
    snapshot,
    selector: hints.selector,
    selectHash: hints.selectHash,
    selectIndex: hints.selectIndex,
    selectPath: hints.selectPath,
    expectHash: hints.expectHash,
    source: ingestSource,
    tokenMetadata,
    warnings: []
  };

  if (!options.selectHash && hints.selectHash) {
    options.selectHash = hints.selectHash;
  }
  if (!options.selectIndex && typeof hints.selectIndex === 'number') {
    options.selectIndex = hints.selectIndex;
  }
  if (!options.selectPath && hints.selectPath) {
    options.selectPath = hints.selectPath;
  }
  if (!options.expectHash && hints.expectHash) {
    options.expectHash = hints.expectHash;
  }
}

module.exports = {
  readSnapshotJsonInput,
  readTokenInput,
  extractMatchSnapshotPayload,
  normalizeMatchSnapshotForIngestion,
  deriveSnapshotHints,
  hydrateMatchSnapshotContext
};

