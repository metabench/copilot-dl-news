'use strict';

/**
 * Tests for PerspectiveAnalyzer
 * 
 * @group aggregation
 */

const { PerspectiveAnalyzer, TONE_THRESHOLDS } = require('../../src/aggregation/PerspectiveAnalyzer');

describe('PerspectiveAnalyzer', () => {
  let analyzer;
  
  beforeEach(() => {
    analyzer = new PerspectiveAnalyzer();
  });
  
  describe('constructor', () => {
    it('should create instance with default thresholds', () => {
      expect(analyzer.toneThresholds).toEqual(TONE_THRESHOLDS);
    });
    
    it('should accept custom thresholds', () => {
      const custom = {
        critical: -0.4,
        supportive: 0.4,
        neutral: [-0.4, 0.4]
      };
      const customAnalyzer = new PerspectiveAnalyzer({ toneThresholds: custom });
      expect(customAnalyzer.toneThresholds).toEqual(custom);
    });
  });
  
  describe('_getToneFromScore', () => {
    it('should classify negative scores as critical', () => {
      expect(analyzer._getToneFromScore(-0.5)).toBe('critical');
      expect(analyzer._getToneFromScore(-0.8)).toBe('critical');
    });
    
    it('should classify positive scores as supportive', () => {
      expect(analyzer._getToneFromScore(0.5)).toBe('supportive');
      expect(analyzer._getToneFromScore(0.8)).toBe('supportive');
    });
    
    it('should classify middle scores as neutral', () => {
      expect(analyzer._getToneFromScore(0)).toBe('neutral');
      expect(analyzer._getToneFromScore(0.1)).toBe('neutral');
      expect(analyzer._getToneFromScore(-0.2)).toBe('neutral');
    });
    
    it('should handle threshold boundaries', () => {
      expect(analyzer._getToneFromScore(-0.3)).toBe('neutral'); // Exactly at threshold
      expect(analyzer._getToneFromScore(-0.31)).toBe('critical');
      expect(analyzer._getToneFromScore(0.3)).toBe('neutral'); // Exactly at threshold
      expect(analyzer._getToneFromScore(0.31)).toBe('supportive');
    });
  });
  
  describe('_extractKeywords', () => {
    it('should extract nouns as focus keywords', () => {
      const text = 'The economy showed strong growth in the technology sector';
      const keywords = analyzer._extractKeywords(text);
      
      expect(keywords).toContain('economy');
      expect(keywords).toContain('growth');
      expect(keywords).toContain('technology');
      expect(keywords).toContain('sector');
    });
    
    it('should filter out common words', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const keywords = analyzer._extractKeywords(text);
      
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('over');
    });
    
    it('should limit keyword count', () => {
      const text = 'word '.repeat(50);
      const keywords = analyzer._extractKeywords(text, 10);
      
      expect(keywords.length).toBeLessThanOrEqual(10);
    });
    
    it('should handle empty text', () => {
      const keywords = analyzer._extractKeywords('');
      expect(keywords).toHaveLength(0);
    });
  });
  
  describe('_findProminentEntities', () => {
    it('should count entity occurrences', () => {
      const entities = [
        { text: 'Apple', type: 'ORG', start: 0 },
        { text: 'Apple', type: 'ORG', start: 50 },
        { text: 'Google', type: 'ORG', start: 100 }
      ];
      
      const prominent = analyzer._findProminentEntities(entities);
      
      const appleEntry = prominent.find(e => e.text === 'Apple');
      expect(appleEntry).toBeDefined();
      expect(appleEntry.count).toBe(2);
    });
    
    it('should score by position (earlier = higher)', () => {
      const entities = [
        { text: 'FirstEntity', type: 'ORG', start: 0 },
        { text: 'LastEntity', type: 'ORG', start: 1000 }
      ];
      
      const prominent = analyzer._findProminentEntities(entities);
      
      const first = prominent.find(e => e.text === 'FirstEntity');
      const last = prominent.find(e => e.text === 'LastEntity');
      
      // FirstEntity should rank higher due to earlier position
      const firstIdx = prominent.indexOf(first);
      const lastIdx = prominent.indexOf(last);
      expect(firstIdx).toBeLessThan(lastIdx);
    });
    
    it('should respect limit parameter', () => {
      const entities = Array.from({ length: 20 }, (_, i) => ({
        text: `Entity${i}`,
        type: 'ORG',
        start: i * 10
      }));
      
      const prominent = analyzer._findProminentEntities(entities, 5);
      expect(prominent).toHaveLength(5);
    });
  });
  
  describe('analyzeArticle', () => {
    it('should analyze article perspective', () => {
      const article = {
        id: 1,
        title: 'Great news for the economy',
        body: 'The economy is growing at a fantastic rate. Job creation is excellent and unemployment is at record lows.',
        host: 'positive-news.com'
      };
      
      const perspective = analyzer.analyzeArticle(article);
      
      expect(perspective).toHaveProperty('articleId', 1);
      expect(perspective).toHaveProperty('host', 'positive-news.com');
      expect(perspective).toHaveProperty('tone');
      expect(perspective).toHaveProperty('toneScore');
      expect(perspective).toHaveProperty('focusKeywords');
      expect(perspective).toHaveProperty('prominentEntities');
    });
    
    it('should detect positive tone', () => {
      const article = {
        id: 1,
        title: 'Excellent progress',
        body: 'This is wonderful, amazing, and fantastic news. Everything is improving beautifully.'
      };
      
      const perspective = analyzer.analyzeArticle(article);
      expect(perspective.tone).toBe('supportive');
      expect(perspective.toneScore).toBeGreaterThan(0);
    });
    
    it('should detect negative tone', () => {
      const article = {
        id: 1,
        title: 'Terrible disaster strikes',
        body: 'This is awful, horrible, and terrible news. The situation is getting worse.'
      };
      
      const perspective = analyzer.analyzeArticle(article);
      expect(perspective.tone).toBe('critical');
      expect(perspective.toneScore).toBeLessThan(0);
    });
  });
  
  describe('analyzeCluster', () => {
    it('should analyze multiple articles', () => {
      const articles = [
        { id: 1, title: 'Good news', body: 'Positive content', host: 'a.com' },
        { id: 2, title: 'Bad news', body: 'Negative content', host: 'b.com' }
      ];
      
      const result = analyzer.analyzeCluster(articles);
      
      expect(result).toHaveProperty('perspectives');
      expect(result.perspectives).toHaveLength(2);
      expect(result).toHaveProperty('summary');
    });
    
    it('should calculate cluster summary', () => {
      const articles = [
        { id: 1, title: 'Story', body: 'Content about topic', host: 'a.com' },
        { id: 2, title: 'Story', body: 'More content about topic', host: 'b.com' }
      ];
      
      const result = analyzer.analyzeCluster(articles);
      
      expect(result.summary).toHaveProperty('totalArticles', 2);
      expect(result.summary).toHaveProperty('uniqueHosts');
      expect(result.summary).toHaveProperty('averageToneScore');
      expect(result.summary).toHaveProperty('toneDistribution');
    });
    
    it('should group by host', () => {
      const articles = [
        { id: 1, title: 'A', body: 'Content', host: 'a.com' },
        { id: 2, title: 'B', body: 'Content', host: 'a.com' },
        { id: 3, title: 'C', body: 'Content', host: 'b.com' }
      ];
      
      const result = analyzer.analyzeCluster(articles);
      
      expect(result.summary.uniqueHosts).toBe(2);
    });
  });
  
  describe('comparePerspectives', () => {
    it('should compare two perspectives', () => {
      const p1 = {
        articleId: 1,
        tone: 'supportive',
        toneScore: 0.7,
        focusKeywords: ['economy', 'growth', 'jobs'],
        prominentEntities: [{ text: 'President', type: 'PERSON' }]
      };
      
      const p2 = {
        articleId: 2,
        tone: 'critical',
        toneScore: -0.5,
        focusKeywords: ['economy', 'debt', 'crisis'],
        prominentEntities: [{ text: 'President', type: 'PERSON' }]
      };
      
      const comparison = analyzer.comparePerspectives(p1, p2);
      
      expect(comparison).toHaveProperty('toneAgreement');
      expect(comparison).toHaveProperty('toneDifference');
      expect(comparison).toHaveProperty('sharedKeywords');
      expect(comparison).toHaveProperty('uniqueKeywords');
      expect(comparison).toHaveProperty('sharedEntities');
    });
    
    it('should detect tone agreement', () => {
      const p1 = { tone: 'supportive', toneScore: 0.5, focusKeywords: [], prominentEntities: [] };
      const p2 = { tone: 'supportive', toneScore: 0.6, focusKeywords: [], prominentEntities: [] };
      
      const comparison = analyzer.comparePerspectives(p1, p2);
      expect(comparison.toneAgreement).toBe(true);
    });
    
    it('should detect tone disagreement', () => {
      const p1 = { tone: 'supportive', toneScore: 0.5, focusKeywords: [], prominentEntities: [] };
      const p2 = { tone: 'critical', toneScore: -0.5, focusKeywords: [], prominentEntities: [] };
      
      const comparison = analyzer.comparePerspectives(p1, p2);
      expect(comparison.toneAgreement).toBe(false);
      expect(comparison.toneDifference).toBe(1.0);
    });
    
    it('should find shared and unique keywords', () => {
      const p1 = { tone: 'neutral', toneScore: 0, focusKeywords: ['a', 'b', 'c'], prominentEntities: [] };
      const p2 = { tone: 'neutral', toneScore: 0, focusKeywords: ['b', 'c', 'd'], prominentEntities: [] };
      
      const comparison = analyzer.comparePerspectives(p1, p2);
      
      expect(comparison.sharedKeywords).toContain('b');
      expect(comparison.sharedKeywords).toContain('c');
      expect(comparison.uniqueKeywords.article1).toContain('a');
      expect(comparison.uniqueKeywords.article2).toContain('d');
    });
  });
  
  describe('different sources show different tones', () => {
    it('should detect tonal differences between sources on same story', () => {
      // Simulate same event covered by different sources
      const articles = [
        {
          id: 1,
          title: 'Company announces record profits',
          body: 'The company achieved amazing results with incredible growth. Shareholders are delighted.',
          host: 'business-friendly.com'
        },
        {
          id: 2,
          title: 'Company profits at expense of workers',
          body: 'While profits soar, workers suffer from terrible conditions and poor wages.',
          host: 'labor-advocate.org'
        },
        {
          id: 3,
          title: 'Company reports Q4 earnings',
          body: 'The company announced earnings figures for the quarter. Revenue was up from last year.',
          host: 'neutral-news.com'
        }
      ];
      
      const result = analyzer.analyzeCluster(articles);
      
      // Should have 3 different perspectives
      expect(result.perspectives).toHaveLength(3);
      
      // Find each source's perspective
      const businessPerspective = result.perspectives.find(p => p.host === 'business-friendly.com');
      const laborPerspective = result.perspectives.find(p => p.host === 'labor-advocate.org');
      const neutralPerspective = result.perspectives.find(p => p.host === 'neutral-news.com');
      
      // Business-friendly should be positive
      expect(businessPerspective.toneScore).toBeGreaterThan(0);
      
      // Labor advocate should be negative
      expect(laborPerspective.toneScore).toBeLessThan(0);
      
      // Neutral should be close to zero
      expect(Math.abs(neutralPerspective.toneScore)).toBeLessThan(0.3);
      
      // Tone distribution should show diversity
      expect(result.summary.toneDistribution).toHaveProperty('supportive');
      expect(result.summary.toneDistribution).toHaveProperty('critical');
    });
  });
});
