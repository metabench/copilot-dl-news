'use strict';

/**
 * Extraction Module
 * 
 * Provides template-based content extraction using CSS selectors
 * learned from TeacherService visual analysis.
 * 
 * @module extraction
 */

const { TemplateExtractor, SCHEMA_VERSION } = require('./TemplateExtractor');
const { TemplateExtractionService } = require('./TemplateExtractionService');

module.exports = {
  TemplateExtractor,
  TemplateExtractionService,
  SCHEMA_VERSION
};
