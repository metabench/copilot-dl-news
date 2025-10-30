'use strict';

const {
  DEFAULT_LABEL_LANGUAGES,
  DEFAULT_REGION_CLASS_QIDS,
  buildCountryClause,
  buildCountryDiscoveryQuery,
  buildAdm1DiscoveryQuery,
  buildCitiesDiscoveryQuery
} = require('../../../src/crawler/gazetteer/queries/geographyQueries');

describe('geographyQueries', () => {
  describe('buildCountryDiscoveryQuery', () => {
    it('includes limit and label service clauses', () => {
      const query = buildCountryDiscoveryQuery({
        limit: 10,
        languages: DEFAULT_LABEL_LANGUAGES
      });

      expect(query).toContain('VALUES ?countryClass');
      expect(query).toContain('LIMIT 10');
      expect(query).toContain('SERVICE wikibase:label');
      expect(query).toContain(DEFAULT_LABEL_LANGUAGES.join(','));
    });
  });

  describe('buildAdm1DiscoveryQuery', () => {
    it('throws when country clause missing', () => {
      expect(() => buildAdm1DiscoveryQuery()).toThrow('countryClause');
    });

    it('includes region class values and limit when clause provided', () => {
      const clause = buildCountryClause({
        subjectVar: 'region',
        countryCode: 'US',
        countryQid: 'Q30'
      });
      const query = buildAdm1DiscoveryQuery({
        countryClause: clause,
        regionClassQids: DEFAULT_REGION_CLASS_QIDS,
        limit: 25
      });

      DEFAULT_REGION_CLASS_QIDS.forEach(qid => {
        expect(query).toContain(`wd:${qid}`);
      });
      expect(query).toContain('LIMIT 25');
      expect(query).toContain('ORDER BY DESC(?pop)');
    });
  });

  describe('buildCitiesDiscoveryQuery', () => {
    it('includes population filter when provided', () => {
      const clause = buildCountryClause({
        subjectVar: 'city',
        countryCode: 'FR'
      });
      const query = buildCitiesDiscoveryQuery({
        countryClause: clause,
        minPopulation: 500000,
        limit: 15
      });

      expect(query).toContain('FILTER(?pop > 500000)');
      expect(query).toContain('LIMIT 15');
      expect(query).toContain('VALUES ?cityClass');
    });
  });

  describe('buildCountryClause', () => {
    it('returns union when both code and QID provided', () => {
      const clause = buildCountryClause({
        subjectVar: 'city',
        countryCode: 'BR',
        countryQid: 'Q155'
      });

      expect(clause.split('UNION').length).toBeGreaterThan(1);
      expect(clause).toContain('wd:Q155');
      expect(clause).toContain('"BR"');
    });

    it('falls back to generic membership when no metadata provided', () => {
      const clause = buildCountryClause();
      expect(clause).toContain('?item wdt:P17 ?country');
    });
  });
});
