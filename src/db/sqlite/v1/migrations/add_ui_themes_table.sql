-- Migration: Add ui_themes table for theme configuration
--
-- Stores theme configurations with JSON-encoded color/typography settings.
-- Supports multiple named themes with one designated as default.

CREATE TABLE IF NOT EXISTS ui_themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  config TEXT NOT NULL,  -- JSON theme configuration
  is_default INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 0,  -- System themes cannot be deleted
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ui_themes_is_default
  ON ui_themes (is_default DESC);

CREATE INDEX IF NOT EXISTS idx_ui_themes_name
  ON ui_themes (name);

-- Insert default premium theme (Obsidian)
INSERT OR IGNORE INTO ui_themes (name, display_name, description, config, is_default, is_system) VALUES (
  'obsidian',
  'Obsidian',
  'Dark luxury theme with gold accents - sophisticated and premium',
  '{
    "colors": {
      "primary": "#1e293b",
      "primaryLight": "#334155",
      "primaryDark": "#0f172a",
      "accent": "#c9a227",
      "accentLight": "#d4b348",
      "accentDark": "#b8931f",
      "accentHover": "#e0b830",
      "bg": "#0f172a",
      "bgAlt": "#1a2332",
      "surface": "#1e293b",
      "surfaceElevated": "#283548",
      "surfaceHover": "#334155",
      "border": "#334155",
      "borderLight": "#3f4f63",
      "text": "#f8fafc",
      "textSecondary": "#cbd5e1",
      "textMuted": "#94a3b8",
      "textSubtle": "#64748b",
      "success": "#22c55e",
      "successBg": "#14532d",
      "warning": "#f59e0b",
      "warningBg": "#78350f",
      "error": "#ef4444",
      "errorBg": "#7f1d1d",
      "info": "#3b82f6",
      "infoBg": "#1e3a5f"
    },
    "typography": {
      "fontDisplay": "\"Playfair Display\", Georgia, serif",
      "fontBody": "\"Inter\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
      "fontMono": "\"JetBrains Mono\", \"Fira Code\", Consolas, monospace",
      "fontSizeBase": "16px",
      "fontSizeXs": "0.75rem",
      "fontSizeSm": "0.875rem",
      "fontSizeMd": "1rem",
      "fontSizeLg": "1.125rem",
      "fontSizeXl": "1.25rem",
      "fontSize2xl": "1.5rem",
      "fontSize3xl": "2rem",
      "fontSize4xl": "2.5rem",
      "fontWeightNormal": "400",
      "fontWeightMedium": "500",
      "fontWeightSemibold": "600",
      "fontWeightBold": "700",
      "lineHeightTight": "1.2",
      "lineHeightNormal": "1.5",
      "lineHeightRelaxed": "1.7",
      "letterSpacingTight": "-0.02em",
      "letterSpacingNormal": "0",
      "letterSpacingWide": "0.05em"
    },
    "spacing": {
      "xs": "4px",
      "sm": "8px",
      "md": "16px",
      "lg": "24px",
      "xl": "32px",
      "2xl": "48px",
      "3xl": "64px"
    },
    "radii": {
      "sm": "6px",
      "md": "12px",
      "lg": "20px",
      "xl": "28px",
      "full": "9999px"
    },
    "shadows": {
      "sm": "0 2px 8px rgba(0, 0, 0, 0.3)",
      "md": "0 8px 24px rgba(0, 0, 0, 0.4)",
      "lg": "0 16px 48px rgba(0, 0, 0, 0.5)",
      "glow": "0 0 20px rgba(201, 162, 39, 0.3)",
      "inner": "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
    },
    "transitions": {
      "fast": "0.15s ease",
      "normal": "0.25s ease",
      "slow": "0.4s ease"
    }
  }',
  1,
  1
);

