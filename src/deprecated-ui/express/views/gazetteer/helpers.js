function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c] || c));
}

function formatNumber(value) {
  if (value == null) return '';
  try {
    return Number(value).toLocaleString();
  } catch (_) {
    return String(value);
  }
}

function formatBytes(value) {
  if (value == null) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let current = Number(value) || 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return (index === 0 ? String(current | 0) : current.toFixed(1)) + ' ' + units[index];
}

function toQueryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

function safeTracePre(trace, name) {
  if (!trace || typeof trace.pre !== 'function') return () => {};
  try {
    return trace.pre(name) || (() => {});
  } catch (_) {
    return () => {};
  }
}

function createSizeEstimator(db) {
  const placeStmt = db.prepare(`SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS total FROM places WHERE id=?`);
  const namesStmt = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS total FROM place_names WHERE place_id=?`);
  const externalStmt = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS total FROM place_external_ids WHERE place_id=?`);
  const hierarchyStmt = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS total FROM place_hierarchy WHERE parent_id=? OR child_id=?`);

  const cache = new Map();
  return (id) => {
    if (cache.has(id)) return cache.get(id);
    const base = placeStmt.get(id)?.total || 0;
    const names = namesStmt.get(id)?.total || 0;
    const external = externalStmt.get(id)?.total || 0;
    const hierarchy = hierarchyStmt.get(id, id)?.total || 0;
    const total = (base + names + external + hierarchy) | 0;
    cache.set(id, total);
    return total;
  };
}

module.exports = {
  escapeHtml,
  formatNumber,
  formatBytes,
  toQueryString,
  safeTracePre,
  createSizeEstimator
};
