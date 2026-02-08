"use strict";

/**
 * Theme Service
 * 
 * Manages UI theme CRUD operations and provides theme configuration
 * for the Data Explorer. Themes are stored in the database and can
 * be customized by users.
 * 
 * @module themeService
 */

// path kept previously for migrations; SQL + migrations now live in src/db.

const {
  ensureUiThemesTable,
  ensureSystemThemes: ensureSystemThemesInDb,
  listThemes: listThemesFromDb,
  getThemeRow,
  getDefaultThemeRow,
  createTheme: createThemeInDb,
  updateTheme: updateThemeInDb,
  setDefaultTheme: setDefaultThemeInDb,
  deleteTheme: deleteThemeInDb
} = require("../../../data/db/sqlite/v1/queries/ui/uiThemes");

// System theme configurations (used when DB not available)
const OBSIDIAN_THEME_CONFIG = {
  colors: {
    primary: "#1e293b",
    primaryLight: "#334155",
    primaryDark: "#0f172a",
    accent: "#c9a227",
    accentLight: "#d4b348",
    accentDark: "#b8931f",
    accentHover: "#e0b830",
    bg: "#0f172a",
    bgAlt: "#1a2332",
    surface: "#1e293b",
    surfaceElevated: "#283548",
    surfaceHover: "#334155",
    border: "#334155",
    borderLight: "#3f4f63",
    text: "#f8fafc",
    textSecondary: "#cbd5e1",
    textMuted: "#94a3b8",
    textSubtle: "#64748b",
    // Optional: mixed-surface tokens (dark theme keeps these aligned)
    bgGradient: "#0f172a",
    surfaceText: "#f8fafc",
    surfaceTextSecondary: "#cbd5e1",
    surfaceTextMuted: "#94a3b8",
    surfaceTextSubtle: "#64748b",
    success: "#22c55e",
    successBg: "#14532d",
    warning: "#f59e0b",
    warningBg: "#78350f",
    error: "#ef4444",
    errorBg: "#7f1d1d",
    info: "#3b82f6",
    infoBg: "#1e3a5f"
  },
  typography: {
    fontDisplay: '"Playfair Display", Georgia, serif',
    fontBody: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontMono: '"JetBrains Mono", "Fira Code", Consolas, monospace',
    fontSizeBase: "16px",
    fontSizeXs: "0.75rem",
    fontSizeSm: "0.875rem",
    fontSizeMd: "1rem",
    fontSizeLg: "1.125rem",
    fontSizeXl: "1.25rem",
    fontSize2xl: "1.5rem",
    fontSize3xl: "2rem",
    fontSize4xl: "2.5rem",
    fontWeightNormal: "400",
    fontWeightMedium: "500",
    fontWeightSemibold: "600",
    fontWeightBold: "700",
    lineHeightTight: "1.2",
    lineHeightNormal: "1.5",
    lineHeightRelaxed: "1.7",
    letterSpacingTight: "-0.02em",
    letterSpacingNormal: "0",
    letterSpacingWide: "0.05em"
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    "2xl": "48px",
    "3xl": "64px"
  },
  radii: {
    sm: "6px",
    md: "12px",
    lg: "20px",
    xl: "28px",
    full: "9999px"
  },
  shadows: {
    sm: "0 2px 8px rgba(0, 0, 0, 0.3)",
    md: "0 8px 24px rgba(0, 0, 0, 0.4)",
    lg: "0 16px 48px rgba(0, 0, 0, 0.5)",
    glow: "0 0 20px rgba(201, 162, 39, 0.3)",
    inner: "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
  },
  transitions: {
    fast: "0.15s ease",
    normal: "0.25s ease",
    slow: "0.4s ease"
  }
};

