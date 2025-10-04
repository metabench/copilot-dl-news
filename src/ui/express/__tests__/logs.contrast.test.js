const http = require('http');
const { startServer } = require('../server');

function fetchText(port, path) {
  return new Promise((resolve, reject) => {
    http
      .get({ hostname: '127.0.0.1', port, path }, (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (buf += chunk));
        res.on('end', () => resolve({ status: res.statusCode, text: buf }));
      })
      .on('error', reject);
  });
}

function getBlock(source, startIndex) {
  const openBrace = source.indexOf('{', startIndex);
  if (openBrace === -1) {
    throw new Error('Unable to locate opening brace');
  }
  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          block: source.slice(openBrace + 1, i),
          endIndex: i + 1,
        };
      }
    }
  }
  throw new Error('Unmatched braces in CSS source');
}

function extractRule(source, selector) {
  const idx = source.indexOf(selector);
  if (idx === -1) {
    throw new Error(`Selector ${selector} not found`);
  }
  return getBlock(source, idx).block;
}

function extractMediaBlock(source, mediaQuery) {
  const idx = source.indexOf(mediaQuery);
  if (idx === -1) {
    throw new Error(`Media query ${mediaQuery} not found`);
  }
  return getBlock(source, idx).block;
}

function parseDeclarations(block) {
  return block
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((acc, decl) => {
      const colon = decl.indexOf(':');
      if (colon === -1) return acc;
      const prop = decl.slice(0, colon).trim().toLowerCase();
      const value = decl.slice(colon + 1).trim();
      acc[prop] = value;
      return acc;
    }, {});
}

function resolveVar(value, declarations) {
  const importantStripped = value.replace(/!important\s*$/i, '').trim();
  const varMatch = importantStripped.match(/^var\((--[\w-]+)\)$/i);
  if (!varMatch) {
    return importantStripped;
  }
  const varName = varMatch[1];
  const resolved = declarations[varName];
  if (!resolved) {
    throw new Error(`CSS variable ${varName} not defined in rule`);
  }
  return resolved.trim();
}

function parseColor(color) {
  const normalized = color.replace(/!important\s*$/i, '').trim().toLowerCase();
  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return [r, g, b];
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return [r, g, b];
    }
    throw new Error(`Unexpected hex color length for ${color}`);
  }
  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/);
  if (rgbMatch) {
    const parts = rgbMatch[1]
      .split(',')
      .map((part) => part.trim())
      .map((part, idx) => (idx < 3 ? parseFloat(part) : part));
    return parts.slice(0, 3).map((component) => Number(component));
  }
  throw new Error(`Unsupported color format: ${color}`);
}

function toLinear(channel) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(foreground, background) {
  const lumA = relativeLuminance(foreground);
  const lumB = relativeLuminance(background);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('crawler UI logs contrast', () => {
  let server;
  let port;

  beforeAll(async () => {
    const prev = process.env.PORT;
    process.env.PORT = '0';
    server = startServer();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const addr = server.address();
    port = typeof addr === 'object' ? addr.port : prev || 3000;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('log text and error colors meet WCAG AA contrast', async () => {
    const cssRes = await fetchText(port, '/crawler.css');
    expect(cssRes.status).toBe(200);

    const darkQuery = '@media (prefers-color-scheme: dark)';
    const darkIdx = cssRes.text.indexOf(darkQuery);
    expect(darkIdx).toBeGreaterThan(-1);

    const lightCss = cssRes.text.slice(0, darkIdx);
  const lightPreDecls = parseDeclarations(extractRule(lightCss, 'pre {'));
    const lightBg = resolveVar(lightPreDecls['background-color'], lightPreDecls);
    const lightFg = lightPreDecls.color;

    expect(lightBg).toBeDefined();
    expect(lightFg).toBeDefined();

    const lightRatio = contrastRatio(parseColor(lightFg), parseColor(lightBg));
    expect(lightRatio).toBeGreaterThanOrEqual(4.5);

  const logErrorDecls = parseDeclarations(extractRule(cssRes.text, '.log-error {'));
    const errorColor = logErrorDecls.color;
    expect(errorColor).toBeDefined();

    const errorLightRatio = contrastRatio(parseColor(errorColor), parseColor(lightBg));
    expect(errorLightRatio).toBeGreaterThanOrEqual(4.5);

    const darkBlock = extractMediaBlock(cssRes.text, darkQuery);
  const darkPreDecls = parseDeclarations(extractRule(darkBlock, 'pre {'));
    const darkBg = resolveVar(darkPreDecls['background-color'], darkPreDecls);
    const darkFg = darkPreDecls.color;

    expect(darkBg).toBeDefined();
    expect(darkFg).toBeDefined();

    const darkRatio = contrastRatio(parseColor(darkFg), parseColor(darkBg));
    expect(darkRatio).toBeGreaterThanOrEqual(4.5);

    const errorDarkRatio = contrastRatio(parseColor(errorColor), parseColor(darkBg));
    expect(errorDarkRatio).toBeGreaterThanOrEqual(4.5);
  });
});
