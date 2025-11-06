'use strict';

function computeModuleScore(record) {
  if (!record || typeof record !== 'object') {
    return 0;
  }
  const { stats, entryPoint, priority } = record;
  let score = 0;
  if (entryPoint) {
    score += 10;
  }
  if (priority) {
    score += 5;
  }
  if (stats) {
    score += (stats.exports || 0) * 0.8;
    score += (stats.functions || 0) * 0.2;
  }
  return score;
}

function buildIndex(files, options = {}) {
  const entries = files.map((record) => ({
    file: record.relativePath,
    moduleKind: record.moduleKind,
    entryPoint: record.entryPoint,
    priority: record.priority,
    stats: record.stats,
    dependencies: record.dependencies,
    score: computeModuleScore(record)
  }));

  entries.sort((a, b) => {
    if (b.entryPoint !== a.entryPoint) {
      return b.entryPoint ? 1 : -1;
    }
    if (b.priority !== a.priority) {
      return b.priority ? 1 : -1;
    }
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.file.localeCompare(b.file);
  });

  const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : entries.length;
  const limitedEntries = entries.slice(0, limit);

  const totals = files.reduce((acc, file) => {
    acc.files += 1;
    acc.functions += file.stats.functions || 0;
    acc.classes += file.stats.classes || 0;
    acc.exports += file.stats.exports || 0;
    if (file.entryPoint) {
      acc.entryPoints += 1;
    }
    if (file.priority) {
      acc.priorityFiles += 1;
    }
    return acc;
  }, { files: 0, functions: 0, classes: 0, exports: 0, entryPoints: 0, priorityFiles: 0 });

  return {
    operation: 'build-index',
    stats: totals,
    entries: limitedEntries
  };
}

module.exports = {
  buildIndex
};