const WLILO_THEME_CONFIG = {
  colors: {
    // Leather background + obsidian panels + gold accents
    bg: "#faf9f7",
    bgGradient: "linear-gradient(135deg, #faf9f7 0%, #f5f3ef 55%, #ebe8e2 100%)",
    bgAlt: "#f5f3ef",
    surface: "#1a1a1a",
    surfaceElevated: "#2d2d2d",
    surfaceHover: "#343434",
    border: "rgba(201, 169, 98, 0.55)",
    borderLight: "rgba(232, 213, 163, 0.75)",
    accent: "#c9a962",
    accentLight: "#e8d5a3",
    accentDark: "#a8873e",
    accentHover: "#e8d5a3",
    // Text on leather
    text: "#2d2d2d",
    textSecondary: "#666666",
    textMuted: "#888888",
    textSubtle: "#666666",
    // Text on obsidian surfaces
    surfaceText: "#f5f3ef",
    surfaceTextSecondary: "#d7d3cc",
    surfaceTextMuted: "#a8a29e",
    surfaceTextSubtle: "#8b8580",
    // Status colors (optional)
    success: "#27ae60",
    successBg: "rgba(39, 174, 96, 0.15)",
    warning: "#f59e0b",
    warningBg: "rgba(245, 158, 11, 0.16)",
    error: "#ef4444",
    errorBg: "rgba(239, 68, 68, 0.16)",
    info: "#2d7dd2",
    infoBg: "rgba(45, 125, 210, 0.16)",
    primary: "#1a1a1a",
    primaryLight: "#2d2d2d",
    primaryDark: "#0f0f0f"
  },
  typography: {
    fontDisplay: '"Playfair Display", Georgia, serif',
    fontBody: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontMono: '"JetBrains Mono", "Fira Code", Consolas, monospace',
    fontSizeBase: "16px",
    fontSizeXs: "0.75rem",
    fontSizeSm: "0.875rem",
    fontSizeMd: "1rem",
    fontSizeLg: "1.125rem",
    fontSizeXl: "1.25rem",
    fontSize2xl: "1.5rem",
    fontSize3xl: "2rem",
    fontSize4xl: "2.5rem",
    fontWeightNormal: "400",
    fontWeightMedium: "500",
    fontWeightSemibold: "600",
    fontWeightBold: "700",
    lineHeightTight: "1.2",
    lineHeightNormal: "1.5",
    lineHeightRelaxed: "1.7",
    letterSpacingTight: "-0.02em",
    letterSpacingNormal: "0",
    letterSpacingWide: "0.05em"
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    "2xl": "48px",
    "3xl": "64px"
  },
  radii: {
    sm: "6px",
    md: "12px",
    lg: "20px",
    xl: "28px",
    full: "9999px"
  },
  shadows: {
    sm: "0 2px 8px rgba(0, 0, 0, 0.15)",
    md: "0 8px 24px rgba(0, 0, 0, 0.18)",
    lg: "0 16px 48px rgba(0, 0, 0, 0.22)",
    glow: "0 0 20px rgba(201, 169, 98, 0.25)",
    inner: "inset 0 2px 4px rgba(0, 0, 0, 0.12)"
  },
  transitions: {
    fast: "0.15s ease",
    normal: "0.25s ease",
    slow: "0.4s ease"
  }
};

// Default theme configuration - used if DB not available
const DEFAULT_THEME_CONFIG = WLILO_THEME_CONFIG;

function parseThemeRow(row) {
  if (!row) return null;
  try {
    return { ...row, config: JSON.parse(row.config) };
  } catch (_) {
    return { ...row, config: row.config };
  }
}

function ensureSystemThemes(db) {
  if (!db) return false;
  try {
    ensureUiThemesTable(db);
    return ensureSystemThemesInDb(db, {
      themes: [
        {
          name: "obsidian",
          displayName: "Obsidian",
          description: "Dark luxury theme with gold accents",
          config: OBSIDIAN_THEME_CONFIG,
          isDefault: false
        },
        {
          name: "wlilo",
          displayName: "WLILO",
          description: "White Leather + Industrial Luxury Obsidian",
          config: WLILO_THEME_CONFIG,
          defaultIfNone: true
        }
      ]
    });
  } catch (err) {
    console.error("Failed to ensure system themes:", err.message);
    return false;
  }
}

/**
 * Ensure the ui_themes table exists
 * @param {Object} db - SQLite database handle
 */
function ensureThemeTable(db) {
  if (!db) return false;
  const ok = ensureUiThemesTable(db);
  if (!ok) {
    console.error("Failed to ensure theme table");
  }
  return ok;
}

/**
 * List all available themes
 * @param {Object} db - SQLite database handle
 * @returns {Array} List of theme metadata (without full config)
 */
function listThemes(db) {
  if (!db) return [];
  
  try {
    ensureSystemThemes(db);
    return listThemesFromDb(db);
  } catch (err) {
    console.error("Failed to list themes:", err.message);
    return [];
  }
}

/**
 * Get theme by name or ID
 * @param {Object} db - SQLite database handle
 * @param {string|number} identifier - Theme name or ID
 * @returns {Object|null} Theme with parsed config
 */
function getTheme(db, identifier) {
  if (!db) return null;
  
  try {
    ensureSystemThemes(db);
    return parseThemeRow(getThemeRow(db, identifier));
  } catch (err) {
    console.error("Failed to get theme:", err.message);
    return null;
  }
}

/**
 * Get the default theme
 * @param {Object} db - SQLite database handle
 * @returns {Object} Theme with parsed config (falls back to hardcoded default)
 */
