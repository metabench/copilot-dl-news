/**
 * Tests for ContentValidationService
 * 
 * @see src/crawler/services/ContentValidationService.js
 */

const { ContentValidationService } = require('../ContentValidationService');

describe('ContentValidationService', () => {
  let service;
  let mockTelemetry;

  beforeEach(() => {
    mockTelemetry = {
      problem: jest.fn()
    };
    service = new ContentValidationService({
      telemetry: mockTelemetry,
      minBodyLength: 100
    });
  });

  describe('validate', () => {
    const url = 'https://example.com/article';

    test('should accept valid content', () => {
      const html = `
        <html>
          <body>
            <article>
              <p>This is a valid article with enough content to pass the minimum length requirement.
                 It contains multiple paragraphs and real text content that would be expected
                 from a legitimate news article or blog post.</p>
              <p>Here is more content to ensure we exceed the minimum threshold.</p>
            </article>
          </body>
        </html>
      `;

      const result = service.validate({ url, html });
      expect(result.valid).toBe(true);
    });

    test('should reject content that is too short', () => {
      const html = '<html><body><p>Short</p></body></html>';

      const result = service.validate({ url, html });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('body-too-short');
      expect(result.failureType).toBe('soft');
    });

    test('should reject null/empty content', () => {
      expect(service.validate({ url, html: null }).valid).toBe(false);
      expect(service.validate({ url, html: '' }).valid).toBe(false);
    });

    test('should reject based on HTTP status code', () => {
      const html = '<html><body>Some content here that is long enough to pass length checks normally.</body></html>';

      const result = service.validate({ url, html, statusCode: 403 });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('http-403');
      expect(result.failureType).toBe('hard');
    });

    describe('garbage signature detection', () => {
      test('should reject a genuinely empty SPA shell (noscript fallback, no real content)', () => {
        const html = `
          <html><body>
            <noscript>Please enable JavaScript to continue using this application.</noscript>
            <div id="app"></div>
          </body></html>
        `;

        const result = service.validate({ url, html });
        // Real gap found live 2026-07-20 (Globe and Mail): a <noscript> tag is
        // routine boilerplate on nearly every modern JS-framework site,
        // present whether or not the page ACTUALLY needs JS to show content.
        // It must never by itself decide rejection — an empty shell like this
        // one is correctly still rejected, but via "no real content extracted"
        // (no-extracted-content), not via matching the noscript text.
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('no-extracted-content');
        expect(result.failureType).toBe('soft');
      });

      test('should ACCEPT a real page that has both genuine article content AND a routine noscript fallback', () => {
        // This is exactly the Globe and Mail shape found live 2026-07-20: a
        // server-rendered article with full real text, plus the standard
        // defensive <noscript>...</noscript> tag every React/Vue/Angular site
        // ships. Before the fix, the noscript text alone tripped the
        // javascript-required signature and threw away perfectly good,
        // already-downloaded content.
        const html = `
          <html><body>
            <script>window.__DATA__ = {};</script>
            <noscript>Please enable JavaScript to view this content.</noscript>
            <article>
              <h1>Belarusian diaspora in Alberta targeted for criticizing Lukashenko regime</h1>
              <p>The report, published by the Digital Forensic Research Lab of the Atlantic
                 Council, documents cases among the Belarusian community in Alberta who say
                 they have faced harassment for speaking out against the government.</p>
              <p>Researchers interviewed a dozen members of the diaspora community over several
                 months, cataloguing a pattern of intimidation that officials say has intensified
                 since the disputed election.</p>
            </article>
          </body></html>
        `;

        const result = service.validate({ url, html });
        expect(result.valid).toBe(true);
      });

      test('should reject Cloudflare challenge pages', () => {
        const html = `
          <html><body>
            <div>Checking your browser before accessing example.com</div>
            <div>This process is automatic. Your browser will redirect shortly.</div>
            <div>DDoS protection by Cloudflare</div>
          </body></html>
        `;

        const result = service.validate({ url, html });
        expect(result.valid).toBe(false);
        // The pattern matched is 'checking your browser' which maps to bot-protection
        expect(result.failureType).toBe('soft');
      });

      test('should reject access denied pages with hard failure', () => {
        const html = `
          <html><body>
            <h1>403 Forbidden</h1>
            <p>Access Denied. You do not have permission to access this resource.</p>
          </body></html>
        `;

        const result = service.validate({ url, html });
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('access-denied');
        expect(result.failureType).toBe('hard');
      });

      test('should reject rate limit pages', () => {
        const html = `
          <html><body>
            <h1>Too Many Requests</h1>
            <p>You have exceeded the rate limit. Please slow down.</p>
          </body></html>
        `;

        const result = service.validate({ url, html });
        expect(result.valid).toBe(false);
        // Matched pattern is 'too many requests' which correctly triggers rejection
        expect(result.failureType).toBe('soft');
      });

      test('should reject captcha/verification pages', () => {
        const html = `
          <html><body>
            <div>Verifying you are human</div>
            <div>Please complete the captcha below</div>
            <div class="captcha-box"></div>
          </body></html>
        `;

        const result = service.validate({ url, html });
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('captcha-required');
      });
    });

    test('should emit telemetry on rejection', () => {
      const html = '<html><body>Access Denied</body></html>';
      service.validate({ url, html });

      expect(mockTelemetry.problem).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'content-validation-rejected'
        })
      );
    });
  });

  describe('quickCheck', () => {
    test('should return true for suspicious content', () => {
      expect(service.quickCheck('')).toBe(true);
      expect(service.quickCheck('Please enable JavaScript')).toBe(true);
      expect(service.quickCheck('Checking your browser')).toBe(true);
      expect(service.quickCheck('Access Denied')).toBe(true);
      expect(service.quickCheck('Cloudflare protection')).toBe(true);
    });

    test('should return false for normal content', () => {
      const normalContent = `
        <html>
          <head><title>News Article</title></head>
          <body>
            <h1>Breaking News</h1>
            <p>This is a legitimate news article with real content.</p>
            <p>It contains multiple paragraphs of information.</p>
          </body>
        </html>
      `;
      expect(service.quickCheck(normalContent)).toBe(false);
    });
  });

  describe('statistics', () => {
    test('should track validation statistics', () => {
      const validHtml = '<html><body>' + 'x'.repeat(200) + '</body></html>';
      const invalidHtml = '<html><body>Access Denied - you do not have permission</body></html>';

      service.validate({ url: 'https://a.com', html: validHtml });
      const result1 = service.validate({ url: 'https://b.com', html: invalidHtml });
      const result2 = service.validate({ url: 'https://c.com', html: invalidHtml });

      const stats = service.getStats();
      expect(stats.validated).toBe(3);
      expect(stats.rejected).toBe(2);
      // Check that reasons are being tracked
      expect(Object.keys(stats.byReason).length).toBeGreaterThan(0);
      // Both rejections should have same reason
      expect(result1.reason).toBe(result2.reason);
    });

    test('should reset statistics', () => {
      service.validate({ url: 'https://a.com', html: '' });
      service.resetStats();
      
      const stats = service.getStats();
      expect(stats.validated).toBe(0);
      expect(stats.rejected).toBe(0);
    });
  });

  describe('custom configuration', () => {
    test('should respect custom minimum body length', () => {
      const strictService = new ContentValidationService({
        minBodyLength: 1000
      });

      const html = '<html><body>' + 'x'.repeat(500) + '</body></html>';
      const result = strictService.validate({ url: 'https://test.com', html });
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('body-too-short');
    });

    test('should accept custom garbage signatures', () => {
      const customService = new ContentValidationService({
        minBodyLength: 10,
        garbageSignatures: [/custom\s+garbage/i]
      });

      const html = '<html><body>This page contains custom garbage content</body></html>';
      const result = customService.validate({ url: 'https://test.com', html });
      
      expect(result.valid).toBe(false);
    });
  });
});
