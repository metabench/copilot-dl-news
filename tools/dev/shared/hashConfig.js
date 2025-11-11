'use strict';

const HASH_PRIMARY_ENCODING = 'base64';
const HASH_FALLBACK_ENCODING = 'hex';
const HASH_BYTE_LENGTH = 8;

function computeLengthForEncoding(encoding) {
  if (encoding === 'base64') {
    return Math.ceil(HASH_BYTE_LENGTH / 3) * 4;
  }
  if (encoding === 'hex') {
    return HASH_BYTE_LENGTH * 2;
  }
  return 0;
}

const HASH_LENGTH_BY_ENCODING = Object.freeze({
  base64: computeLengthForEncoding('base64'),
  hex: computeLengthForEncoding('hex')
});

const HASH_CHARSETS = Object.freeze({
  base64: /^[A-Za-z0-9+/=]+$/,
  hex: /^[0-9a-f]+$/i
});

function normalizeHashEncoding(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (HASH_LENGTH_BY_ENCODING[normalized]) {
    return normalized;
  }
  return HASH_FALLBACK_ENCODING;
}

function encodeHash(buffer, encoding = HASH_PRIMARY_ENCODING) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('encodeHash expects a Buffer input.');
  }
  const normalized = normalizeHashEncoding(encoding);
  const slice = buffer.slice(0, HASH_BYTE_LENGTH);
  if (normalized === 'base64') {
    const digest = slice.toString('base64');
    return digest.slice(0, HASH_LENGTH_BY_ENCODING.base64);
  }
  if (normalized === 'hex') {
    const digest = slice.toString('hex');
    return digest.slice(0, HASH_LENGTH_BY_ENCODING.hex);
  }
  return slice.toString(normalized);
}

module.exports = {
  HASH_PRIMARY_ENCODING,
  HASH_FALLBACK_ENCODING,
  HASH_BYTE_LENGTH,
  HASH_LENGTH_BY_ENCODING,
  HASH_CHARSETS,
  normalizeHashEncoding,
  encodeHash
};
