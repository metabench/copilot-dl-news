'use strict';

/**
 * Progress module - Unified crawl progress tracking.
 *
 * @module crawler/progress
 */

const ProgressModel = require('./ProgressModel');

module.exports = {
  ProgressModel,

  // Re-export constants for convenience
  PHASES: ProgressModel.PHASES
};
