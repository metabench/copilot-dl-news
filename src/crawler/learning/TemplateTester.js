'use strict';

/**
 * TemplateTester - Validates extraction templates against sample pages
 * 
 * Tests templates by applying them to sample HTML and comparing
 * results against expected values.
 * 
 * @module TemplateTester
 * @example
 * const tester = new TemplateTester({ logger: console });
 * const result = tester.test(template, samples);
 * console.log(result.accuracy);
 */

const { JSDOM } = require('jsdom');

/**
 * @typedef {Object} TestResult
 * @property {number} accuracy - Overall accuracy score (0-1)
 * @property {Object[]} errors - List of extraction errors
 * @property {Object} fieldResults - Per-field results
 * @property {number} sampleCount - Number of samples tested
 * @property {number} passCount - Number of samples that passed
 * @property {number} failCount - Number of samples that failed
 */

/**
 * @typedef {Object} SingleTestResult
 * @property {boolean} success - Whether extraction was successful
 * @property {Object} extracted - Extracted values
 * @property {Object} [expected] - Expected values (if provided)
 * @property {Object} errors - Field-level errors
 * @property {number} score - Overall score (0-1)
 */

class TemplateTester {
  /**
   * @param {Object} opts
   * @param {Object} [opts.logger] - Logger instance
   * @param {number} [opts.minContentLength=50] - Minimum content length to consider valid
   * @param {number} [opts.minTitleLength=5] - Minimum title length to consider valid
   */
  constructor(opts = {}) {
    this.logger = opts.logger || console;
    this.minContentLength = opts.minContentLength ?? 50;
    this.minTitleLength = opts.minTitleLength ?? 5;
  }

  /**
   * Test a template against multiple samples
   * 
   * @param {Object} template - Template with selectors
   * @param {Object[]} samples - Sample pages to test
   * @returns {TestResult} Test results with accuracy and errors
   */
  test(template, samples) {
    if (!template || !template.selectors) {
      return {
        accuracy: 0,
        errors: [{ type: 'invalid_template', message: 'Template or selectors missing' }],
        fieldResults: {},
        sampleCount: 0,
        passCount: 0,
        failCount: 0
      };
    }

    if (!samples || samples.length === 0) {
      return {
        accuracy: 0,
        errors: [{ type: 'no_samples', message: 'No samples provided' }],
        fieldResults: {},
        sampleCount: 0,
        passCount: 0,
        failCount: 0
      };
    }

    const results = samples.map(sample => this.testSingle(template, sample.html, sample));
    
    // Aggregate results
    const errors = [];
    const fieldResults = { title: [], content: [], date: [], author: [] };
    let totalScore = 0;
    let passCount = 0;
    let failCount = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const sample = samples[i];
      
      totalScore += result.score;
      
      if (result.success) {
        passCount++;
      } else {
        failCount++;
        for (const [field, error] of Object.entries(result.errors)) {
          errors.push({
            type: 'extraction_error',
            field,
            url: sample.url,
            message: error,
            extracted: result.extracted[field],
            expected: sample.expected?.[field]
          });
        }
      }

      // Collect per-field results
      for (const field of Object.keys(fieldResults)) {
        fieldResults[field].push({
          url: sample.url,
          extracted: result.extracted[field],
          expected: sample.expected?.[field],
          match: result.fieldMatches?.[field] ?? false
        });
      }
    }

    const accuracy = samples.length > 0 ? totalScore / samples.length : 0;

    this.logger.info?.(`[TemplateTester] Tested ${samples.length} samples: accuracy=${(accuracy * 100).toFixed(1)}%, pass=${passCount}, fail=${failCount}`);

