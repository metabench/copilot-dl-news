'use strict';

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

function validateInteger(value, {
  fieldName = 'value',
  contextLabel = 'configuration',
  min = -MAX_SAFE_INTEGER,
  max = MAX_SAFE_INTEGER,
  allowUndefined = false
} = {}) {
  if (value === undefined || value === null) {
    if (allowUndefined) {
      return undefined;
    }
    throw new Error(`Missing ${fieldName} value in ${contextLabel}.`);
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid ${fieldName} value in ${contextLabel}: expected a number.`);
  }

  if (!Number.isInteger(numeric)) {
    throw new Error(`Invalid ${fieldName} value in ${contextLabel}: expected an integer.`);
  }

  if (numeric < min) {
    throw new Error(`Invalid ${fieldName} value in ${contextLabel}: expected a value >= ${min}.`);
  }

  if (numeric > max) {
    throw new Error(`Invalid ${fieldName} value in ${contextLabel}: expected a value <= ${max}.`);
  }

  return numeric;
}

module.exports = {
  validateInteger
};
