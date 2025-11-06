'use strict';

const { cloneOptions } = require('./CrawlOperation');

const normalizeSequence = (sequence) => {
  if (!Array.isArray(sequence) || sequence.length === 0) {
    throw new Error('Sequence must be a non-empty array');
  }

  return sequence.map((entry, index) => {
    if (typeof entry === 'string') {
      return {
        operation: entry,
        label: entry,
        overrides: {}
      };
    }

    if (entry && typeof entry === 'object') {
      const operation = entry.operation || entry.name;
      if (!operation) {
        throw new Error(`Sequence entry at index ${index} is missing an operation name`);
      }
      return {
        operation,
        label: entry.label || operation,
        startUrl: entry.startUrl,
        overrides: cloneOptions(entry.overrides || {}),
        continueOnError: Boolean(entry.continueOnError)
      };
    }

    throw new Error(`Invalid sequence entry at index ${index}`);
  });
};

module.exports = {
  normalizeSequence
};
