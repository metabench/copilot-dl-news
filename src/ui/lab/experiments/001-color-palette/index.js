"use strict";

/**
 * Color Palette Lab Experiment - Index
 * 
 * Exports all controls from this experiment
 */

const { CellControl } = require("./CellControl");
const { GridControl } = require("./GridControl");
const { ColorGridControl } = require("./ColorGridControl");
const { ColorPaletteControl } = require("./ColorPaletteControl");
const { 
  PALETTES,
  PAL_CRAYOLA,
  PAL_LUXURY_OBSIDIAN,
  PAL_ART_PLAYGROUND,
  PAL_WEB_SAFE,
  PAL_GRAYSCALE,
  generateWebSafePalette,
  generateGrayscalePalette
} = require("./palettes");

module.exports = {
  // Controls
  CellControl,
  GridControl,
  ColorGridControl,
  ColorPaletteControl,
  
  // Palettes
  PALETTES,
  PAL_CRAYOLA,
  PAL_LUXURY_OBSIDIAN,
  PAL_ART_PLAYGROUND,
  PAL_WEB_SAFE,
  PAL_GRAYSCALE,
  
  // Utilities
  generateWebSafePalette,
  generateGrayscalePalette
};
