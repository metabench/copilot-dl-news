'use strict';

/**
 * TopicModeler Tests
 * 
 * Tests for seed-based topic classification.
 */

const path = require('path');
const { TopicModeler, tokenize, calculateTermFrequencies, STOPWORDS } = require('../../../src/analysis/topics/TopicModeler');

describe('TopicModeler', () => {
  describe('tokenize()', () => {
    it('should tokenize text into lowercase words', () => {
      const tokens = tokenize('Hello World Test');
      expect(tokens).toEqual(['hello', 'world', 'test']);
    });
    
    it('should remove punctuation', () => {
      const tokens = tokenize('Hello, World! Test.');
      expect(tokens).toEqual(['hello', 'world', 'test']);
    });
    
    it('should filter short words (<3 chars)', () => {
      const tokens = tokenize('I am a test of the system');
      expect(tokens).not.toContain('am');
      expect(tokens).not.toContain('of');
    });
    
    it('should filter stopwords', () => {
      const tokens = tokenize('The quick brown fox jumps over the lazy dog');
      expect(tokens).not.toContain('the');
      expect(tokens).not.toContain('over');
      expect(tokens).toContain('quick');
      expect(tokens).toContain('brown');
      expect(tokens).toContain('fox');
    });
    
    it('should return empty array for null/empty input', () => {
      expect(tokenize(null)).toEqual([]);
      expect(tokenize('')).toEqual([]);
      expect(tokenize(undefined)).toEqual([]);
    });
    
    it('should filter pure numbers', () => {
      const tokens = tokenize('In 2024 there were 100 articles');
      expect(tokens).not.toContain('2024');
      expect(tokens).not.toContain('100');
      expect(tokens).toContain('articles');
    });
  });
  
  describe('calculateTermFrequencies()', () => {
    it('should calculate term frequencies', () => {
      const tokens = ['apple', 'banana', 'apple', 'cherry'];
      const tf = calculateTermFrequencies(tokens);
      
      expect(tf.get('apple')).toBe(0.5); // 2/4
      expect(tf.get('banana')).toBe(0.25); // 1/4
      expect(tf.get('cherry')).toBe(0.25); // 1/4
    });
    
    it('should return empty map for empty input', () => {
      const tf = calculateTermFrequencies([]);
      expect(tf.size).toBe(0);
    });
  });
  
  describe('TopicModeler class', () => {
    let modeler;
    
    beforeEach(async () => {
      modeler = new TopicModeler({
        seedTopicsPath: path.join(__dirname, '../../../data/seed-topics.json'),
        logger: { log: jest.fn(), error: jest.fn() }
      });
      await modeler.initialize();
    });
    
    describe('initialization', () => {
      it('should load seed topics', () => {
        expect(modeler.topics.length).toBeGreaterThan(0);
      });
      
      it('should have at least 20 seed topics', () => {
        expect(modeler.topics.length).toBeGreaterThanOrEqual(20);
      });
      
      it('should build keyword index', () => {
        expect(modeler.keywordIndex.size).toBeGreaterThan(0);
      });
      
      it('should mark as initialized', () => {
        expect(modeler._initialized).toBe(true);
      });
    });
    
    describe('classify()', () => {
      it('should classify politics article', () => {
        const text = `The presidential election campaign is heating up as candidates 
                     debate policy in congress. The senate voted on new legislation 
                     while the governor announced his endorsement.`;
        
        const topics = modeler.classify(text);
        
        expect(topics.length).toBeGreaterThan(0);
        expect(topics[0].topicName).toBe('Politics');
        expect(topics[0].probability).toBeGreaterThan(0);
      });
      
      it('should classify technology article', () => {
        const text = `Apple announced a new iPhone app that uses artificial intelligence.
                     The tech startup raised funding for their innovative software.
                     Google and Microsoft are competing in the AI space.`;
        
        const topics = modeler.classify(text);
        
        expect(topics.length).toBeGreaterThan(0);
        const techTopic = topics.find(t => t.topicName === 'Technology');
        expect(techTopic).toBeDefined();
      });
      
      it('should classify sports article', () => {
        const text = `The championship game was incredible. The team's star player 
                     scored the winning goal as fans in the stadium cheered. 
                     The coach praised the athletes after their tournament victory.`;
        
        const topics = modeler.classify(text);
        
        expect(topics.length).toBeGreaterThan(0);
        const sportsTopic = topics.find(t => t.topicName === 'Sports');
        expect(sportsTopic).toBeDefined();
      });
      
      it('should classify health article', () => {
        const text = `Doctors at the hospital are treating patients with a new vaccine.
                     The FDA approved a drug for cancer treatment. Medical researchers
                     published a study on the pandemic virus.`;
        
        const topics = modeler.classify(text);
        
        expect(topics.length).toBeGreaterThan(0);
        const healthTopic = topics.find(t => t.topicName === 'Health');
        expect(healthTopic).toBeDefined();
      });
      
      it('should return multiple topics for mixed content', () => {
        const text = `Tech company stock prices rose after the election results.
                     The president's policy on artificial intelligence will affect
                     how software startups operate in the market economy.`;
        
        const topics = modeler.classify(text);
        
        expect(topics.length).toBeGreaterThan(1);
      });
      
      it('should limit to maxTopics', () => {
        const text = `This article covers politics, technology, sports, health, 
                     business, and entertainment all at once with many keywords.`;
        
        const topics = modeler.classify(text, { maxTopics: 2 });
        
        expect(topics.length).toBeLessThanOrEqual(2);
      });
      
      it('should return empty for text with no matches', () => {
        const text = 'xyz abc def ghi jkl mno pqr stu vwx';
        
        const topics = modeler.classify(text, { minScore: 0.5 });
        
        expect(topics.length).toBe(0);
      });
      
      it('should return empty for empty text', () => {
        const topics = modeler.classify('');
        expect(topics.length).toBe(0);
      });
      
      it('should include matched keywords in result', () => {
        const text = 'The election campaign featured debates about senate policy.';
        
        const topics = modeler.classify(text);
        
        expect(topics[0].matchedKeywords).toBeDefined();
        expect(topics[0].matchedKeywords.length).toBeGreaterThan(0);
        expect(topics[0].matchedKeywords).toContain('election');
      });
      
      it('should have probability between 0 and 1', () => {
        const text = 'Politics election vote congress senate legislation campaign';
        
        const topics = modeler.classify(text);
        
        for (const topic of topics) {
          expect(topic.probability).toBeGreaterThanOrEqual(0);
          expect(topic.probability).toBeLessThanOrEqual(1);
        }
      });
    });
    
    describe('classifyBatch()', () => {
      it('should classify multiple articles', () => {
        const articles = [
          { id: 1, text: 'Election campaign debate congress policy vote' },
          { id: 2, text: 'Football game stadium team player score win' },
          { id: 3, text: 'Stock market economy investment profit revenue' }
        ];
        
        const results = modeler.classifyBatch(articles);
        
        expect(results.length).toBe(3);
        expect(results[0].articleId).toBe(1);
        expect(results[0].topics.length).toBeGreaterThan(0);
      });
    });
    
    describe('getTopic()', () => {
      it('should get topic by ID', () => {
        const topic = modeler.getTopic(1);
        
        expect(topic).toBeDefined();
        expect(topic.id).toBe(1);
        expect(topic.name).toBeDefined();
      });
      
      it('should return null for invalid ID', () => {
        const topic = modeler.getTopic(9999);
        expect(topic).toBeNull();
      });
    });
    
    describe('getTopicByName()', () => {
      it('should get topic by name (case insensitive)', () => {
        const topic = modeler.getTopicByName('politics');
        
        expect(topic).toBeDefined();
        expect(topic.name.toLowerCase()).toBe('politics');
      });
      
      it('should return null for unknown name', () => {
        const topic = modeler.getTopicByName('nonexistent');
        expect(topic).toBeNull();
      });
    });
    
    describe('getAllTopics()', () => {
      it('should return all topics', () => {
        const topics = modeler.getAllTopics();
        
        expect(topics.length).toBeGreaterThan(0);
        expect(topics[0].id).toBeDefined();
        expect(topics[0].name).toBeDefined();
        expect(topics[0].keywords).toBeDefined();
      });
    });
    
    describe('getStats()', () => {
      it('should return statistics', () => {
        const stats = modeler.getStats();
        
        expect(stats.initialized).toBe(true);
        expect(stats.topicCount).toBeGreaterThan(0);
        expect(stats.seedTopicCount).toBeGreaterThan(0);
        expect(stats.keywordCount).toBeGreaterThan(0);
        expect(stats.minScore).toBeDefined();
        expect(stats.maxTopics).toBeDefined();
      });
    });
  });
  
  describe('error handling', () => {
    it('should throw if not initialized', () => {
      const modeler = new TopicModeler();
      
      expect(() => modeler.classify('test')).toThrow('not initialized');
    });
    
    it('should throw for invalid seed topics path', async () => {
      const modeler = new TopicModeler({
        seedTopicsPath: '/nonexistent/path.json',
        logger: { log: jest.fn(), error: jest.fn() }
      });
      
      await expect(modeler.initialize()).rejects.toThrow();
    });
  });
});
