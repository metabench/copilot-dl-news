'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { 
  createHttpRecordReplay, 
  generateFixtureKey, 
  redactHeaders 
} = require('../../src/utils/fetch/httpRecordReplay');

describe('httpRecordReplay', () => {
  let tempDir;
  
  beforeEach(() => {
    // Create temp directory for fixtures
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'http-record-replay-'));
  });
  
  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  describe('generateFixtureKey', () => {
    it('should generate consistent keys for same URL', () => {
      const key1 = generateFixtureKey('https://example.com/api/data');
      const key2 = generateFixtureKey('https://example.com/api/data');
      expect(key1).toBe(key2);
    });
    
    it('should generate different keys for different URLs', () => {
      const key1 = generateFixtureKey('https://example.com/api/data');
      const key2 = generateFixtureKey('https://example.com/api/other');
      expect(key1).not.toBe(key2);
    });
    
    it('should generate different keys for different methods', () => {
      const key1 = generateFixtureKey('https://example.com/api', { method: 'GET' });
      const key2 = generateFixtureKey('https://example.com/api', { method: 'POST' });
      expect(key1).not.toBe(key2);
    });
    
    it('should normalize query params order', () => {
      const key1 = generateFixtureKey('https://example.com/api?a=1&b=2');
      const key2 = generateFixtureKey('https://example.com/api?b=2&a=1');
      expect(key1).toBe(key2);
    });
    
    it('should include body hash for POST requests', () => {
      const key1 = generateFixtureKey('https://example.com/api', { 
        method: 'POST', 
        body: JSON.stringify({ a: 1 }) 
      });
      const key2 = generateFixtureKey('https://example.com/api', { 
        method: 'POST', 
        body: JSON.stringify({ b: 2 }) 
      });
      expect(key1).not.toBe(key2);
    });
  });
  
  describe('redactHeaders', () => {
    it('should redact sensitive headers', () => {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer secret-token',
        'Cookie': 'session=abc123',
        'X-Custom': 'safe-value'
      };
      
      const redacted = redactHeaders(headers);
      
      expect(redacted['Content-Type']).toBe('application/json');
      expect(redacted['Authorization']).toBe('[REDACTED]');
      expect(redacted['Cookie']).toBe('[REDACTED]');
      expect(redacted['X-Custom']).toBe('safe-value');
    });
    
    it('should handle empty headers', () => {
      expect(redactHeaders({})).toEqual({});
      expect(redactHeaders(null)).toEqual({});
      expect(redactHeaders(undefined)).toEqual({});
    });
  });
  
  describe('createHttpRecordReplay', () => {
    it('should throw on invalid mode', () => {
      expect(() => createHttpRecordReplay({ mode: 'invalid' }))
        .toThrow('Invalid mode "invalid"');
    });
    
    it('should create harness with default mode', () => {
      const harness = createHttpRecordReplay({ 
        fixtureDir: tempDir,
        fetchFn: async () => ({ status: 200 }) 
      });
      expect(harness.mode).toBe('live');
    });
    
    describe('replay mode', () => {
      it('should throw when fixture not found', async () => {
        const harness = createHttpRecordReplay({
          mode: 'replay',
          fixtureDir: tempDir,
          namespace: 'test'
        });
        
        await expect(harness.fetch('https://example.com/missing'))
          .rejects.toThrow('No fixture found');
      });
      
      it('should replay fixture when available', async () => {
        // Create fixture directory
        const fixtureDir = path.join(tempDir, 'test');
        fs.mkdirSync(fixtureDir, { recursive: true });
        
        const harness = createHttpRecordReplay({
          mode: 'replay',
          fixtureDir: tempDir,
          namespace: 'test'
        });
        
        const fixturePath = harness.getFixturePath('https://example.com/api');
        const fixture = {
          url: 'https://example.com/api',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: '{"result": "success"}',
          bodyEncoding: 'utf8'
        };
        fs.writeFileSync(fixturePath, JSON.stringify(fixture), 'utf8');
        
        const response = await harness.fetch('https://example.com/api');
        
        expect(response.status).toBe(200);
        expect(response.ok).toBe(true);
        expect(response._fromFixture).toBe(true);
        
        const data = await response.json();
        expect(data.result).toBe('success');
      });
      
      it('should handle base64 encoded bodies', async () => {
        const fixtureDir = path.join(tempDir, 'test');
        fs.mkdirSync(fixtureDir, { recursive: true });
        
        const harness = createHttpRecordReplay({
          mode: 'replay',
          fixtureDir: tempDir,
          namespace: 'test'
        });
        
        const fixturePath = harness.getFixturePath('https://example.com/binary');
        const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        const fixture = {
          url: 'https://example.com/binary',
          method: 'GET',
          status: 200,
          headers: { 'content-type': 'image/png' },
          body: binaryContent.toString('base64'),
          bodyEncoding: 'base64'
        };
        fs.writeFileSync(fixturePath, JSON.stringify(fixture), 'utf8');
        
        const response = await harness.fetch('https://example.com/binary');
        const buffer = await response.buffer();
        
        expect(Buffer.compare(buffer, binaryContent)).toBe(0);
      });
    });
    
    describe('record mode', () => {
      it('should record response to fixture', async () => {
        const mockFetch = jest.fn().mockResolvedValue({
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'application/json']]),
          clone: function() { return this; },
          text: async () => '{"recorded": true}'
        });
        
        const harness = createHttpRecordReplay({
          mode: 'record',
          fixtureDir: tempDir,
          namespace: 'test',
          fetchFn: mockFetch,
          logger: { debug: jest.fn() }
        });
        
        await harness.fetch('https://example.com/record-me');
        
        expect(mockFetch).toHaveBeenCalledWith('https://example.com/record-me', {});
        expect(harness.hasFixture('https://example.com/record-me')).toBe(true);
        
        // Verify fixture content
        const fixturePath = harness.getFixturePath('https://example.com/record-me');
        const saved = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        expect(saved.status).toBe(200);
        expect(saved.body).toBe('{"recorded": true}');
      });
    });
    
    describe('utility methods', () => {
      it('should list fixtures in namespace', () => {
        const fixtureDir = path.join(tempDir, 'list-test');
        fs.mkdirSync(fixtureDir, { recursive: true });
        fs.writeFileSync(path.join(fixtureDir, 'a.json'), '{}');
        fs.writeFileSync(path.join(fixtureDir, 'b.json'), '{}');
        fs.writeFileSync(path.join(fixtureDir, 'not-fixture.txt'), 'x');
        
        const harness = createHttpRecordReplay({
          mode: 'replay',
          fixtureDir: tempDir,
          namespace: 'list-test'
        });
        
        const fixtures = harness.listFixtures();
        expect(fixtures).toHaveLength(2);
        expect(fixtures.every(f => f.endsWith('.json'))).toBe(true);
      });
      
      it('should clear fixtures', () => {
        const fixtureDir = path.join(tempDir, 'clear-test');
        fs.mkdirSync(fixtureDir, { recursive: true });
        fs.writeFileSync(path.join(fixtureDir, 'a.json'), '{}');
        fs.writeFileSync(path.join(fixtureDir, 'b.json'), '{}');
        
        const harness = createHttpRecordReplay({
          mode: 'replay',
          fixtureDir: tempDir,
          namespace: 'clear-test'
        });
        
        const cleared = harness.clearFixtures();
        expect(cleared).toBe(2);
        expect(harness.listFixtures()).toHaveLength(0);
      });
    });
  });
});
