'use strict';

/**
 * Shared Layout Controls
 * 
 * Reusable layout patterns for dashboard apps across the repository.
 * 
 * @example
 * const jsgui = require('jsgui3-html');
 * const { createTwoColumnLayoutControls } = require('./layouts');
 * const { TwoColumnLayout, buildStyles } = createTwoColumnLayoutControls(jsgui);
 */

const { createTwoColumnLayoutControls } = require('./TwoColumnLayoutFactory');

module.exports = {
  createTwoColumnLayoutControls
};
