'use strict';

const path = require('path');
const {
  HASH_LENGTH_BY_ENCODING,
  HASH_CHARSETS,
  HASH_PRIMARY_ENCODING,
  HASH_FALLBACK_ENCODING
} = require('../../shared/hashConfig');

function normalizeKey(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\\/g, '/');
}

function isHashLike(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  const encodings = new Set([HASH_PRIMARY_ENCODING, HASH_FALLBACK_ENCODING].filter(Boolean));
  for (const encoding of encodings) {
    const expectedLength = HASH_LENGTH_BY_ENCODING[encoding];
    const charset = HASH_CHARSETS[encoding];
    if (typeof expectedLength === 'number' && expectedLength > 0 && charset?.test(trimmed) && trimmed.length === expectedLength) {
      return true;
    }
  }

  return false;
}

function createNode(file) {
  return {
    file,
    exists: false,
    record: null,
    outgoing: new Map(),
    incoming: new Map()
  };
}

function ensureNode(graph, file) {
  const key = normalizeKey(file);
  if (!graph.has(key)) {
    graph.set(key, createNode(key));
  }
  return graph.get(key);
}

function addEdge(graph, sourceKey, targetKey, kind) {
  if (!targetKey || !sourceKey) {
    return;
  }

  const source = ensureNode(graph, sourceKey);
  const target = ensureNode(graph, targetKey);

  const kindKey = kind === 'require' ? 'require' : 'import';

  const edge = source.outgoing.get(target.file) || { import: 0, require: 0 };
  edge[kindKey] += 1;
  source.outgoing.set(target.file, edge);

  const reverse = target.incoming.get(source.file) || { import: 0, require: 0 };
  reverse[kindKey] += 1;
  target.incoming.set(source.file, reverse);
}

function mergeEdgeCounts(base, increment) {
  const result = base ? { import: base.import || 0, require: base.require || 0 } : { import: 0, require: 0 };
  if (increment) {
    result.import += increment.import || 0;
    result.require += increment.require || 0;
  }
  return result;
}

function buildDependencyGraph(files = []) {
  const graph = new Map();

  const records = Array.isArray(files) ? files : [];
  records.forEach((record) => {
    if (!record || typeof record !== 'object') {
      return;
    }

    const fileKey = normalizeKey(record.relativePath || record.filePath || '');
    if (!fileKey) {
      return;
    }

    const node = ensureNode(graph, fileKey);
    node.exists = true;
    node.record = record;

    const resolved = record.resolvedDependencies || {};
    const importTargets = Array.isArray(resolved.imports) ? resolved.imports : [];
    const requireTargets = Array.isArray(resolved.requires) ? resolved.requires : [];

    importTargets.forEach((target) => {
      const normalizedTarget = normalizeKey(target);
      if (!normalizedTarget) {
        return;
      }
      addEdge(graph, fileKey, normalizedTarget, 'import');
    });

    requireTargets.forEach((target) => {
      const normalizedTarget = normalizeKey(target);
      if (!normalizedTarget) {
        return;
      }
      addEdge(graph, fileKey, normalizedTarget, 'require');
    });
  });

  return {
    nodes: Array.from(graph.values()),
    byFile: graph
  };
}

function selectTargetRecord(files, query, rootDir) {
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('Please provide a file path or function hash with --deps-of.');
  }

  const normalizedQuery = normalizeKey(query.trim());
  const records = Array.isArray(files) ? files : [];

  let match = records.find((record) => normalizeKey(record.relativePath) === normalizedQuery);
  if (match) {
    return { record: match, matchedBy: 'exact-path' };
  }

  if (path.isAbsolute(query)) {
    const absMatch = records.find((record) => path.resolve(record.filePath) === path.resolve(query));
    if (absMatch) {
      return { record: absMatch, matchedBy: 'absolute-path' };
    }
  }

  if (rootDir) {
    const absoluteCandidate = path.resolve(rootDir, query);
    const absMatch = records.find((record) => path.resolve(record.filePath) === absoluteCandidate);
    if (absMatch) {
      return { record: absMatch, matchedBy: 'relative-path' };
    }
  }

  const suffixMatches = records.filter((record) => normalizeKey(record.relativePath).endsWith(normalizedQuery));
  if (suffixMatches.length === 1) {
    return { record: suffixMatches[0], matchedBy: 'suffix' };
  }
  if (suffixMatches.length > 1) {
    throw new Error(`Multiple files match '${query}'. Use a more specific path.`);
  }

  if (isHashLike(query)) {
    const hashMatches = [];
    records.forEach((record) => {
      if (!Array.isArray(record.functions)) {
        return;
      }
      record.functions.forEach((fn) => {
        if (fn && fn.hash && typeof fn.hash === 'string' && fn.hash.toLowerCase() === query.toLowerCase()) {
          hashMatches.push({ record, function: fn });
        }
      });
    });

    if (hashMatches.length === 1) {
      return {
        record: hashMatches[0].record,
        matchedBy: 'function-hash',
        function: hashMatches[0].function
      };
    }

    if (hashMatches.length > 1) {
      throw new Error(`Hash '${query}' belongs to multiple files.`);
    }
  }

  throw new Error(`Could not find a file matching '${query}'.`);
}