    return {
      accuracy,
      errors,
      fieldResults,
      sampleCount: samples.length,
      passCount,
      failCount
    };
  }

  /**
   * Test a template against a single HTML page
   * 
   * @param {Object} template - Template with selectors
   * @param {string} html - HTML content to test
   * @param {Object} [opts] - Options
   * @param {Object} [opts.expected] - Expected extraction results
   * @param {string} [opts.url] - URL for context
   * @returns {SingleTestResult} Test result
   */
  testSingle(template, html, opts = {}) {
    const result = {
      success: true,
      extracted: {},
      expected: opts.expected || null,
      errors: {},
      fieldMatches: {},
      score: 0
    };

    if (!template || !template.selectors) {
      result.success = false;
      result.errors.template = 'Invalid template';
      return result;
    }

    if (!html || typeof html !== 'string') {
      result.success = false;
      result.errors.html = 'Invalid HTML input';
      return result;
    }

    let doc;
    try {
      const dom = new JSDOM(html, { url: opts.url || 'http://localhost/' });
      doc = dom.window.document;
    } catch (err) {
      result.success = false;
      result.errors.parse = `HTML parse error: ${err.message}`;
      return result;
    }

    const fields = ['title', 'content', 'date', 'author'];
    let fieldScores = 0;
    let fieldCount = 0;

    for (const field of fields) {
      const selectors = template.selectors[field] || [];
      const extracted = this._extractField(doc, selectors, field);
      result.extracted[field] = extracted;

      // Validate extraction
      const validation = this._validateField(field, extracted);
      if (!validation.valid) {
        result.errors[field] = validation.error;
        result.success = false;
      }

      // Compare with expected if provided
      if (opts.expected && opts.expected[field]) {
        const match = this._compareValues(extracted, opts.expected[field], field);
        result.fieldMatches[field] = match.matched;
        fieldScores += match.score;
      } else if (extracted) {
        // No expected value but extraction succeeded
        fieldScores += validation.valid ? 0.7 : 0.2;
      }
      fieldCount++;
    }

    result.score = fieldCount > 0 ? fieldScores / fieldCount : 0;

    // Overall success requires at least title or content
    if (!result.extracted.title && !result.extracted.content) {
      result.success = false;
      if (!result.errors.extraction) {
        result.errors.extraction = 'Failed to extract title and content';
      }
    }

    return result;
  }

  /**
   * Extract a field using selectors
   * @private
   */
  _extractField(doc, selectors, field) {
    for (const selector of selectors) {
      try {
        // Handle meta tag selectors
        if (selector.startsWith('meta[')) {
          const meta = doc.querySelector(selector);
          if (meta) {
            const content = meta.getAttribute('content');
            if (content && content.trim()) {
              return content.trim();
            }
          }
          continue;
        }

        // Handle time[datetime] specially
        if (selector === 'time[datetime]') {
          const time = doc.querySelector(selector);
          if (time) {
            const datetime = time.getAttribute('datetime');
            if (datetime) return datetime;
            const text = (time.textContent || '').trim();
            if (text) return text;
          }
          continue;
        }

        const element = doc.querySelector(selector);
        if (element) {
          const text = (element.textContent || '').trim();
          if (text) {
            return text;
          }
        }
      } catch (err) {
        // Skip invalid selectors
        this.logger.warn?.(`[TemplateTester] Invalid selector: ${selector}`);
      }
    }

    return null;
  }

  /**
   * Validate an extracted field
   * @private
   */
  _validateField(field, value) {
    if (!value) {
      return { valid: false, error: 'No value extracted' };
    }

    switch (field) {
      case 'title':
        if (value.length < this.minTitleLength) {
          return { valid: false, error: `Title too short (${value.length} < ${this.minTitleLength})` };
        }
        if (value.length > 500) {
          return { valid: false, error: `Title too long (${value.length} > 500)` };
        }
        return { valid: true };

      case 'content':
        if (value.length < this.minContentLength) {
          return { valid: false, error: `Content too short (${value.length} < ${this.minContentLength})` };
        }
        return { valid: true };

      case 'date':
        // Check if it looks like a date
        const datePatterns = [
          /\d{4}-\d{2}-\d{2}/,
          /\d{1,2}\/\d{1,2}\/\d{2,4}/,
          /\w+ \d{1,2},? \d{4}/,
          /\d{1,2} \w+ \d{4}/
        ];
        const looksLikeDate = datePatterns.some(p => p.test(value));
        if (!looksLikeDate) {
          return { valid: false, error: 'Value does not look like a date' };
        }
        return { valid: true };

      case 'author':
        if (value.length < 2) {
          return { valid: false, error: 'Author name too short' };
        }
        if (value.length > 200) {
          return { valid: false, error: 'Author name too long' };
        }
        return { valid: true };

      default:
        return { valid: true };
    }
  }

  /**
   * Compare extracted value with expected value
   * @private
   */
  _compareValues(extracted, expected, field) {
    if (!extracted || !expected) {
      return { matched: false, score: 0 };
    }

    const normalize = s => s.toLowerCase().trim().replace(/\s+/g, ' ');
    const normExtracted = normalize(extracted);
    const normExpected = normalize(expected);

    // Exact match
    if (normExtracted === normExpected) {
      return { matched: true, score: 1 };
    }

    // Contains match
    if (normExtracted.includes(normExpected) || normExpected.includes(normExtracted)) {
      return { matched: true, score: 0.9 };
    }

    // For dates, try to parse and compare
    if (field === 'date') {
      try {
        const dateExtracted = new Date(extracted);
        const dateExpected = new Date(expected);
        if (!isNaN(dateExtracted.getTime()) && !isNaN(dateExpected.getTime())) {
          const sameDay = dateExtracted.toDateString() === dateExpected.toDateString();
          if (sameDay) {
            return { matched: true, score: 1 };
          }
        }
      } catch (err) {
        // Fall through to word comparison
      }
    }

    // Word overlap for partial matches
    const wordsExtracted = new Set(normExtracted.split(/\s+/));
    const wordsExpected = new Set(normExpected.split(/\s+/));
    const intersection = new Set([...wordsExtracted].filter(w => wordsExpected.has(w)));
    const union = new Set([...wordsExtracted, ...wordsExpected]);
    
    const similarity = intersection.size / union.size;
    
    return {
      matched: similarity >= 0.7,
      score: similarity
    };
  }
}

module.exports = { TemplateTester };
