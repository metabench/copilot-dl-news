'use strict';

const DEFAULT_LABEL_LANGUAGES = [
  '[AUTO_LANGUAGE]',
  'en',
  'fr',
  'de',
  'es',
  'ru',
  'zh',
  'ar',
  'pt',
  'it',
  'ja',
  'ko',
  'und'
];

const DEFAULT_REGION_CLASS_QIDS = ['Q10864048', 'Q15284', 'Q3336843'];

const COUNTRY_CLASS_QIDS = ['Q3624078', 'Q6256'];

const CITY_CLASS_QIDS = ['Q515'];

function buildLabelServiceClause(languages = DEFAULT_LABEL_LANGUAGES) {
  const languageList = Array.isArray(languages) ? languages.join(',') : String(languages);
  return `SERVICE wikibase:label { bd:serviceParam wikibase:language "${languageList}" . bd:serviceParam wikibase:normalize "true" . }`;
}

function buildCountryClause({
  subjectVar = 'item',
  countryCode = null,
  countryQid = null
} = {}) {
  const clauses = [];

  if (countryQid) {
    clauses.push(`{
        VALUES ?targetCountry { wd:${countryQid} }
        ?${subjectVar} wdt:P17 ?country.
        ?targetCountry (wdt:P150*) ?country.
      }`);
  }

  if (countryCode) {
    clauses.push(`{
        ?${subjectVar} wdt:P17 ?country.
        ?country wdt:P297 "${countryCode}".
      }`);
  }

  if (clauses.length === 0) {
    clauses.push(`{
        ?${subjectVar} wdt:P17 ?country.
      }`);
  }

  return clauses.length === 1 ? clauses[0] : clauses.join('\n      UNION\n      ');
}

function buildCountryDiscoveryQuery({
  limit = null,
  languages = DEFAULT_LABEL_LANGUAGES,
  includeCoordinates = true,
  includeIso = true,
  orderBy = 'LCASE(?countryLabel)'
} = {}) {
  const classValues = COUNTRY_CLASS_QIDS.map(qid => `wd:${qid}`).join(' ');
  const selectParts = ['?country', '?countryLabel'];
  if (includeIso) {
    selectParts.push('?iso2');
  }
  if (includeCoordinates) {
    selectParts.push('?coord');
  }

  const optionalParts = [];
  if (includeIso) {
    optionalParts.push('OPTIONAL { ?country wdt:P297 ?iso2. }  # ISO 3166-1 alpha-2 code');
  }
  if (includeCoordinates) {
    optionalParts.push('OPTIONAL { ?country wdt:P625 ?coord. }  # Coordinates');
  }

  const labelClause = buildLabelServiceClause(languages);
  const limitClause = limit ? `LIMIT ${Number(limit)}` : '';
  const orderClause = orderBy ? `ORDER BY ${orderBy}` : '';

  return `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>

SELECT DISTINCT ${selectParts.join(' ')} WHERE {
  VALUES ?countryClass { ${classValues} }
  ?country wdt:P31/wdt:P279* ?countryClass.
  FILTER(!isBLANK(?country))
  ${optionalParts.join('\n  ')}
  ${labelClause}
}
${orderClause}
${limitClause}`.trim();
}

function buildAdm1DiscoveryQuery({
  countryClause,
  regionClassQids = DEFAULT_REGION_CLASS_QIDS,
  languages = DEFAULT_LABEL_LANGUAGES,
  limit = 500,
  includePopulation = true,
  includeCoordinates = true
} = {}) {
  if (!countryClause || typeof countryClause !== 'string') {
    throw new Error('buildAdm1DiscoveryQuery requires a countryClause string');
  }

  const classValues = regionClassQids.map(qid => `wd:${qid}`).join(' ');
  const optionalParts = [];
  if (includePopulation) {
    optionalParts.push('OPTIONAL { ?region wdt:P1082 ?pop. }     # Population');
  }
  if (includeCoordinates) {
    optionalParts.push('OPTIONAL { ?region wdt:P625 ?coord. }    # Coordinates');
  }
  optionalParts.push('OPTIONAL { ?region wdt:P300 ?isoCode. }   # ISO 3166-2 code');

  const labelClause = buildLabelServiceClause(languages);

  return `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>

SELECT DISTINCT ?region ?regionLabel ?isoCode ?pop ?coord WHERE {
  VALUES ?regionClass { ${classValues} }
  ?region wdt:P31/wdt:P279* ?regionClass.
  ${countryClause}
  ${optionalParts.join('\n  ')}
  ${labelClause}
}
ORDER BY DESC(?pop)
LIMIT ${Number(limit)}`.trim();
}

function buildCitiesDiscoveryQuery({
  countryClause,
  languages = DEFAULT_LABEL_LANGUAGES,
  limit = 200,
  minPopulation = null,
  includeCoordinates = true,
  includePopulation = true
} = {}) {
  if (!countryClause || typeof countryClause !== 'string') {
    throw new Error('buildCitiesDiscoveryQuery requires a countryClause string');
  }

  const classValues = CITY_CLASS_QIDS.map(qid => `wd:${qid}`).join(' ');
  const optionalParts = [];
  if (includeCoordinates) {
    optionalParts.push('OPTIONAL { ?city wdt:P625 ?coord. }  # Coordinates');
  }
  if (includePopulation) {
    optionalParts.push('OPTIONAL { ?city wdt:P1082 ?pop. }   # Population');
  }

  const populationFilter = minPopulation ? `FILTER(?pop > ${Number(minPopulation)})  # Minimum population` : '';
  const labelClause = buildLabelServiceClause(languages);

  return `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>

SELECT DISTINCT ?city ?cityLabel ?coord ?pop WHERE {
  VALUES ?cityClass { ${classValues} }
  ?city wdt:P31/wdt:P279* ?cityClass.
  ${countryClause}
  ${optionalParts.join('\n  ')}
  ${populationFilter}
  ${labelClause}
}
ORDER BY DESC(?pop)
LIMIT ${Number(limit)}`.trim();
}

module.exports = {
  DEFAULT_LABEL_LANGUAGES,
  DEFAULT_REGION_CLASS_QIDS,
  buildLabelServiceClause,
  buildCountryClause,
  buildCountryDiscoveryQuery,
  buildAdm1DiscoveryQuery,
  buildCitiesDiscoveryQuery
};
