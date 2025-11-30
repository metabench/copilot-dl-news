"use strict";

/**
 * Color Palette Definitions
 * 
 * Various color palettes for use with ColorPaletteControl
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CRAYOLA PALETTE (from jsgui3-html)
// ═══════════════════════════════════════════════════════════════════════════════

const PAL_CRAYOLA = [
  { hex: "#EFDECD", name: "Almond" },
  { hex: "#CD9575", name: "Antique Brass" },
  { hex: "#FDD9B5", name: "Apricot" },
  { hex: "#78DBE2", name: "Aquamarine" },
  { hex: "#87A96B", name: "Asparagus" },
  { hex: "#FFA474", name: "Atomic Tangerine" },
  { hex: "#FAE7B5", name: "Banana Mania" },
  { hex: "#9F8170", name: "Beaver" },
  { hex: "#FD7C6E", name: "Bittersweet" },
  { hex: "#000000", name: "Black" },
  { hex: "#ACE5EE", name: "Blizzard Blue" },
  { hex: "#1F75FE", name: "Blue" },
  { hex: "#A2A2D0", name: "Blue Bell" },
  { hex: "#6699CC", name: "Blue Gray" },
  { hex: "#0D98BA", name: "Blue Green" },
  { hex: "#7366BD", name: "Blue Violet" },
  { hex: "#DE5D83", name: "Blush" },
  { hex: "#CB4154", name: "Brick Red" },
  { hex: "#B4674D", name: "Brown" },
  { hex: "#FF7F49", name: "Burnt Orange" },
  { hex: "#EA7E5D", name: "Burnt Sienna" },
  { hex: "#B0B7C6", name: "Cadet Blue" },
  { hex: "#FFFF99", name: "Canary" },
  { hex: "#1CD3A2", name: "Caribbean Green" },
  { hex: "#FFAACC", name: "Carnation Pink" },
  { hex: "#DD4492", name: "Cerise" },
  { hex: "#1DACD6", name: "Cerulean" },
  { hex: "#BC5D58", name: "Chestnut" },
  { hex: "#DD9475", name: "Copper" },
  { hex: "#9ACEEB", name: "Cornflower" },
  { hex: "#FFBCD9", name: "Cotton Candy" },
  { hex: "#FDDB6D", name: "Dandelion" },
  { hex: "#2B6CC4", name: "Denim" },
  { hex: "#EFCDB8", name: "Desert Sand" },
  { hex: "#6E5160", name: "Eggplant" },
  { hex: "#CEFF1D", name: "Electric Lime" },
  { hex: "#71BC78", name: "Fern" },
  { hex: "#6DAE81", name: "Forest Green" },
  { hex: "#C364C5", name: "Fuchsia" },
  { hex: "#CC6666", name: "Fuzzy Wuzzy" },
  { hex: "#E7C697", name: "Gold" },
  { hex: "#FCD975", name: "Goldenrod" },
  { hex: "#A8E4A0", name: "Granny Smith Apple" },
  { hex: "#95918C", name: "Gray" },
  { hex: "#1CAC78", name: "Green" },
  { hex: "#30BA8F", name: "Green Blue" },
  { hex: "#C9C0BB", name: "Silver" },
  { hex: "#FFFFFF", name: "White" }
];

// ═══════════════════════════════════════════════════════════════════════════════
// LUXURY OBSIDIAN PALETTE (from this project's theme)
// ═══════════════════════════════════════════════════════════════════════════════

const PAL_LUXURY_OBSIDIAN = [
  // Obsidian backgrounds
  { hex: "#050508", name: "Obsidian Darkest" },
  { hex: "#0a0d14", name: "Obsidian Dark" },
  { hex: "#0f1420", name: "Obsidian Base" },
  { hex: "#141824", name: "Obsidian Card" },
  { hex: "#1a1f2e", name: "Obsidian Card Hover" },
  { hex: "#252b3d", name: "Obsidian Card Light" },
  
  // Gold accents
  { hex: "#ffd700", name: "Gold Bright" },
  { hex: "#fffacd", name: "Gold Light" },
  { hex: "#d4af37", name: "Gold Muted" },
  { hex: "#c9a227", name: "Gold Primary" },
  { hex: "#b8960f", name: "Gold Dark" },
  { hex: "#a07d00", name: "Gold Darkest" },
  
  // Gemstones
  { hex: "#50c878", name: "Emerald Light" },
  { hex: "#2e8b57", name: "Emerald Base" },
  { hex: "#1a5d38", name: "Emerald Dark" },
  { hex: "#ff6b6b", name: "Ruby Light" },
  { hex: "#e31837", name: "Ruby Base" },
  { hex: "#8b0000", name: "Ruby Dark" },
  { hex: "#6fa8dc", name: "Sapphire Light" },
  { hex: "#0f52ba", name: "Sapphire Base" },
  { hex: "#082567", name: "Sapphire Dark" },
  { hex: "#da70d6", name: "Amethyst Light" },
  { hex: "#9966cc", name: "Amethyst Base" },
  { hex: "#4b0082", name: "Amethyst Dark" },
  { hex: "#ffc87c", name: "Topaz Light" },
  { hex: "#ff9f00", name: "Topaz Base" },
  { hex: "#cc7000", name: "Topaz Dark" },
  
  // Text colors
  { hex: "#cbd5e1", name: "Text Primary" },
  { hex: "#94a3b8", name: "Text Secondary" },
  { hex: "#64748b", name: "Text Muted" },
  { hex: "#475569", name: "Text Dim" },
  
  // Borders
  { hex: "#334155", name: "Border Subtle" },
  { hex: "#475569", name: "Border Muted" }
];

// ═══════════════════════════════════════════════════════════════════════════════
// ART PLAYGROUND PALETTE (from CanvasControl)
// ═══════════════════════════════════════════════════════════════════════════════

const PAL_ART_PLAYGROUND = [
  { hex: "#F2EFE6", name: "Cream" },
  { hex: "#C9A227", name: "Gold" },
  { hex: "#2D2D2D", name: "Charcoal" },
  { hex: "#4A90D9", name: "Azure" },
  { hex: "#4AD9B3", name: "Teal" },
  { hex: "#9B7B4B", name: "Bronze" },
  { hex: "#FFFFFF", name: "White" },
  { hex: "#000000", name: "Black" },
  { hex: "#FF5733", name: "Coral" },
  { hex: "#33FF57", name: "Lime" },
  { hex: "#3357FF", name: "Royal Blue" },
  { hex: "#FF33F5", name: "Magenta" }
];

// ═══════════════════════════════════════════════════════════════════════════════
// WEB SAFE PALETTE (216 web-safe colors)
// ═══════════════════════════════════════════════════════════════════════════════

function generateWebSafePalette() {
  const palette = [];
  const values = ["00", "33", "66", "99", "CC", "FF"];
  
  for (const r of values) {
    for (const g of values) {
      for (const b of values) {
        palette.push({ hex: `#${r}${g}${b}`, name: `RGB(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})` });
      }
    }
  }
  
  return palette;
}

const PAL_WEB_SAFE = generateWebSafePalette();

// ═══════════════════════════════════════════════════════════════════════════════
// GRAYSCALE PALETTE
// ═══════════════════════════════════════════════════════════════════════════════

function generateGrayscalePalette(steps = 16) {
  const palette = [];
  for (let i = 0; i < steps; i++) {
    const value = Math.round((i / (steps - 1)) * 255);
    const hex = value.toString(16).padStart(2, "0");
    palette.push({ hex: `#${hex}${hex}${hex}`, name: `Gray ${Math.round((value / 255) * 100)}%` });
  }
  return palette;
}

const PAL_GRAYSCALE = generateGrayscalePalette(16);

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

const PALETTES = {
  crayola: PAL_CRAYOLA,
  luxuryObsidian: PAL_LUXURY_OBSIDIAN,
  artPlayground: PAL_ART_PLAYGROUND,
  webSafe: PAL_WEB_SAFE,
  grayscale: PAL_GRAYSCALE
};

module.exports = {
  PALETTES,
  PAL_CRAYOLA,
  PAL_LUXURY_OBSIDIAN,
  PAL_ART_PLAYGROUND,
  PAL_WEB_SAFE,
  PAL_GRAYSCALE,
  generateWebSafePalette,
  generateGrayscalePalette
};