function edgeCountsToRow(targetKey, counts, hop, via, graph) {
  const node = graph.byFile.get(targetKey);
  const record = node ? node.record : null;
  const total = (counts.import || 0) + (counts.require || 0);

  return {
    file: targetKey,
    importCount: counts.import || 0,
    requireCount: counts.require || 0,
    total,
    hop,
    via: hop > 1 ? via || '' : '',
    exists: Boolean(node && node.exists),
    entryPoint: Boolean(record && record.entryPoint),
    priority: Boolean(record && record.priority)
  };
}

function collectDirection(graph, startKey, direction, options = {}) {
  const maxDepth = typeof options.depth === 'number' && options.depth > 0 ? options.depth : Infinity;
  const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : Infinity;

  const startNode = graph.byFile.get(startKey) || createNode(startKey);
  const adjacency = direction === 'incoming' ? startNode.incoming : startNode.outgoing;
  const resultMap = new Map();
  const bestHop = new Map();
  bestHop.set(startKey, 0);

  const queue = [];

  const enqueue = (targetKey, counts, hop, viaSeed) => {
    if (!targetKey || targetKey === startKey) {
      return;
    }
    const existingHop = bestHop.get(targetKey);
    if (existingHop !== undefined && existingHop <= hop) {
      // Keep earliest hop; merge counts if same hop for clarity
      const existingRow = resultMap.get(targetKey);
      if (existingRow && existingRow.hop === hop) {
        const mergedCounts = mergeEdgeCounts({
          import: existingRow.importCount,
          require: existingRow.requireCount
        }, counts);
        const mergedRow = edgeCountsToRow(targetKey, mergedCounts, hop, viaSeed, graph);
        resultMap.set(targetKey, mergedRow);
      }
      return;
    }

    bestHop.set(targetKey, hop);
    const viaDisplay = hop > 1 ? viaSeed : '';
    const row = edgeCountsToRow(targetKey, counts, hop, viaDisplay, graph);
    resultMap.set(targetKey, row);

    if (hop < maxDepth) {
      queue.push({ key: targetKey, hop, viaSeed: viaSeed || targetKey });
    }
  };

  adjacency.forEach((counts, targetKey) => {
    enqueue(targetKey, counts, 1, targetKey);
  });

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }
    if (next.hop >= maxDepth) {
      continue;
    }

    const node = graph.byFile.get(next.key);
    if (!node) {
      continue;
    }
    const nextAdjacency = direction === 'incoming' ? node.incoming : node.outgoing;
    nextAdjacency.forEach((counts, targetKey) => {
      enqueue(targetKey, counts, next.hop + 1, next.viaSeed);
    });
  }

  const rows = Array.from(resultMap.values());
  rows.sort((a, b) => {
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    if (a.hop !== b.hop) {
      return a.hop - b.hop;
    }
    return a.file.localeCompare(b.file);
  });

  if (rows.length > limit) {
    return rows.slice(0, limit);
  }

  return rows;
}

function computeFanCount(map) {
  let total = 0;
  map.forEach((counts) => {
    total += (counts.import || 0) + (counts.require || 0);
  });
  return total;
}

function runDependencySummary(files, query, options = {}) {
  const { record, matchedBy, function: matchedFunction } = selectTargetRecord(files, query, options.rootDir || options.dir);
  const graph = buildDependencyGraph(files);

  const targetKey = normalizeKey(record.relativePath || record.filePath);
  ensureNode(graph.byFile, targetKey);

  const node = graph.byFile.get(targetKey);
  const fanOut = node ? computeFanCount(node.outgoing) : 0;
  const fanIn = node ? computeFanCount(node.incoming) : 0;

  const depth = typeof options.depth === 'number' && options.depth > 0 ? options.depth : Infinity;
  const limit = typeof options.limit === 'number' ? options.limit : 20;

  const outgoing = collectDirection(graph, targetKey, 'outgoing', { depth, limit });
  const incoming = collectDirection(graph, targetKey, 'incoming', { depth, limit });

  return {
    operation: 'dependencies',
    target: {
      file: targetKey,
      matchedBy,
      function: matchedFunction ? {
        name: matchedFunction.name,
        hash: matchedFunction.hash,
        kind: matchedFunction.kind
      } : null,
      exists: Boolean(node && node.exists),
      entryPoint: Boolean(node && node.record && node.record.entryPoint),
      moduleKind: node && node.record ? node.record.moduleKind : null,
      stats: node && node.record ? node.record.stats : null
    },
    stats: {
      fanOut,
      fanIn,
      outgoingShown: outgoing.length,
      incomingShown: incoming.length,
      depth: depth === Infinity ? 0 : depth,
      limit
    },
    outgoing,
    incoming
  };
}

module.exports = {
  buildDependencyGraph,
  runDependencySummary
};
