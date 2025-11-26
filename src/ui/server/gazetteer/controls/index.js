"use strict";

/**
 * Gazetteer Controls
 * 
 * Exports all jsgui3 controls for the Gazetteer Info.
 */

const { GazetteerAppControl, VIEW_TYPES } = require("./GazetteerAppControl");
const { GazetteerSearchFormControl, KIND_OPTIONS } = require("./GazetteerSearchFormControl");
const { GazetteerBreadcrumbControl } = require("./GazetteerBreadcrumbControl");
const { GazetteerResultItemControl } = require("./GazetteerResultItemControl");
const { PlaceBadgeControl, BADGE_VARIANTS } = require("./PlaceBadgeControl");

module.exports = {
  GazetteerAppControl,
  GazetteerSearchFormControl,
  GazetteerBreadcrumbControl,
  GazetteerResultItemControl,
  PlaceBadgeControl,
  VIEW_TYPES,
  KIND_OPTIONS,
  BADGE_VARIANTS
};
