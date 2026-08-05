'use strict';

/**
 * Tests for FactExtractor
 * 
 * @group aggregation
 */

const { FactExtractor, FACT_TYPES } = require('../../src/aggregation/FactExtractor');

describe('FactExtractor', () => {
  let extractor;
  
  beforeEach(() => {
    extractor = new FactExtractor();
  });
  
  describe('constructor', () => {
    it('should create instance with default options', () => {
      expect(extractor.minQuoteLength).toBe(20);
    });
    
    it('should accept custom options', () => {
      const custom = new FactExtractor({ minQuoteLength: 30 });
      expect(custom.minQuoteLength).toBe(30);
    });
  });
  
  describe('_extractQuotes', () => {
    it('should extract double-quoted text', () => {
      const text = 'The CEO said "We are committed to sustainable growth and innovation" in the press release.';
      
      const quotes = extractor._extractQuotes(text);
      
      expect(quotes).toHaveLength(1);
      expect(quotes[0].text).toBe('We are committed to sustainable growth and innovation');
      expect(quotes[0].type).toBe('quote');
    });
    
    it('should extract single-quoted text', () => {
      const text = "She stated 'This represents a major breakthrough in our research' yesterday.";
      
      const quotes = extractor._extractQuotes(text);
      
      expect(quotes).toHaveLength(1);
      expect(quotes[0].text).toBe('This represents a major breakthrough in our research');
    });
    
    it('should extract curly quotes', () => {
      const text = 'The spokesperson said "We deny all allegations against the company" on Monday.';
      
      const quotes = extractor._extractQuotes(text);
      
      expect(quotes).toHaveLength(1);
    });
    
    it('should filter short quotes', () => {
      const text = 'He said "No" and "I disagree completely" before leaving.';
      
      const quotes = extractor._extractQuotes(text);
      
      // Only the longer quote should be extracted
      expect(quotes).toHaveLength(1);
      expect(quotes[0].text).toBe('I disagree completely');
    });
    
    it('should try to extract attribution', () => {
      const text = 'CEO John Smith said "We expect record results this quarter" to reporters.';
      
      const quotes = extractor._extractQuotes(text);
      
      expect(quotes).toHaveLength(1);
      expect(quotes[0].attribution).toContain('CEO John Smith');
    });
  });
  
  describe('_extractStatistics', () => {
    it('should extract percentages', () => {
      const text = 'Revenue increased by 25% compared to last year. The market share grew 15.5%.';
      
      const stats = extractor._extractStatistics(text);
      
      expect(stats.length).toBeGreaterThanOrEqual(2);
      expect(stats.some(s => s.text.includes('25%'))).toBe(true);
    });
    
    it('should extract currency values', () => {
      const text = 'The company raised $50 million in funding. The project cost €10.5 billion.';
      
      const stats = extractor._extractStatistics(text);
      
      expect(stats.some(s => s.text.includes('$50 million'))).toBe(true);
    });
    
    it('should extract numbers with units', () => {
      const text = 'The population grew by 1.5 million people. Energy production increased by 500 megawatts.';
      
      const stats = extractor._extractStatistics(text);
      
      expect(stats.some(s => s.text.includes('1.5 million'))).toBe(true);
    });
    
    it('should record position of statistics', () => {
      const text = 'Sales increased 30% in Q4.';
      
      const stats = extractor._extractStatistics(text);
      
      expect(stats[0]).toHaveProperty('start');
      expect(stats[0]).toHaveProperty('end');
      expect(stats[0].start).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('_extractDates', () => {
    it('should extract ISO dates', () => {
      const text = 'The event occurred on 2025-12-26. Another milestone on 2024-01-15.';
      
      const dates = extractor._extractDates(text);
      
      expect(dates.length).toBeGreaterThanOrEqual(2);
      expect(dates.some(d => d.text.includes('2025-12-26'))).toBe(true);
    });
    
    it('should extract month-day-year dates', () => {
      const text = 'Signed on December 25, 2025. Published January 1, 2024.';
      
      const dates = extractor._extractDates(text);
      
      expect(dates.length).toBeGreaterThanOrEqual(2);
    });
    
    it('should extract relative dates', () => {
      const text = 'This happened yesterday. The meeting is scheduled for next week.';
      
      const dates = extractor._extractDates(text);
      
      expect(dates.some(d => d.text === 'yesterday')).toBe(true);
    });
    
    it('should extract day names', () => {
      const text = 'The announcement was made on Monday. Meeting scheduled for Friday.';
      
      const dates = extractor._extractDates(text);
      
      expect(dates.some(d => d.text === 'Monday')).toBe(true);
    });
  });
  
  describe('_extractClaims', () => {
    it('should extract claims with attribution patterns', () => {
      const text = 'According to sources, the merger will happen by March. Officials say the plan is on track.';
      
      const claims = extractor._extractClaims(text);
      
      expect(claims.length).toBeGreaterThanOrEqual(2);
      expect(claims.some(c => c.text.includes('According to sources'))).toBe(true);
    });
    
    it('should identify claim sources', () => {
      const text = 'The company claims profits will double next year.';
      
      const claims = extractor._extractClaims(text);
      
      expect(claims.length).toBeGreaterThanOrEqual(1);
    });
    
    it('should extract reported speech', () => {
      const text = 'The minister said that reforms would be implemented. Analysts believe the market will recover.';
      
      const claims = extractor._extractClaims(text);
      
      expect(claims.length).toBeGreaterThanOrEqual(2);
    });
  });
  
  describe('extract', () => {
    it('should extract all fact types from article', () => {
      const article = {
        id: 1,
        title: 'Major Announcement',
        body: `
          CEO John Smith said "We expect revenue to grow by 50% next year" at the conference.
          The company reported $2.5 billion in sales for 2025.
          According to analysts, this exceeds expectations.
          The announcement was made on December 26, 2025.
        `
      };
      
      const result = extractor.extract(article);
      
      expect(result).toHaveProperty('articleId', 1);
      expect(result).toHaveProperty('quotes');
      expect(result).toHaveProperty('statistics');
      expect(result).toHaveProperty('dates');
      expect(result).toHaveProperty('claims');
      expect(result).toHaveProperty('summary');
      
      // Should find at least one of each
      expect(result.quotes.length).toBeGreaterThanOrEqual(1);
      expect(result.statistics.length).toBeGreaterThanOrEqual(1);
      expect(result.dates.length).toBeGreaterThanOrEqual(1);
      expect(result.claims.length).toBeGreaterThanOrEqual(1);
    });
    
    it('should handle articles with minimal facts', () => {
      const article = {
        id: 2,
        title: 'Simple Story',
        body: 'This is a simple story with no specific facts or figures.'
      };
      
      const result = extractor.extract(article);
      
      expect(result.articleId).toBe(2);
      expect(result.summary.totalFacts).toBe(0);
    });
  });
  
  describe('quotes extracted correctly', () => {
    it('should extract quotes with proper attribution', () => {
      const article = {
        id: 1,
        title: 'Interview with Industry Leader',
        body: `
          Industry leader Jane Doe said "Innovation is at the core of everything we do" during the keynote.
          She added "Our goal is to revolutionize the entire industry within five years" to applause.
          Competitor CEO responded "We welcome healthy competition in this space" in a statement.
        `
      };
      
      const result = extractor.extract(article);
      
      // Should find all three quotes
      expect(result.quotes.length).toBe(3);
      
      // Check quote text
      expect(result.quotes.some(q => q.text.includes('Innovation is at the core'))).toBe(true);
      expect(result.quotes.some(q => q.text.includes('Our goal is to revolutionize'))).toBe(true);
      expect(result.quotes.some(q => q.text.includes('We welcome healthy competition'))).toBe(true);
      
      // Check attributions are captured
      expect(result.quotes.some(q => q.attribution && q.attribution.includes('Jane Doe'))).toBe(true);
    });
  });
  
  describe('compareArticles', () => {
    // c203: modernized to the LIVE signature — compareArticles takes an
    // ARRAY of {id, text, host} articles (CoverageMap is the production
    // caller) and returns {quotes, statistics, dates, claims, conflicts,
    // agreement}, each type as {shared, unique}. The old two-pre-extracted-
    // results signature these tests pinned never shipped.
    it('should find shared facts between articles', () => {
      const comparison = extractor.compareArticles([
        { id: 1, host: 'a.example', text: 'Revenue grew 25 percent. "We will succeed together this year," said CEO John Smith.' },
        { id: 2, host: 'b.example', text: 'Revenue grew 25 percent. "We will succeed together this year," the leader said.' }
      ]);

      expect(comparison).toHaveProperty('quotes');
      expect(comparison).toHaveProperty('statistics');
      expect(comparison).toHaveProperty('conflicts');
      expect(comparison).toHaveProperty('agreement');

      expect(comparison.quotes.shared).toHaveLength(1);
      expect(comparison.quotes.shared[0].sources.sort()).toEqual(['a.example', 'b.example']);
      expect(comparison.statistics.shared.length).toBeGreaterThanOrEqual(1);
      expect(comparison.agreement.sharedFacts).toBeGreaterThanOrEqual(2);
    });

    it('should detect conflicting statistics', () => {
      const comparison = extractor.compareArticles([
        { id: 1, host: 'a.example', text: 'Attendance at the march reached 10,000 people by noon.' },
        { id: 2, host: 'b.example', text: 'Attendance at the march reached 5,000 people by noon.' }
      ]);

      expect(comparison.conflicts).toHaveLength(1);
      expect(comparison.conflicts[0].type).toBe('statistic_conflict');
      expect(comparison.conflicts[0].metric).toBe('people');
      expect(comparison.conflicts[0].values.map(v => v.value).sort((a, b) => a - b)).toEqual([5000, 10000]);
      expect(['moderate', 'high']).toContain(comparison.conflicts[0].severity);
    });
  });
  
  describe('stats conflicts flagged', () => {
    it('should flag statistics that differ between sources', () => {
      // Same event, different numbers reported
      const article1 = {
        id: 1,
        title: 'Event Report A',
        body: 'The crowd numbered approximately 10,000 people according to organizers.'
      };
      
      const article2 = {
        id: 2,
        title: 'Event Report B',
        body: 'Police estimated the crowd at 5,000 people.'
      };
      
      const facts1 = extractor.extract(article1);
      const facts2 = extractor.extract(article2);
      
      // Both should extract statistics
      expect(facts1.statistics.length).toBeGreaterThanOrEqual(1);
      expect(facts2.statistics.length).toBeGreaterThanOrEqual(1);
      
      // The extracted stats should be different
      const stat1 = facts1.statistics.find(s => s.text.includes('10,000'));
      const stat2 = facts2.statistics.find(s => s.text.includes('5,000'));
      
      expect(stat1).toBeDefined();
      expect(stat2).toBeDefined();
      
      // When compared via the live array API, each article's differing
      // statistic lands in the unique bucket (c203: modernized signature).
      const comparison = extractor.compareArticles([
        { id: 1, host: 'a.example', text: article1.body },
        { id: 2, host: 'b.example', text: article2.body }
      ]);

      expect(comparison).toHaveProperty('statistics');
      expect(comparison.statistics.unique.length).toBeGreaterThan(0);
    });
  });
});