-- Insert Arctic (light) theme
INSERT OR IGNORE INTO ui_themes (name, display_name, description, config, is_default, is_system) VALUES (
  'arctic',
  'Arctic',
  'Clean light theme with professional navy accents',
  '{
    "colors": {
      "primary": "#1e40af",
      "primaryLight": "#3b82f6",
      "primaryDark": "#1e3a8a",
      "accent": "#0ea5e9",
      "accentLight": "#38bdf8",
      "accentDark": "#0284c7",
      "accentHover": "#22d3ee",
      "bg": "#f8fafc",
      "bgAlt": "#f1f5f9",
      "surface": "#ffffff",
      "surfaceElevated": "#ffffff",
      "surfaceHover": "#f1f5f9",
      "border": "#e2e8f0",
      "borderLight": "#f1f5f9",
      "text": "#0f172a",
      "textSecondary": "#334155",
      "textMuted": "#64748b",
      "textSubtle": "#94a3b8",
      "success": "#16a34a",
      "successBg": "#dcfce7",
      "warning": "#d97706",
      "warningBg": "#fef3c7",
      "error": "#dc2626",
      "errorBg": "#fee2e2",
      "info": "#2563eb",
      "infoBg": "#dbeafe"
    },
    "typography": {
      "fontDisplay": "\"Playfair Display\", Georgia, serif",
      "fontBody": "\"Inter\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
      "fontMono": "\"JetBrains Mono\", \"Fira Code\", Consolas, monospace",
      "fontSizeBase": "16px",
      "fontSizeXs": "0.75rem",
      "fontSizeSm": "0.875rem",
      "fontSizeMd": "1rem",
      "fontSizeLg": "1.125rem",
      "fontSizeXl": "1.25rem",
      "fontSize2xl": "1.5rem",
      "fontSize3xl": "2rem",
      "fontSize4xl": "2.5rem",
      "fontWeightNormal": "400",
      "fontWeightMedium": "500",
      "fontWeightSemibold": "600",
      "fontWeightBold": "700",
      "lineHeightTight": "1.2",
      "lineHeightNormal": "1.5",
      "lineHeightRelaxed": "1.7",
      "letterSpacingTight": "-0.02em",
      "letterSpacingNormal": "0",
      "letterSpacingWide": "0.05em"
    },
    "spacing": {
      "xs": "4px",
      "sm": "8px",
      "md": "16px",
      "lg": "24px",
      "xl": "32px",
      "2xl": "48px",
      "3xl": "64px"
    },
    "radii": {
      "sm": "6px",
      "md": "12px",
      "lg": "20px",
      "xl": "28px",
      "full": "9999px"
    },
    "shadows": {
      "sm": "0 2px 8px rgba(15, 23, 42, 0.08)",
      "md": "0 8px 24px rgba(15, 23, 42, 0.12)",
      "lg": "0 16px 48px rgba(15, 23, 42, 0.16)",
      "glow": "0 0 20px rgba(14, 165, 233, 0.2)",
      "inner": "inset 0 2px 4px rgba(15, 23, 42, 0.06)"
    },
    "transitions": {
      "fast": "0.15s ease",
      "normal": "0.25s ease",
      "slow": "0.4s ease"
    }
  }',
  0,
  1
);

-- Insert Midnight theme
INSERT OR IGNORE INTO ui_themes (name, display_name, description, config, is_default, is_system) VALUES (
  'midnight',
  'Midnight',
  'Deep blue-purple gradient with cyan accents - modern and tech-forward',
  '{
    "colors": {
      "primary": "#1e1b4b",
      "primaryLight": "#312e81",
      "primaryDark": "#0f0a2e",
      "accent": "#06b6d4",
      "accentLight": "#22d3ee",
      "accentDark": "#0891b2",
      "accentHover": "#67e8f9",
      "bg": "#0c0a1d",
      "bgAlt": "#130f2a",
      "surface": "#1e1b4b",
      "surfaceElevated": "#2e2a5a",
      "surfaceHover": "#3730a3",
      "border": "#3730a3",
      "borderLight": "#4f46e5",
      "text": "#f8fafc",
      "textSecondary": "#c7d2fe",
      "textMuted": "#a5b4fc",
      "textSubtle": "#818cf8",
      "success": "#34d399",
      "successBg": "#064e3b",
      "warning": "#fbbf24",
      "warningBg": "#713f12",
      "error": "#f87171",
      "errorBg": "#7f1d1d",
      "info": "#60a5fa",
      "infoBg": "#1e3a5f"
    },
    "typography": {
      "fontDisplay": "\"Playfair Display\", Georgia, serif",
      "fontBody": "\"Inter\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
      "fontMono": "\"JetBrains Mono\", \"Fira Code\", Consolas, monospace",
      "fontSizeBase": "16px",
      "fontSizeXs": "0.75rem",
      "fontSizeSm": "0.875rem",
      "fontSizeMd": "1rem",
      "fontSizeLg": "1.125rem",
      "fontSizeXl": "1.25rem",
      "fontSize2xl": "1.5rem",
      "fontSize3xl": "2rem",
      "fontSize4xl": "2.5rem",
      "fontWeightNormal": "400",
      "fontWeightMedium": "500",
      "fontWeightSemibold": "600",
      "fontWeightBold": "700",
      "lineHeightTight": "1.2",
      "lineHeightNormal": "1.5",
      "lineHeightRelaxed": "1.7",
      "letterSpacingTight": "-0.02em",
      "letterSpacingNormal": "0",
      "letterSpacingWide": "0.05em"
    },
    "spacing": {
      "xs": "4px",
      "sm": "8px",
      "md": "16px",
      "lg": "24px",
      "xl": "32px",
      "2xl": "48px",
      "3xl": "64px"
    },
    "radii": {
      "sm": "6px",
      "md": "12px",
      "lg": "20px",
      "xl": "28px",
      "full": "9999px"
    },
    "shadows": {
      "sm": "0 2px 8px rgba(6, 182, 212, 0.15)",
      "md": "0 8px 24px rgba(6, 182, 212, 0.2)",
      "lg": "0 16px 48px rgba(0, 0, 0, 0.5)",
      "glow": "0 0 30px rgba(6, 182, 212, 0.4)",
      "inner": "inset 0 2px 4px rgba(0, 0, 0, 0.3)"
    },
    "transitions": {
      "fast": "0.15s ease",
      "normal": "0.25s ease",
      "slow": "0.4s ease"
    }
  }',
  0,
  1
);
