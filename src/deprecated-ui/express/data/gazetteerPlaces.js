const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function normalizeString(value, { upper = false } = {}) {
  if (value == null) return '';
  const str = String(value).trim();
  return upper ? str.toUpperCase() : str;
}

function normalizeGazetteerPlacesQuery(query = {}) {
  const search = normalizeString(query.q || query.query || '');
  const kind = normalizeString(query.kind);
  const countryCode = normalizeString(query.cc || query.country || '', {
    upper: true
  });
  const adm1 = normalizeString(query.adm1);
  const minPopulation = Math.max(0, parseInt(query.minpop || query.minPopulation || '0', 10) || 0);
  const rawSort = normalizeString(query.sort || 'name').toLowerCase();
  const sort = ['country', 'pop', 'population', 'name'].includes(rawSort) ? rawSort : 'name';
  const direction = normalizeString(query.dir || query.direction || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, parseInt(query.pageSize || DEFAULT_PAGE_SIZE, 10) || DEFAULT_PAGE_SIZE));

  return {
    search,
    kind,
    countryCode,
    adm1,
    minPopulation,
    sort,
    direction,
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

function buildWhereClause(filters) {
  const where = [];
  const params = [];

  if (filters.kind) {
    where.push('p.kind = ?');
    params.push(filters.kind);
  }
  if (filters.countryCode) {
    where.push('UPPER(p.country_code) = ?');
    params.push(filters.countryCode);
  }
  if (filters.adm1) {
    where.push('p.adm1_code = ?');
    params.push(filters.adm1);
  }
  if (filters.minPopulation > 0) {
    where.push('COALESCE(p.population,0) >= ?');
    params.push(filters.minPopulation);
  }
  if (filters.search) {
    const like = `%${filters.search.toLowerCase()}%`;
    where.push(`EXISTS (SELECT 1 FROM place_names nx WHERE nx.place_id = p.id AND (LOWER(nx.normalized) LIKE ? OR LOWER(nx.name) LIKE ?))`);
    params.push(like, like);
  }

  return {
    whereSql: where.length ? ` AND ${where.join(' AND ')}` : '',
    params
  };
}

function resolveSortColumn(sort, { orderByNameExpression } = {}) {
  switch (sort) {
    case 'country':
      return 'p.country_code';
    case 'pop':
    case 'population':
      return 'p.population';
    case 'name':
    default:
      return orderByNameExpression || 'cn.name';
  }
}

function fetchGazetteerPlaces(db, filtersInput = {}, options = {}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('fetchGazetteerPlaces requires a database handle with prepare()');
  }

  const filters = filtersInput && filtersInput.offset != null ? filtersInput : normalizeGazetteerPlacesQuery(filtersInput);
  const {
    whereSql,
    params
  } = buildWhereClause(filters);
  const direction = filters.direction === 'DESC' ? 'DESC' : 'ASC';
  const sortColumn = resolveSortColumn(filters.sort, {
    orderByNameExpression: options.orderByNameExpression
  });
  const orderSegments = [`${sortColumn} ${direction}`];
  if (options.orderBySecondary) {
    orderSegments.push(options.orderBySecondary);
  }

  const selectColumns = options.selectColumns || 'p.id, p.kind, p.country_code, p.adm1_code, p.population, COALESCE(cn.name, pn.name) AS name';

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM places p
    LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
    WHERE ((p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
           OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id))
      ${whereSql}
  `).get(...params);
  const total = totalRow && typeof totalRow.count === 'number' ? totalRow.count : 0;

  const rows = db.prepare(`
    SELECT ${selectColumns}
    FROM places p
    LEFT JOIN place_names pn ON pn.place_id = p.id
    LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
    WHERE ((p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
           OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id))
      ${whereSql}
    ORDER BY ${orderSegments.join(', ')}
    LIMIT ? OFFSET ?
  `).all(...params, filters.pageSize, filters.offset);

  return {
    total,
    rows,
    page: filters.page,
    pageSize: filters.pageSize,
    filters
  };
}

module.exports = {
  normalizeGazetteerPlacesQuery,
  fetchGazetteerPlaces
};
