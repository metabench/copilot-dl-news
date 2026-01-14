'use strict';

const { CliArgumentParser } = require('../../src/shared/utils/CliArgumentParser');
const { CliFormatter } = require('../../src/shared/utils/CliFormatter');

const fmt = new CliFormatter();

function normalizeToArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return [value];
  }
  return [String(value)];
}

function splitList(values) {
  return values
    .flatMap((value) => String(value).split(','))
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseCodepointToken(token) {
  const raw = String(token).trim();
  if (!raw) {
    throw new Error('Empty codepoint token');
  }

  const normalized = raw
    .replace(/^\\u\{([0-9a-fA-F]+)\}$/u, '$1')
    .replace(/^U\+/i, '')
    .replace(/^0x/i, '');

  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`Invalid codepoint token: "${raw}"`);
  }

  const codepoint = Number.parseInt(normalized, 16);
  if (!Number.isFinite(codepoint) || codepoint < 0 || codepoint > 0x10FFFF) {
    throw new Error(`Invalid codepoint value: "${raw}"`);
  }

  return codepoint;
}

function buildEntryFromText(text, source) {
  const value = String(text);
  const utf8 = Buffer.from(value, 'utf8');

  return {
    source,
    text: value,
    utf8Hex: utf8.toString('hex'),
    utf8Base64: utf8.toString('base64'),
    codepoints: Array.from(value).map((ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase()}`)
  };
}

function decodeFromHex(hexString) {
  const raw = String(hexString).trim().replace(/\s+/g, '').replace(/^0x/i, '');
  if (!raw) {
    throw new Error('Invalid --utf8-hex payload: empty');
  }
  if (raw.length % 2 !== 0) {
    throw new Error(`Invalid --utf8-hex payload: expected even-length hex, got ${raw.length}`);
  }
  if (!/^[0-9a-f]+$/i.test(raw)) {
    throw new Error('Invalid --utf8-hex payload: must be hex');
  }
  return Buffer.from(raw, 'hex').toString('utf8');
}

function decodeFromBase64(base64String) {
  const raw = String(base64String).trim().replace(/\s+/g, '');
  if (!raw) {
    throw new Error('Invalid --utf8-base64 payload: empty');
  }
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function createCliParser() {
  const parser = new CliArgumentParser(
    'emoji-encode',
    'Encode/decode emoji text to UTF-8 hex/base64 (Windows-safe)'
  );

  parser
    .add('--text <value...>', 'Raw text to encode (may be mangled by shells for emoji)')
    .add('--codepoint <value...>', 'Codepoint(s) to encode, e.g. U+1F9E0 or U+2699,U+FE0F')
    .add('--utf8-hex <value...>', 'Decode UTF-8 bytes from hex (b16)', [])
    .add('--utf8-base64 <value...>', 'Decode UTF-8 bytes from base64 (b64)', [])
    .add('--json', 'Output JSON', false, 'boolean');

  return parser;
}

async function main() {
  const parser = createCliParser();
  let options;

  try {
    options = parser.parse(process.argv);
  } catch (error) {
    fmt.error(error.message || String(error));
    process.exitCode = 1;
    return;
  }

  const textInputs = normalizeToArray(options.text);
  const cpInputs = normalizeToArray(options.codepoint);
  const hexInputs = normalizeToArray(options.utf8Hex);
  const b64Inputs = normalizeToArray(options.utf8Base64);

  const hasAny = textInputs.length || cpInputs.length || hexInputs.length || b64Inputs.length;
  if (!hasAny) {
    fmt.error('No inputs provided. Use --codepoint, --utf8-hex, --utf8-base64, or --text.');
    process.exitCode = 1;
    return;
  }

  const entries = [];

  for (const input of textInputs) {
    entries.push(buildEntryFromText(input, { kind: 'text', value: String(input) }));
  }

  for (const input of cpInputs) {
    const pieces = splitList([input]);
    const cps = pieces.map(parseCodepointToken);
    const text = String.fromCodePoint(...cps);
    entries.push(buildEntryFromText(text, { kind: 'codepoint', value: String(input) }));
  }

  for (const input of hexInputs) {
    const text = decodeFromHex(input);
    entries.push(buildEntryFromText(text, { kind: 'utf8Hex', value: String(input) }));
  }

  for (const input of b64Inputs) {
    const text = decodeFromBase64(input);
    entries.push(buildEntryFromText(text, { kind: 'utf8Base64', value: String(input) }));
  }

  const payload = {
    tool: 'emoji-encode',
    count: entries.length,
    entries
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  fmt.header('Emoji Encode');
  fmt.summary({ Entries: entries.length });
  fmt.blank();

  entries.forEach((entry) => {
    const label = `${entry.source.kind}:${entry.source.value}`;
    console.log(fmt.COLORS.cyan(label));
    console.log(`  text        ${entry.text}`);
    console.log(`  utf8Hex      ${fmt.COLORS.muted(entry.utf8Hex)}`);
    console.log(`  utf8Base64   ${fmt.COLORS.muted(entry.utf8Base64)}`);
    console.log(`  codepoints   ${fmt.COLORS.muted(entry.codepoints.join(' '))}`);
    fmt.blank();
  });
}

if (require.main === module) {
  main().catch((error) => {
    fmt.error(error.message || String(error));
    if (error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  });
}

module.exports = {
  parseCodepointToken,
  decodeFromHex,
  decodeFromBase64,
  buildEntryFromText
};

