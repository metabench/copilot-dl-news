/**
 * Tests for HTML Utilities Module
 */

const {
  escapeHtml,
  ensureRenderNav,
  formatBytes,
  formatNumber,
  toQueryString,
  safeTracePre,
  createRenderContext,
  html
} = require('../html');

describe('HTML Utilities', () => {
  describe('escapeHtml', () => {
    test('escapes HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    test('escapes ampersands', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    test('escapes single quotes', () => {
      expect(escapeHtml("It's working")).toBe('It&#39;s working');
    });

    test('handles null and undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    test('converts non-strings to strings', () => {
      expect(escapeHtml(123)).toBe('123');
      expect(escapeHtml(true)).toBe('true');
    });
  });

  describe('ensureRenderNav', () => {
    test('returns function if valid', () => {
      const mockNav = () => '<nav>Test</nav>';
      expect(ensureRenderNav(mockNav)).toBe(mockNav);
    });

    test('returns fallback for null', () => {
      const result = ensureRenderNav(null)();
      expect(result).toContain('<nav');
      expect(result).toContain('placeholder-nav');
    });

    test('returns fallback for non-function', () => {
      const result = ensureRenderNav('not a function')();
      expect(result).toContain('Navigation not available');
    });
  });

  describe('formatBytes', () => {
    test('formats bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1.0 MB');
      expect(formatBytes(1073741824)).toBe('1.0 GB');
    });

    test('handles null', () => {
      expect(formatBytes(null)).toBe('');
      expect(formatBytes(undefined)).toBe('');
    });

    test('handles non-numeric values', () => {
      expect(formatBytes('invalid')).toBe('0 B');
    });
  });

  describe('formatNumber', () => {
    test('formats numbers with thousand separators', () => {
      const result = formatNumber(1000000);
      // Result varies by locale, but should contain the number
      expect(result).toContain('1');
      expect(result).toContain('000');
    });

    test('handles null', () => {
      expect(formatNumber(null)).toBe('');
      expect(formatNumber(undefined)).toBe('');
    });
  });

  describe('toQueryString', () => {
    test('converts object to query string', () => {
      const params = { foo: 'bar', baz: 'qux' };
      const result = toQueryString(params);
      expect(result).toBe('?foo=bar&baz=qux');
    });

    test('skips null and empty values', () => {
      const params = { foo: 'bar', empty: '', nothing: null };
      const result = toQueryString(params);
      expect(result).toBe('?foo=bar');
    });

    test('returns empty string for empty object', () => {
      expect(toQueryString({})).toBe('');
    });

    test('encodes special characters', () => {
      const params = { query: 'hello world', special: 'a&b' };
      const result = toQueryString(params);
      expect(result).toContain('hello+world');
      expect(result).toContain('a%26b');
    });
  });

  describe('safeTracePre', () => {
    test('returns trace end function if valid', () => {
      const endFn = jest.fn();
      const trace = { pre: jest.fn(() => endFn) };
      const result = safeTracePre(trace, 'test');
      expect(trace.pre).toHaveBeenCalledWith('test');
      expect(result).toBe(endFn);
    });

    test('returns no-op for null trace', () => {
      const result = safeTracePre(null, 'test');
      expect(typeof result).toBe('function');
      expect(result()).toBeUndefined();
    });

    test('returns no-op if pre throws', () => {
      const trace = { pre: () => { throw new Error('boom'); } };
      const result = safeTracePre(trace, 'test');
      expect(typeof result).toBe('function');
    });
  });

  describe('createRenderContext', () => {
    test('creates context with all utilities', () => {
      const mockNav = () => '<nav>Nav</nav>';
      const context = createRenderContext({ renderNav: mockNav });
      
      expect(typeof context.escapeHtml).toBe('function');
      expect(typeof context.formatBytes).toBe('function');
      expect(typeof context.formatNumber).toBe('function');
      expect(typeof context.renderNav).toBe('function');
    });

    test('provides safe navigation fallback', () => {
      const context = createRenderContext({});
      const nav = context.renderNav();
      expect(nav).toContain('<nav');
    });

    test('includes optional properties', () => {
      const db = { prepare: () => {} };
      const context = createRenderContext({ 
        db, 
        urlsDbPath: '/path/to/db' 
      });
      
      expect(context.db).toBe(db);
      expect(context.urlsDbPath).toBe('/path/to/db');
    });
  });

  describe('html tagged template', () => {
    test('auto-escapes interpolated values', () => {
      const userInput = '<script>alert("xss")</script>';
      const result = html`<h1>${userInput}</h1>`;
      expect(result).toBe('<h1>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</h1>');
    });

    test('allows raw HTML with html.raw()', () => {
      const trusted = '<strong>Safe</strong>';
      const result = html`<div>${html.raw(trusted)}</div>`;
      expect(result).toBe('<div><strong>Safe</strong></div>');
    });

    test('handles multiple interpolations', () => {
      const a = 'foo';
      const b = '<bar>';
      const result = html`<div>${a} and ${b}</div>`;
      expect(result).toBe('<div>foo and &lt;bar&gt;</div>');
    });

    test('handles undefined values', () => {
      const result = html`<div>${undefined}</div>`;
      expect(result).toBe('<div></div>');
    });

    test('mixes raw and escaped values', () => {
      const safe = html.raw('<nav>Nav</nav>');
      const unsafe = '<script>xss</script>';
      const result = html`${safe}<div>${unsafe}</div>`;
      expect(result).toBe('<nav>Nav</nav><div>&lt;script&gt;xss&lt;/script&gt;</div>');
    });
  });
});
