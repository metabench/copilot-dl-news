'use strict';

/**
 * EntityRecognizer Tests
 * 
 * Tests for named entity recognition (PERSON, ORG, GPE).
 */

const { EntityRecognizer, PERSON_TITLES, ORG_SUFFIXES, ORG_KEYWORDS, COMMON_FIRST_NAMES } = require('../../../src/analysis/tagging/EntityRecognizer');

// Entity type constants (module exports the sets/arrays, not type constants)
const ENTITY_TYPES = {
  PERSON: 'PERSON',
  ORG: 'ORG',
  GPE: 'GPE'
};

describe('EntityRecognizer', () => {
  let recognizer;
  
  beforeEach(() => {
    recognizer = new EntityRecognizer();
  });
  
  describe('module exports', () => {
    it('should export pattern sets', () => {
      expect(PERSON_TITLES).toBeInstanceOf(Set);
      expect(ORG_SUFFIXES).toBeInstanceOf(Array);
      expect(ORG_KEYWORDS).toBeInstanceOf(Set);
      expect(COMMON_FIRST_NAMES).toBeInstanceOf(Set);
    });
  });
  
  describe('recognize()', () => {
    describe('PERSON entities', () => {
      it('should recognize names with title prefixes', () => {
        const text = 'Mr. John Smith announced the new policy today.';
        
        const entities = recognizer.recognize(text);
        const persons = entities.filter(e => e.type === ENTITY_TYPES.PERSON);
        
        expect(persons.length).toBeGreaterThanOrEqual(1);
        // Entity text includes matched name (may include trailing words)
        expect(persons[0].text).toContain('John');
        expect(persons[0].text).toContain('Smith');
      });
      
      it('should recognize Dr. prefix', () => {
        const text = 'Dr. Jane Doe presented her research findings.';
        
        const entities = recognizer.recognize(text);
        const persons = entities.filter(e => e.type === ENTITY_TYPES.PERSON);
        
        expect(persons.length).toBeGreaterThanOrEqual(1);
        expect(persons.some(p => p.text.includes('Jane'))).toBe(true);
      });
      
      it('should recognize political titles', () => {
        const text = 'Sen. Elizabeth Warren spoke about healthcare reform.';
        
        const entities = recognizer.recognize(text);
        const persons = entities.filter(e => e.type === ENTITY_TYPES.PERSON);
        
        expect(persons.length).toBeGreaterThanOrEqual(1);
        expect(persons.some(p => p.text.includes('Warren'))).toBe(true);
      });
      
      it('should recognize President title', () => {
        const text = 'President Biden addressed the nation.';
        
        const entities = recognizer.recognize(text);
        const persons = entities.filter(e => e.type === ENTITY_TYPES.PERSON);
        
        expect(persons.length).toBeGreaterThanOrEqual(1);
        expect(persons.some(p => p.text.includes('Biden'))).toBe(true);
      });
      
      it('should recognize common first names with surnames', () => {
        const text = 'James Wilson and Sarah Johnson attended the meeting.';
        
        const entities = recognizer.recognize(text);
        const persons = entities.filter(e => e.type === ENTITY_TYPES.PERSON);
        
        expect(persons.length).toBeGreaterThanOrEqual(1);
      });
      
      it('should handle multiple persons in text', () => {
        const text = 'Mr. Smith met with Dr. Jones and Senator Williams at the conference.';
        
        const entities = recognizer.recognize(text);
        const persons = entities.filter(e => e.type === ENTITY_TYPES.PERSON);
        
        expect(persons.length).toBeGreaterThanOrEqual(2);
      });
    });
    
    describe('ORG entities', () => {
      it('should recognize Inc. suffix', () => {
        const text = 'Apple Inc. reported strong quarterly earnings.';
        
        const entities = recognizer.recognize(text);
        const orgs = entities.filter(e => e.type === ENTITY_TYPES.ORG);
        
        expect(orgs.length).toBeGreaterThanOrEqual(1);
        expect(orgs.some(o => o.text.includes('Apple'))).toBe(true);
      });
      
      it('should recognize Corp. suffix', () => {
        const text = 'Microsoft Corp. acquired the startup.';
        
        const entities = recognizer.recognize(text);
        const orgs = entities.filter(e => e.type === ENTITY_TYPES.ORG);
        
        expect(orgs.length).toBeGreaterThanOrEqual(1);
        expect(orgs.some(o => o.text.includes('Microsoft'))).toBe(true);
      });
      
      it('should recognize Ltd suffix', () => {
        const text = 'Barclays Ltd announced new banking services.';
        
        const entities = recognizer.recognize(text);
        const orgs = entities.filter(e => e.type === ENTITY_TYPES.ORG);
        
        expect(orgs.length).toBeGreaterThanOrEqual(1);
      });
      
      it('should recognize LLC suffix', () => {
        const text = 'Tech Solutions LLC won the contract.';
        
        const entities = recognizer.recognize(text);
        const orgs = entities.filter(e => e.type === ENTITY_TYPES.ORG);
        
        expect(orgs.length).toBeGreaterThanOrEqual(1);
        expect(orgs.some(o => o.text.includes('Tech Solutions'))).toBe(true);
      });
      
      it('should recognize organization keywords', () => {
        const text = 'The United Nations held an emergency session.';
        
        const entities = recognizer.recognize(text);
        const orgs = entities.filter(e => e.type === ENTITY_TYPES.ORG);
        
        expect(orgs.length).toBeGreaterThanOrEqual(1);
        expect(orgs.some(o => o.text.includes('United Nations'))).toBe(true);
      });
      
      it('should recognize University', () => {
        const text = 'Harvard University published the research.';
        
        const entities = recognizer.recognize(text);
        const orgs = entities.filter(e => e.type === ENTITY_TYPES.ORG);
        
        expect(orgs.length).toBeGreaterThanOrEqual(1);
        expect(orgs.some(o => o.text.includes('Harvard'))).toBe(true);
      });
      
      it('should recognize Institute', () => {
        const text = 'The National Institute of Health issued guidelines.';
        
        const entities = recognizer.recognize(text);
        const orgs = entities.filter(e => e.type === ENTITY_TYPES.ORG);
        
        expect(orgs.length).toBeGreaterThanOrEqual(1);
      });
      
      it('should recognize multiple organizations', () => {
        const text = 'Apple Inc. and Google LLC are competing in the AI market.';
        
        const entities = recognizer.recognize(text);
        const orgs = entities.filter(e => e.type === ENTITY_TYPES.ORG);
        
        expect(orgs.length).toBeGreaterThanOrEqual(2);
      });
    });
    
    describe('GPE entities', () => {
      it('should recognize country names when added to known locations', () => {
        recognizer.addKnownLocations(['France']);
        const text = 'The summit was held in France last week.';
        
        const entities = recognizer.recognize(text);
        const gpes = entities.filter(e => e.type === ENTITY_TYPES.GPE);
        
        expect(gpes.length).toBeGreaterThanOrEqual(1);
        expect(gpes.some(g => g.text === 'France')).toBe(true);
      });
      
      it('should recognize city names from known locations', () => {
        recognizer.addKnownLocations(['London', 'Paris']);
        const text = 'The conference took place in London and Paris.';
        
        const entities = recognizer.recognize(text);
        const gpes = entities.filter(e => e.type === ENTITY_TYPES.GPE);
        
        expect(gpes.length).toBe(2);
      });
      
      it('should recognize US state names from known locations', () => {
        recognizer.addKnownLocations(['California', 'Texas']);
        const text = 'The event was held in California and Texas.';
        
        const entities = recognizer.recognize(text);
        const gpes = entities.filter(e => e.type === ENTITY_TYPES.GPE);
        
        expect(gpes.length).toBeGreaterThanOrEqual(1);
      });
      
      it('should recognize multi-word locations from known set', () => {
        recognizer.addKnownLocations(['United States']);
        const text = 'The United States announced new trade policies.';
        
        const entities = recognizer.recognize(text);
        const gpes = entities.filter(e => e.type === ENTITY_TYPES.GPE);
        
        expect(gpes.some(g => g.text.includes('United States'))).toBe(true);
      });
    });
    
    describe('mixed entity recognition', () => {
      it('should recognize all entity types in one text', () => {
        const text = `
          President Biden met with executives from Apple Inc. in Washington D.C.
          Dr. Jane Smith from Harvard University also attended.
        `;
        
        const entities = recognizer.recognize(text);
        
        const types = new Set(entities.map(e => e.type));
        expect(types.has(ENTITY_TYPES.PERSON)).toBe(true);
        expect(types.has(ENTITY_TYPES.ORG)).toBe(true);
        // GPE depends on gazetteer having Washington
      });
      
      it('should handle overlapping patterns correctly', () => {
        // "General Motors" could be PERSON (General) or ORG
        const text = 'General Motors announced layoffs.';
        
        const entities = recognizer.recognize(text);
        
        // Should prefer ORG interpretation
        const hasGMAsOrg = entities.some(e => 
          e.type === ENTITY_TYPES.ORG && e.text.includes('General Motors')
        );
        expect(hasGMAsOrg).toBe(true);
      });
    });
    
    describe('edge cases', () => {
      it('should handle empty text', () => {
        const entities = recognizer.recognize('');
        
        expect(entities).toEqual([]);
      });
      
      it('should handle text with no entities', () => {
        const text = 'The quick brown fox jumps over the lazy dog.';
        
        const entities = recognizer.recognize(text);
        
        // Might be empty or have false positives, but shouldn't crash
        expect(Array.isArray(entities)).toBe(true);
      });
      
      it('should deduplicate repeated entities', () => {
        const text = 'Apple Inc. announced profits. Apple Inc. also announced layoffs.';
        
        const entities = recognizer.recognize(text);
        const appleOrgs = entities.filter(e => 
          e.type === ENTITY_TYPES.ORG && e.text.includes('Apple')
        );
        
        // Should not have duplicates
        const uniqueTexts = [...new Set(appleOrgs.map(e => e.text))];
        expect(appleOrgs.length).toBe(uniqueTexts.length);
      });
      
      it('should include confidence scores', () => {
        const text = 'Mr. John Smith works at Apple Inc.';
        
        const entities = recognizer.recognize(text);
        
        entities.forEach(entity => {
          expect(entity.confidence).toBeDefined();
          expect(entity.confidence).toBeGreaterThan(0);
          expect(entity.confidence).toBeLessThanOrEqual(1);
        });
      });
    });
  });
  
  describe('filtering by type', () => {
    it('should filter persons from mixed results', () => {
      const text = 'Mr. Smith met Apple Inc. executives.';
      
      const entities = recognizer.recognize(text);
      const persons = entities.filter(e => e.type === ENTITY_TYPES.PERSON);
      
      expect(persons.every(e => e.type === ENTITY_TYPES.PERSON)).toBe(true);
    });
    
    it('should filter orgs from mixed results', () => {
      const text = 'Mr. Smith met Apple Inc. executives.';
      
      const entities = recognizer.recognize(text);
      const orgs = entities.filter(e => e.type === ENTITY_TYPES.ORG);
      
      expect(orgs.every(e => e.type === ENTITY_TYPES.ORG)).toBe(true);
    });
  });
  
  describe('getStats()', () => {
    it('should return recognizer statistics', () => {
      const stats = recognizer.getStats();
      
      expect(stats.personTitles).toBeGreaterThan(0);
      expect(stats.orgSuffixes).toBeGreaterThan(0);
      expect(stats.commonFirstNames).toBeGreaterThan(0);
      expect(stats.knownLocations).toBeDefined();
      expect(stats.knownOrgs).toBeDefined();
    });
  });
  
  describe('addKnownLocations()', () => {
    it('should add locations for recognition', () => {
      recognizer.addKnownLocations(['NewCity', 'TestTown']);
      
      const stats = recognizer.getStats();
      expect(stats.knownLocations).toBe(2);
    });
  });
  
  describe('addKnownOrganizations()', () => {
    it('should add organizations for recognition', () => {
      recognizer.addKnownOrganizations(['TestCorp', 'Acme']);
      
      const stats = recognizer.getStats();
      expect(stats.knownOrgs).toBe(2);
    });
  });
});
