'use strict';

function fnv1a64(value) {
  const input = Buffer.from(String(value || ''), 'utf8');
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (const byte of input) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }

  return hash.toString(16).padStart(16, '0');
}

module.exports = { fnv1a64 };
