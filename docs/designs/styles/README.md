# SVG Stylesheets

Shared CSS stylesheets for project documentation SVGs.

## Files

| File | Purpose |
|------|---------|
| `svg-base.css` | Light theme base styles (typography, containers, progress bars) |
| `svg-obsidian.css` | Industrial Luxury Obsidian dark theme overrides |

## Usage

### Method 1: XML Stylesheet Processing Instruction

Add at the top of your SVG, before the `<svg>` tag:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/css" href="styles/svg-base.css"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1200">
  ...
</svg>
```

For Obsidian theme (dark mode), chain both:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/css" href="styles/svg-base.css"?>
<?xml-stylesheet type="text/css" href="styles/svg-obsidian.css"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1200">
  ...
</svg>
```

### Method 2: Inline Import (for embedded SVGs)

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1200">
  <defs>
    <style>
      @import url("styles/svg-base.css");
      @import url("styles/svg-obsidian.css"); /* Optional: for dark theme */
    </style>
  </defs>
  ...
</svg>
```

## Class Reference

### Typography

| Class | Description |
|-------|-------------|
| `.title` | Main heading (28px bold) |
| `.subtitle` | Subheading/caption (14px) |
| `.category-title` | Section headers (16px bold) |
| `.goal-title` | Item titles (13px semibold) |
| `.goal-desc` | Description text (11px) |
| `.count` | Numeric counts (11px bold) |
| `.code` | Monospace text |

### Status Indicators

| Class | Color | Use |
|-------|-------|-----|
| `.status-active` | Green | In progress |
| `.status-planned` | Blue | Not started |
| `.status-research` | Purple | Investigation |
| `.status-blocked` | Red | Blocked |
| `.status-complete` | Dark green | Done |

### Containers

| Class | Description |
|-------|-------------|
| `.category-box` | Main section container |
| `.goal-row` | Individual item row |
| `.card` | Generic card |
| `.panel` | Panel/sidebar |

### Progress Bars

| Class | Description |
|-------|-------------|
| `.progress-bg` | Background track |
| `.progress-fill` | Fill bar (use with status colors) |
| `.progress-active` | Green fill |
| `.progress-planned` | Blue fill |
| `.progress-research` | Purple fill |

### Category Headers

| Class | Color | Category |
|-------|-------|----------|
| `.header-crawler` | Blue | Crawler & Data |
| `.header-ui` | Green | Data Explorer UI |
| `.header-gazetteer` | Orange | Gazetteer |
| `.header-decision` | Purple | Decision Trees |
| `.header-zserver` | Red | Z-Server |
| `.header-tooling` | Teal | AI Tooling |
| `.header-testing` | Yellow | Testing |
| `.header-arch` | Gray | Architecture |
| `.header-classify` | Amber | Classification |
| `.header-design` | Pink | Design Studio |

### Utilities

| Class | Effect |
|-------|--------|
| `.text-muted` | Muted text color |
| `.text-emphasis` | Strong text color |
| `.text-success` | Green text |
| `.text-warning` | Yellow/amber text |
| `.text-error` | Red text |
| `.divider` | Horizontal line |
| `.connector` | Connection line |
| `.clickable` | Pointer cursor |
| `.pulse` | Pulsing animation |

## Obsidian Theme Colors

```
Background Layers:
  Darkest:  #050508
  Dark:     #0a0d14
  Medium:   #141824
  Light:    #1a1f2e
  Lighter:  #252b3d

Accent Colors:
  Gold:     #c9a227 (primary accent)
  Emerald:  #10b981 (success)
  Ruby:     #ef4444 (error)
  Sapphire: #3b82f6 (info)
  Amethyst: #8b5cf6 (research)

Text:
  Bright:   #f0f4f8
  Medium:   #94a3b8
  Muted:    #64748b
  Dim:      #475569
```

## Browser Compatibility

External CSS stylesheets work when SVGs are:
- Opened directly in browser
- Served from same origin as CSS
- Using `file://` protocol locally

They may NOT work when:
- SVG is embedded inline in HTML
- SVG is used as `<img src="...">`
- Cross-origin restrictions apply
- GitHub markdown preview (uses inline styles instead)

For GitHub/markdown compatibility, keep a copy of styles inline in `<defs>`.
