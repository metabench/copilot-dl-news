'use strict';

const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'throw', 'new', 'typeof',
  'delete', 'in', 'instanceof', 'void', 'await', 'async', 'function', 'class',
  'else', 'case', 'default', 'break', 'continue'
]);

const IGNORED_BASES = new Set(['console', 'Math', 'JSON', 'Promise']);

function sanitizeSnippet(snippet) {
  if (typeof snippet !== 'string' || snippet.length === 0) {
    return '';
  }
  const bodyIndex = snippet.indexOf('{');
  const content = bodyIndex !== -1 ? snippet.slice(bodyIndex + 1) : snippet;
  // Remove block and line comments to reduce noise
  return content
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

function extractCalls(snippet) {
  const body = sanitizeSnippet(snippet);
  const pattern = /([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  const results = [];
  let match;
  while ((match = pattern.exec(body)) !== null) {
    const name = match[1];
    if (!name) {
      continue;
    }
    const lower = name.toLowerCase();
    if (KEYWORDS.has(lower)) {
      continue;
    }
    if (IGNORED_BASES.has(name)) {
      continue;
    }
    results.push(name);
  }
  return results;
}

function createNode(fileRecord, functionRecord) {
  const name = functionRecord.name || '(anonymous)';
  return {
    id: `${fileRecord.relativePath}::${name}`,
    name,
    canonicalName: functionRecord.canonicalName || name,
    file: fileRecord.relativePath,
    hash: functionRecord.hash || null,
    exported: Boolean(functionRecord.exported),
    isAsync: Boolean(functionRecord.isAsync),
    isGenerator: Boolean(functionRecord.isGenerator),
    line: functionRecord.line || 0,
    column: functionRecord.column || 0,
    snippet: functionRecord.snippet || ''
  };
}

function addEdge(adjacency, sourceId, targetId, weight = 1) {
  if (!adjacency.has(sourceId)) {
    adjacency.set(sourceId, new Map());
  }
  const targets = adjacency.get(sourceId);
  targets.set(targetId, (targets.get(targetId) || 0) + weight);
}

function incrementCount(map, key, weight = 1) {
  map.set(key, (map.get(key) || 0) + weight);
}

function resolveCallTarget(name, filePath, nameIndex, fileIndex) {
  if (!name) {
    return null;
  }
  const sameFileMap = fileIndex.get(filePath);
  if (sameFileMap && sameFileMap.has(name)) {
    return sameFileMap.get(name);
  }
  const candidates = nameIndex.get(name);
  if (!candidates) {
    return null;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  return null;
}

function buildCallGraph(files = []) {
  const nodes = new Map();
  const nameIndex = new Map();
  const fileIndex = new Map();
  const adjacency = new Map();
  const incoming = new Map();
  const unresolved = new Map();
  const stats = {
    nodeCount: 0,
    edgeCount: 0
  };

  const records = Array.isArray(files) ? files : [];
  records.forEach((file) => {
    if (!file || typeof file !== 'object') {
      return;
    }
    const functions = Array.isArray(file.functions) ? file.functions : [];
    if (!fileIndex.has(file.relativePath)) {
      fileIndex.set(file.relativePath, new Map());
    }
    const fileMap = fileIndex.get(file.relativePath);
    functions.forEach((fn) => {
      const node = createNode(file, fn);
      nodes.set(node.id, node);
      stats.nodeCount += 1;

      if (!nameIndex.has(node.name)) {
        nameIndex.set(node.name, []);
      }
      nameIndex.get(node.name).push(node.id);
      fileMap.set(node.name, node.id);
    });
  });

  records.forEach((file) => {
    if (!file || typeof file !== 'object') {
      return;
    }
    const functions = Array.isArray(file.functions) ? file.functions : [];
    functions.forEach((fn) => {
      const sourceNode = nodes.get(`${file.relativePath}::${fn.name || '(anonymous)'}`);
      if (!sourceNode) {
        return;
      }
      const calls = extractCalls(fn.snippet || '');
      calls.forEach((callName) => {
        const targetId = resolveCallTarget(callName, sourceNode.file, nameIndex, fileIndex);
        if (targetId) {
          addEdge(adjacency, sourceNode.id, targetId, 1);
          incrementCount(incoming, targetId, 1);
          stats.edgeCount += 1;
        } else {
          const key = `${sourceNode.id}::${callName}`;
          if (!unresolved.has(key)) {
            unresolved.set(key, {
              sourceId: sourceNode.id,
              call: callName,
              count: 0
            });
          }
          unresolved.get(key).count += 1;
        }
      });
    });
  });

  const edges = [];
  adjacency.forEach((targets, sourceId) => {
    targets.forEach((count, targetId) => {
      edges.push({ sourceId, targetId, count });
    });
  });

  const unresolvedCalls = Array.from(unresolved.values()).sort((a, b) => b.count - a.count);

  return {
    nodes,
    adjacency,
    edges,
    incoming,
    unresolved: unresolvedCalls,
    nameIndex,
    fileIndex,
    stats
  };
}

function selectNode(callGraph, query) {
  if (!query || typeof query !== 'string') {
    throw new Error('Please provide a function identifier for --call-graph.');
  }
  const normalized = query.trim();
  const nodes = callGraph.nodes;
  if (normalized.includes('::')) {
    const match = nodes.get(normalized);
    if (!match) {
      throw new Error(`Function '${normalized}' not found.`);
    }
    return match;
  }
  const fileCandidates = [];
  nodes.forEach((node) => {
    if (node.file === normalized || node.file.endsWith(normalized)) {
      fileCandidates.push(node);
    }
  });
  if (fileCandidates.length === 1) {
    return fileCandidates[0];
  }
  const nameMatches = [];
  nodes.forEach((node) => {
    if (node.name === normalized) {
      nameMatches.push(node);
    }
  });
  if (nameMatches.length === 1) {
    return nameMatches[0];
  }
  if (nameMatches.length > 1) {
    throw new Error(`Multiple functions named '${normalized}' found. Use 'relative/path.js::name'.`);
  }
  if (fileCandidates.length > 1) {
    throw new Error(`Multiple functions in files matching '${normalized}'. Use 'relative/path.js::name'.`);
  }
  throw new Error(`Could not resolve function '${normalized}'.`);
}

function traverseCallGraph(callGraph, startId, depthLimit = 0) {
  const depth = typeof depthLimit === 'number' && depthLimit > 0 ? depthLimit : Infinity;
  const visited = new Set([startId]);
  const queue = [{ id: startId, depth: 0 }];
  const edges = [];

  while (queue.length > 0) {
    const { id, depth: currentDepth } = queue.shift();
    const targets = callGraph.adjacency.get(id);
    if (!targets) {
      continue;
    }
    targets.forEach((count, targetId) => {
      edges.push({ sourceId: id, targetId, count });
      if (!visited.has(targetId) && currentDepth + 1 <= depth) {
        visited.add(targetId);
        if (currentDepth + 1 < depth) {
          queue.push({ id: targetId, depth: currentDepth + 1 });
        }
      }
    });
  }

  const nodes = Array.from(visited).map((id) => callGraph.nodes.get(id)).filter(Boolean);
  const unresolved = callGraph.unresolved.filter((entry) => visited.has(entry.sourceId));

  return {
    nodes,
    edges,
    unresolved,
    depth: depth === Infinity ? 0 : depth
  };
}

function computeHotPaths(callGraph, limit = 20) {
  const incoming = callGraph.incoming;
  const results = [];
  callGraph.nodes.forEach((node, id) => {
    const inbound = incoming.get(id) || 0;
    if (inbound > 0) {
      results.push({
        id,
        name: node.name,
        file: node.file,
        count: inbound,
        exported: node.exported,
        hash: node.hash
      });
    }
  });
  results.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (typeof limit === 'number' && limit > 0 && results.length > limit) {
    return results.slice(0, limit);
  }
  return results;
}

function findDeadCode(callGraph, { includeExported = false, limit = 50 } = {}) {
  const incoming = callGraph.incoming;
  const results = [];
  callGraph.nodes.forEach((node, id) => {
    const inbound = incoming.get(id) || 0;
    if (inbound === 0 && (includeExported || !node.exported)) {
      results.push({
        id,
        name: node.name,
        file: node.file,
        exported: node.exported,
        hash: node.hash
      });
    }
  });
  results.sort((a, b) => {
    if (a.exported !== b.exported) {
      return a.exported ? -1 : 1;
    }
    const fileCompare = a.file.localeCompare(b.file);
    if (fileCompare !== 0) {
      return fileCompare;
    }
    return a.name.localeCompare(b.name);
  });
  if (typeof limit === 'number' && limit > 0 && results.length > limit) {
    return results.slice(0, limit);
  }
  return results;
}

module.exports = {
  buildCallGraph,
  selectNode,
  traverseCallGraph,
  computeHotPaths,
  findDeadCode
};