function getDefaultTheme(db) {
  if (!db) {
    return {
      id: 0,
      name: "wlilo",
      display_name: "WLILO",
      description: "White Leather + Industrial Luxury Obsidian",
      config: DEFAULT_THEME_CONFIG,
      is_default: 1,
      is_system: 1
    };
  }
  
  try {
    ensureSystemThemes(db);
    const row = getDefaultThemeRow(db);
    
    if (!row) {
      // No default set, try WLILO then obsidian
      const wlilo = getTheme(db, "wlilo");
      if (wlilo) return wlilo;
      const obsidian = getTheme(db, "obsidian");
      if (obsidian) return obsidian;
      
      // Return hardcoded default
      return {
        id: 0,
        name: "wlilo",
        display_name: "WLILO",
        description: "White Leather + Industrial Luxury Obsidian",
        config: DEFAULT_THEME_CONFIG,
        is_default: 1,
        is_system: 1
      };
    }
    
    return parseThemeRow(row);
  } catch (err) {
    console.error("Failed to get default theme:", err.message);
    return {
      id: 0,
      name: "wlilo",
      display_name: "WLILO",
      config: DEFAULT_THEME_CONFIG,
      is_default: 1,
      is_system: 1
    };
  }
}

/**
 * Create a new theme
 * @param {Object} db - SQLite database handle
 * @param {Object} themeData - Theme data
 * @returns {Object} Created theme
 */
function createTheme(db, themeData) {
  if (!db) throw new Error("Database not available");
  
  const { name, displayName, description, config } = themeData;
  if (!name || !displayName || !config) {
    throw new Error("name, displayName, and config are required");
  }
  
  ensureThemeTable(db);

  return parseThemeRow(createThemeInDb(db, { name, displayName, description, config }));
}

/**
 * Update an existing theme
 * @param {Object} db - SQLite database handle
 * @param {string|number} identifier - Theme name or ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated theme
 */
function updateTheme(db, identifier, updates) {
  if (!db) throw new Error("Database not available");

  const updated = updateThemeInDb(db, identifier, updates);
  return parseThemeRow(updated);
}

/**
 * Set a theme as the default
 * @param {Object} db - SQLite database handle
 * @param {string|number} identifier - Theme name or ID
 * @returns {Object} Updated theme
 */
function setDefaultTheme(db, identifier) {
  if (!db) throw new Error("Database not available");

  return parseThemeRow(setDefaultThemeInDb(db, identifier));
}

/**
 * Delete a theme
 * @param {Object} db - SQLite database handle
 * @param {string|number} identifier - Theme name or ID
 * @returns {boolean} Success
 */
function deleteTheme(db, identifier) {
  if (!db) throw new Error("Database not available");

  const theme = getTheme(db, identifier);
  if (!theme) throw new Error(`Theme not found: ${identifier}`);

  if (theme.is_default) {
    // Reset to obsidian as default
    const obsidian = getTheme(db, "obsidian");
    if (obsidian) {
      setDefaultTheme(db, obsidian.id);
    }
  }

  return deleteThemeInDb(db, identifier);
}

/**
 * Convert theme config to CSS custom properties
 * @param {Object} config - Theme configuration
 * @returns {string} CSS custom properties declaration
 */
function themeConfigToCss(config) {
  if (!config) config = DEFAULT_THEME_CONFIG;
  
  const lines = [":root {"];
  
  // Colors
  if (config.colors) {
    Object.entries(config.colors).forEach(([key, value]) => {
      const cssKey = `--theme-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
      lines.push(`  ${cssKey}: ${value};`);
    });
  }
  
  // Typography
  if (config.typography) {
    Object.entries(config.typography).forEach(([key, value]) => {
      const cssKey = `--theme-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
      lines.push(`  ${cssKey}: ${value};`);
    });
  }
  
  // Spacing
  if (config.spacing) {
    Object.entries(config.spacing).forEach(([key, value]) => {
      lines.push(`  --theme-space-${key}: ${value};`);
    });
  }
  
  // Radii
  if (config.radii) {
    Object.entries(config.radii).forEach(([key, value]) => {
      lines.push(`  --theme-radius-${key}: ${value};`);
    });
  }
  
  // Shadows
  if (config.shadows) {
    Object.entries(config.shadows).forEach(([key, value]) => {
      lines.push(`  --theme-shadow-${key}: ${value};`);
    });
  }
  
  // Transitions
  if (config.transitions) {
    Object.entries(config.transitions).forEach(([key, value]) => {
      lines.push(`  --theme-transition-${key}: ${value};`);
    });
  }
  
  lines.push("}");
  return lines.join("\n");
}

/**
 * Get Google Fonts link for theme fonts
 * @returns {string} Google Fonts link tag
 */
function getGoogleFontsLink() {
  return '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">';
}

module.exports = {
  OBSIDIAN_THEME_CONFIG,
  WLILO_THEME_CONFIG,
  DEFAULT_THEME_CONFIG,
  ensureThemeTable,
  ensureSystemThemes,
  listThemes,
  getTheme,
  getDefaultTheme,
  createTheme,
  updateTheme,
  setDefaultTheme,
  deleteTheme,
  themeConfigToCss,
  getGoogleFontsLink
};
