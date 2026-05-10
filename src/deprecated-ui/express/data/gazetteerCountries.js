function fetchGazetteerCountries(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('fetchGazetteerCountries requires a database handle with prepare()');
  }

  const rows = db.prepare(`
    SELECT p.id, p.country_code, p.population, COALESCE(cn.name, pn.name) AS name
    FROM places p
    LEFT JOIN place_names pn ON pn.place_id = p.id
    LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
    WHERE p.kind = 'country'
    GROUP BY p.id
    ORDER BY name ASC
  `).all();

  return rows.map((row) => ({
    id: row.id,
    country_code: row.country_code,
    population: row.population,
    name: row.name
  }));
}

module.exports = {
  fetchGazetteerCountries
};
