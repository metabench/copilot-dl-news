# Obsidian Luxury Design Guide

## Architecture Diagrams for Software Stack Visualization

This guide establishes the visual language for creating premium architectural diagrams that illustrate software stacks, platform compositions, and system hierarchies. The "Obsidian Luxury" aesthetic combines dark sophistication with jewel-toned accents to create diagrams that are both beautiful and technically precise.

---

## Design Philosophy

### Core Principles

1. **Layered Clarity** - Software stacks should read like geological cross-sections, with clear stratification showing how platforms build upon each other
2. **Jeweled Hierarchy** - Use gemstone colors to encode architectural significance and data flow direction
3. **Dimensional Depth** - Employ gradients, shadows, and perspective to convey the "weight" of foundational layers
4. **Elegant Density** - Pack information richly while maintaining visual breathing room

### When to Use This Style

- System architecture overviews
- Platform composition diagrams
- Technology stack illustrations
- Infrastructure layer visualizations
- Service mesh and microservice topologies
- Data flow through multi-tier systems

---

## Color Palette

### Foundation Colors (Dark Theme Base)

```
Obsidian Background
├── Deep Black:     #0d1117  (primary background)
├── Slate Dark:     #161b22  (card backgrounds)
├── Slate Medium:   #21262d  (elevated surfaces)
└── Slate Light:    #30363d  (borders, dividers)
```

### Jewel Accent Colors (Architectural Significance)

Each gemstone color encodes a specific architectural role:

| Gem | Hex | RGB | Architectural Meaning |
|-----|-----|-----|----------------------|
| **Gold** | `#c9a227` | 201, 162, 39 | Core/Foundation, APIs, Primary Data Flow |
| **Sapphire** | `#3b82f6` | 59, 130, 246 | Services, Business Logic, Processing |
| **Emerald** | `#10b981` | 16, 185, 129 | Success States, Health, Active Connections |
| **Ruby** | `#ef4444` | 239, 68, 68 | Errors, Critical Paths, Breaking Changes |
| **Amethyst** | `#a855f7` | 168, 85, 247 | External Systems, Integrations, Plugins |
| **Topaz** | `#f59e0b` | 245, 158, 11 | Warnings, Pending States, Async Operations |
| **Pearl** | `#e2e8f0` | 226, 232, 240 | Text, Labels, Secondary Information |

### Gradient Definitions

```xml
<!-- Gold Accent (horizontal) - for headers, key elements -->
<linearGradient id="goldAccent" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" stop-color="#d4af37"/>
  <stop offset="25%" stop-color="#c9a227"/>
  <stop offset="50%" stop-color="#b8960f"/>
  <stop offset="75%" stop-color="#c9a227"/>
  <stop offset="100%" stop-color="#d4af37"/>
</linearGradient>

<!-- Gold Shine (text effect) -->
<linearGradient id="goldShine" x1="0%" y1="0%" x2="100%" y2="0%">
  <stop offset="0%" stop-color="#f4e4bc"/>
  <stop offset="50%" stop-color="#c9a227"/>
  <stop offset="100%" stop-color="#f4e4bc"/>
</linearGradient>

<!-- Obsidian Background (vertical depth) -->
<linearGradient id="obsidianBg" x1="0%" y1="0%" x2="0%" y2="100%">
  <stop offset="0%" stop-color="#1a1f2e"/>
  <stop offset="50%" stop-color="#0d1117"/>
  <stop offset="100%" stop-color="#080b10"/>
</linearGradient>

<!-- Sapphire Glow (services) -->
<radialGradient id="sapphireGlow" cx="50%" cy="50%" r="50%">
  <stop offset="0%" stop-color="#60a5fa"/>
  <stop offset="100%" stop-color="#3b82f6"/>
</radialGradient>

<!-- Emerald Glow (success/active) -->
<radialGradient id="emeraldGlow" cx="50%" cy="50%" r="50%">
  <stop offset="0%" stop-color="#34d399"/>
  <stop offset="100%" stop-color="#10b981"/>
</radialGradient>

<!-- Ruby Glow (errors/critical) -->
<radialGradient id="rubyGlow" cx="50%" cy="50%" r="50%">
  <stop offset="0%" stop-color="#f87171"/>
  <stop offset="100%" stop-color="#ef4444"/>
</radialGradient>

<!-- Amethyst Glow (external/integrations) -->
<radialGradient id="amethystGlow" cx="50%" cy="50%" r="50%">
  <stop offset="0%" stop-color="#c084fc"/>
  <stop offset="100%" stop-color="#a855f7"/>
</radialGradient>
```

---

## Architecture Diagram Patterns

### Pattern 1: Vertical Stack (Platform Layers)

Use for showing how technologies build upon each other:

```
┌─────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                     │  ← Gold border
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │ Web UI  │  │   API   │  │  Admin  │  │  CLI    │    │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘    │
├───────┼────────────┼────────────┼────────────┼──────────┤
│       └────────────┴─────┬──────┴────────────┘          │
│                    SERVICE LAYER                         │  ← Sapphire
│  ┌──────────────────────────────────────────────────┐   │
│  │              Business Logic Services              │   │
│  └──────────────────────┬───────────────────────────┘   │
├─────────────────────────┼───────────────────────────────┤
│                    DATA LAYER                            │  ← Emerald
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │
│  │  SQLite │  │  Cache  │  │  Files  │                  │
│  └─────────┘  └─────────┘  └─────────┘                  │
├─────────────────────────────────────────────────────────┤
│                 INFRASTRUCTURE LAYER                     │  ← Slate
│  ┌─────────────────────────────────────────────────┐    │
│  │                    Node.js                       │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**SVG Implementation Notes:**
- Each layer is a `<g>` group with consistent padding
- Layer backgrounds use subtle gradients (darker at bottom = "heavier")
- Gold accent on top layer indicates entry points
- Connector lines use `stroke-dasharray` for optional paths

### Pattern 2: Horizontal Flow (Data Pipeline)

Use for showing data transformation through stages:

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  INGEST  │───▶│ PROCESS  │───▶│  STORE   │───▶│  SERVE   │
│          │    │          │    │          │    │          │
│ ┌──────┐ │    │ ┌──────┐ │    │ ┌──────┐ │    │ ┌──────┐ │
│ │Source│ │    │ │Parse │ │    │ │ DB   │ │    │ │ API  │ │
│ │ URLs │ │    │ │& Norm│ │    │ │Write │ │    │ │Query │ │
│ └──────┘ │    │ └──────┘ │    │ └──────┘ │    │ └──────┘ │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
   Topaz           Sapphire        Emerald          Gold
  (pending)       (process)       (storage)        (output)
```

**SVG Implementation Notes:**
- Arrows use `<marker>` elements with gold fill
- Stage boxes have rounded corners (`rx="8"`)
- Inner boxes show specific operations
- Color encodes stage type, not status

### Pattern 3: Nested Composition (System of Systems)

Use for showing how subsystems compose into larger wholes:

```
┌─────────────────────────────────────────────────────────────────┐
│                        NEWS AGGREGATOR                           │
│  ┌───────────────────────────┐  ┌───────────────────────────┐   │
│  │      CRAWLER SYSTEM       │  │     ANALYSIS SYSTEM       │   │
│  │  ┌─────┐ ┌─────┐ ┌─────┐  │  │  ┌─────┐ ┌─────┐ ┌─────┐  │   │
│  │  │Queue│ │Fetch│ │Parse│  │  │  │ NLP │ │ Geo │ │Score│  │   │
│  │  └──┬──┘ └──┬──┘ └──┬──┘  │  │  └──┬──┘ └──┬──┘ └──┬──┘  │   │
│  │     └───────┴───────┘     │  │     └───────┴───────┘     │   │
│  │         Orchestrator      │  │        Orchestrator       │   │
│  └─────────────┬─────────────┘  └─────────────┬─────────────┘   │
│                │                              │                  │
│                └──────────────┬───────────────┘                  │
│                               │                                  │
│  ┌────────────────────────────┴─────────────────────────────┐   │
│  │                    SHARED DATA LAYER                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │   │
│  │  │   URLs   │  │ Articles │  │  Places  │  │  Scores  │  │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**SVG Implementation Notes:**
- Outer container has gold accent border
- Subsystems use sapphire tint backgrounds
- Shared layer uses emerald to show connectivity
- Depth conveyed through nested rounded rectangles

### Pattern 4: Radial Architecture (Hub and Spoke)

Use for showing central services with satellite dependencies:

```
                    ┌─────────┐
                    │ External│
                    │   API   │
                    └────┬────┘
                         │
        ┌────────┐  ┌────┴────┐  ┌────────┐
        │ Cache  │──│  CORE   │──│ Search │
        │ Layer  │  │ SERVICE │  │ Index  │
        └────────┘  └────┬────┘  └────────┘
                         │
        ┌────────┐  ┌────┴────┐  ┌────────┐
        │ Queue  │──│Database │──│ Files  │
        │Service │  │ Cluster │  │ Store  │
        └────────┘  └─────────┘  └────────┘
```

**SVG Implementation Notes:**
- Central node uses radial gradient with gold center
- Spokes use straight lines with subtle glow
- Satellite nodes sized by importance
- Optional: animate pulse on central node

---

## Visual Elements

### Box Styles

#### Primary Container (System Boundary)
```xml
<rect x="0" y="0" width="400" height="300" 
      rx="12" ry="12"
      fill="url(#obsidianBg)"
      stroke="url(#goldAccent)" 
      stroke-width="2"
      filter="url(#dropShadow)"/>
```

#### Secondary Container (Subsystem)
```xml
<rect x="20" y="20" width="360" height="260"
      rx="8" ry="8"
      fill="#161b22"
      stroke="#30363d"
      stroke-width="1"/>
```

#### Component Box (Individual Service)
```xml
<rect x="40" y="40" width="120" height="80"
      rx="6" ry="6"
      fill="#21262d"
      stroke="#3b82f6"
      stroke-width="1.5"
      opacity="0.9"/>
```

### Connector Styles

#### Primary Data Flow
```xml
<line x1="100" y1="100" x2="200" y2="100"
      stroke="url(#goldAccent)"
      stroke-width="2"
      marker-end="url(#arrowGold)"/>
```

#### Secondary/Optional Flow
```xml
<line x1="100" y1="120" x2="200" y2="120"
      stroke="#64748b"
      stroke-width="1"
      stroke-dasharray="4 2"
      marker-end="url(#arrowGray)"/>
```

#### Bidirectional Flow
```xml
<line x1="100" y1="140" x2="200" y2="140"
      stroke="#3b82f6"
      stroke-width="1.5"
      marker-start="url(#arrowBlue)"
      marker-end="url(#arrowBlue)"/>
```

### Arrow Markers

```xml
<defs>
  <!-- Gold arrow for primary flows -->
  <marker id="arrowGold" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="#c9a227"/>
  </marker>
  
  <!-- Blue arrow for service connections -->
  <marker id="arrowBlue" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="5" markerHeight="5" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6"/>
  </marker>
  
  <!-- Gray arrow for optional paths -->
  <marker id="arrowGray" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="4" markerHeight="4" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/>
  </marker>
</defs>
```

### Filter Effects

```xml
<defs>
  <!-- Drop shadow for elevated elements -->
  <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000" flood-opacity="0.5"/>
  </filter>
  
  <!-- Glow effect for active/highlighted elements -->
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
    <feMerge>
      <feMergeNode in="coloredBlur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
  
  <!-- Text glow for titles -->
  <filter id="textGlow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
    <feFlood flood-color="#c9a227" flood-opacity="0.5"/>
    <feComposite in2="blur" operator="in"/>
    <feMerge>
      <feMergeNode/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
</defs>
```

---

## Typography

### Font Stack
```css
/* Primary: Technical content */
font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;

/* Display: Titles and headers */
font-family: 'Georgia', 'Times New Roman', serif;

/* UI: Labels and annotations */
font-family: 'Inter', 'SF Pro Display', 'Segoe UI', sans-serif;
```

### Text Hierarchy

| Level | Font | Size | Color | Usage |
|-------|------|------|-------|-------|
| **Title** | Georgia Bold | 32-48px | `url(#goldShine)` | Diagram title |
| **Section** | Inter SemiBold | 18-24px | `#e2e8f0` | Layer/section names |
| **Label** | Inter Medium | 12-14px | `#94a3b8` | Component labels |
| **Code** | JetBrains Mono | 11-13px | `#a5b4fc` | Technical names |
| **Annotation** | Inter Regular | 10-11px | `#64748b` | Explanatory notes |

### Text Examples

```xml
<!-- Diagram Title -->
<text x="700" y="50" text-anchor="middle"
      font-family="Georgia, serif" font-size="38" font-weight="bold"
      fill="url(#goldShine)" filter="url(#textGlow)">
  System Architecture
</text>

<!-- Section Header -->
<text x="100" y="120"
      font-family="Inter, sans-serif" font-size="20" font-weight="600"
      fill="#e2e8f0" letter-spacing="2">
  APPLICATION LAYER
</text>

<!-- Component Label -->
<text x="150" y="180" text-anchor="middle"
      font-family="Inter, sans-serif" font-size="13" font-weight="500"
      fill="#94a3b8">
  API Gateway
</text>

<!-- Technical Name -->
<text x="150" y="200" text-anchor="middle"
      font-family="JetBrains Mono, monospace" font-size="11"
      fill="#a5b4fc">
  express.Router()
</text>
```

---

## Layout Guidelines

### Spacing Scale

```
4px   - Minimal gap (text kerning adjustments)
8px   - Tight spacing (inline elements)
16px  - Standard padding (component internals)
24px  - Comfortable margin (between components)
32px  - Section spacing (between logical groups)
48px  - Layer separation (major architectural boundaries)
64px  - Canvas margins (diagram edges)
```

### Alignment Rules

1. **Vertical stacks**: Align centers, maintain consistent width
2. **Horizontal flows**: Align baselines, maintain consistent height  
3. **Nested containers**: Indent by 24px per nesting level
4. **Connectors**: Use orthogonal routing (90° angles only)

### Responsive Considerations

For large diagrams (>1200px wide):
- Use `viewBox` for scalability
- Minimum text size: 10px at 100% zoom
- Ensure 4:3 or 16:9 aspect ratios for presentation compatibility

---

## Icon Vocabulary

### Standard Symbols

```xml
<!-- Database (cylinder) -->
<symbol id="iconDatabase" viewBox="0 0 32 32">
  <ellipse cx="16" cy="6" rx="12" ry="4" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M4 6 v20 a12,4 0 0,0 24,0 v-20" fill="none" stroke="currentColor" stroke-width="2"/>
  <ellipse cx="16" cy="26" rx="12" ry="4" fill="none" stroke="currentColor" stroke-width="2"/>
</symbol>

<!-- Server/Service (rectangle with status) -->
<symbol id="iconServer" viewBox="0 0 32 32">
  <rect x="2" y="4" width="28" height="24" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
  <line x1="2" y1="12" x2="30" y2="12" stroke="currentColor" stroke-width="2"/>
  <circle cx="8" cy="8" r="2" fill="currentColor"/>
  <line x1="8" y1="18" x2="24" y2="18" stroke="currentColor" stroke-width="2"/>
  <line x1="8" y1="22" x2="20" y2="22" stroke="currentColor" stroke-width="2"/>
</symbol>

<!-- API (connected nodes) -->
<symbol id="iconAPI" viewBox="0 0 32 32">
  <circle cx="8" cy="16" r="5" fill="none" stroke="currentColor" stroke-width="2"/>
  <circle cx="24" cy="16" r="5" fill="none" stroke="currentColor" stroke-width="2"/>
  <line x1="13" y1="16" x2="19" y2="16" stroke="currentColor" stroke-width="2"/>
  <circle cx="16" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="2"/>
  <line x1="16" y1="10" x2="16" y2="14" stroke="currentColor" stroke-width="2"/>
</symbol>

<!-- Queue (stacked items) -->
<symbol id="iconQueue" viewBox="0 0 32 32">
  <rect x="4" y="4" width="24" height="6" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
  <rect x="4" y="13" width="24" height="6" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
  <rect x="4" y="22" width="24" height="6" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
</symbol>

<!-- External System (cloud) -->
<symbol id="iconCloud" viewBox="0 0 32 32">
  <path d="M8 24 a6,6 0 0,1 0-12 a8,8 0 0,1 16,0 a5,5 0 0,1 0,12 z" 
        fill="none" stroke="currentColor" stroke-width="2"/>
</symbol>

<!-- Gem/Accent (decorative) -->
<symbol id="iconGem" viewBox="0 0 32 32">
  <polygon points="16,2 28,12 16,30 4,12" 
           fill="none" stroke="currentColor" stroke-width="2"/>
  <line x1="4" y1="12" x2="28" y2="12" stroke="currentColor" stroke-width="1"/>
  <line x1="16" y1="2" x2="10" y2="12" stroke="currentColor" stroke-width="1"/>
  <line x1="16" y1="2" x2="22" y2="12" stroke="currentColor" stroke-width="1"/>
  <line x1="10" y1="12" x2="16" y2="30" stroke="currentColor" stroke-width="1"/>
  <line x1="22" y1="12" x2="16" y2="30" stroke="currentColor" stroke-width="1"/>
</symbol>
```

### Icon Usage

```xml
<!-- Place icon with color -->
<use href="#iconDatabase" x="100" y="100" width="32" height="32" 
     style="color: #10b981"/>

<!-- Icon with label -->
<g transform="translate(200, 150)">
  <use href="#iconServer" x="0" y="0" width="32" height="32" style="color: #3b82f6"/>
  <text x="16" y="45" text-anchor="middle" 
        font-family="Inter, sans-serif" font-size="11" fill="#94a3b8">
    API Server
  </text>
</g>
```

---

## Complete Example: Three-Tier Architecture

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
  <defs>
    <!-- Include all gradients, markers, filters from above -->
    <linearGradient id="obsidianBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1a1f2e"/>
      <stop offset="100%" stop-color="#0d1117"/>
    </linearGradient>
    <linearGradient id="goldAccent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#d4af37"/>
      <stop offset="50%" stop-color="#c9a227"/>
      <stop offset="100%" stop-color="#d4af37"/>
    </linearGradient>
    <filter id="dropShadow">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.4"/>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="800" height="600" fill="url(#obsidianBg)"/>
  
  <!-- Title -->
  <text x="400" y="45" text-anchor="middle"
        font-family="Georgia, serif" font-size="28" font-weight="bold"
        fill="url(#goldAccent)">
    Three-Tier Architecture
  </text>
  
  <!-- Presentation Layer -->
  <g transform="translate(50, 80)">
    <rect width="700" height="120" rx="8" fill="#161b22" 
          stroke="#c9a227" stroke-width="2" filter="url(#dropShadow)"/>
    <text x="20" y="25" font-family="Inter, sans-serif" font-size="14" 
          fill="#c9a227" font-weight="600">PRESENTATION LAYER</text>
    
    <g transform="translate(50, 45)">
      <rect width="140" height="60" rx="6" fill="#21262d" stroke="#64748b"/>
      <text x="70" y="35" text-anchor="middle" font-family="Inter" 
            font-size="13" fill="#e2e8f0">Web Browser</text>
    </g>
    <g transform="translate(230, 45)">
      <rect width="140" height="60" rx="6" fill="#21262d" stroke="#64748b"/>
      <text x="70" y="35" text-anchor="middle" font-family="Inter"
            font-size="13" fill="#e2e8f0">Mobile App</text>
    </g>
    <g transform="translate(410, 45)">
      <rect width="140" height="60" rx="6" fill="#21262d" stroke="#64748b"/>
      <text x="70" y="35" text-anchor="middle" font-family="Inter"
            font-size="13" fill="#e2e8f0">CLI Tool</text>
    </g>
  </g>
  
  <!-- Connectors: Presentation → Business -->
  <g stroke="#c9a227" stroke-width="2">
    <line x1="400" y1="200" x2="400" y2="230"/>
    <polygon points="395,225 400,235 405,225" fill="#c9a227"/>
  </g>
  
  <!-- Business Layer -->
  <g transform="translate(50, 240)">
    <rect width="700" height="120" rx="8" fill="#161b22"
          stroke="#3b82f6" stroke-width="2" filter="url(#dropShadow)"/>
    <text x="20" y="25" font-family="Inter, sans-serif" font-size="14"
          fill="#3b82f6" font-weight="600">BUSINESS LAYER</text>
    
    <g transform="translate(50, 45)">
      <rect width="180" height="60" rx="6" fill="#21262d" stroke="#3b82f6"/>
      <text x="90" y="35" text-anchor="middle" font-family="Inter"
            font-size="13" fill="#e2e8f0">API Gateway</text>
    </g>
    <g transform="translate(260, 45)">
      <rect width="180" height="60" rx="6" fill="#21262d" stroke="#3b82f6"/>
      <text x="90" y="35" text-anchor="middle" font-family="Inter"
            font-size="13" fill="#e2e8f0">Service Layer</text>
    </g>
    <g transform="translate(470, 45)">
      <rect width="180" height="60" rx="6" fill="#21262d" stroke="#3b82f6"/>
      <text x="90" y="35" text-anchor="middle" font-family="Inter"
            font-size="13" fill="#e2e8f0">Auth Service</text>
    </g>
  </g>
  
  <!-- Connectors: Business → Data -->
  <g stroke="#3b82f6" stroke-width="2">
    <line x1="400" y1="360" x2="400" y2="390"/>
    <polygon points="395,385 400,395 405,385" fill="#3b82f6"/>
  </g>
  
  <!-- Data Layer -->
  <g transform="translate(50, 400)">
    <rect width="700" height="120" rx="8" fill="#161b22"
          stroke="#10b981" stroke-width="2" filter="url(#dropShadow)"/>
    <text x="20" y="25" font-family="Inter, sans-serif" font-size="14"
          fill="#10b981" font-weight="600">DATA LAYER</text>
    
    <g transform="translate(50, 45)">
      <rect width="180" height="60" rx="6" fill="#21262d" stroke="#10b981"/>
      <text x="90" y="35" text-anchor="middle" font-family="Inter"
            font-size="13" fill="#e2e8f0">Primary Database</text>
    </g>
    <g transform="translate(260, 45)">
      <rect width="180" height="60" rx="6" fill="#21262d" stroke="#10b981"/>
      <text x="90" y="35" text-anchor="middle" font-family="Inter"
            font-size="13" fill="#e2e8f0">Cache Layer</text>
    </g>
    <g transform="translate(470, 45)">
      <rect width="180" height="60" rx="6" fill="#21262d" stroke="#10b981"/>
      <text x="90" y="35" text-anchor="middle" font-family="Inter"
            font-size="13" fill="#e2e8f0">File Storage</text>
    </g>
  </g>
  
  <!-- Legend -->
  <g transform="translate(50, 550)">
    <text x="0" y="0" font-family="Inter" font-size="10" fill="#64748b">
      <tspan fill="#c9a227">■</tspan> Entry Points
      <tspan dx="20" fill="#3b82f6">■</tspan> Services
      <tspan dx="20" fill="#10b981">■</tspan> Storage
    </text>
  </g>
</svg>
```

---

## Validation & Tooling

Use the SVG validation tools to ensure diagram quality:

```bash
# Validate XML and check for issues
node tools/dev/svg-validate.js docs/diagrams/my-architecture.svg

# Check for visual overlaps
node tools/dev/svg-collisions.js docs/diagrams/my-architecture.svg

# Index elements for reference
node tools/dev/svg-validate.js docs/diagrams/my-architecture.svg --index

# Find specific elements
node tools/dev/svg-validate.js docs/diagrams/my-architecture.svg --find "@rect"
node tools/dev/svg-validate.js docs/diagrams/my-architecture.svg --find "L:50-100"
```

---

## Checklist for Architecture Diagrams

- [ ] **Clear hierarchy**: Layers read top-to-bottom or left-to-right
- [ ] **Consistent colors**: Each color encodes the same meaning throughout
- [ ] **Readable text**: Minimum 10px at 100% zoom
- [ ] **Labeled connections**: Data flows have directional arrows
- [ ] **Legend included**: Color/symbol meanings explained
- [ ] **Valid SVG**: Passes `svg-validate.js` checks
- [ ] **No overlaps**: Passes `svg-collisions.js` checks
- [ ] **Proper viewBox**: Scalable without distortion
- [ ] **Accessible names**: Groups have meaningful structure

---

## Scrollbar Styling (Obsidian Theme)

Custom scrollbars are essential for maintaining visual consistency in dark-themed dashboards. The Obsidian theme uses subtle, elegant scrollbars that complement the jewel-toned aesthetic.

### ⚠️ CRITICAL: Preventing Layout Jiggle

**Layout jiggle** occurs when scrollbar appearance/disappearance causes content to shift horizontally. This is the most common scrollbar UX problem and MUST be addressed.

**Solution: Use Overlay Scrollbars**

```css
/* RECOMMENDED: Overlay scrollbars - no layout jiggle */
.my-scrollable-container {
  /* Primary: overlay scrollbars (Chromium-based browsers) */
  overflow-y: overlay;
  /* Reserve space on browsers that support it */
  scrollbar-gutter: stable;
  /* Firefox styling */
  scrollbar-width: thin;
  scrollbar-color: var(--obsidian-border) transparent;
}

/* Fallback for browsers without overlay support */
@supports not (overflow: overlay) {
  .my-scrollable-container {
    overflow-y: auto;
    /* scrollbar-gutter: stable still helps in modern Firefox */
  }
}
```

**Key CSS Properties:**

| Property | Purpose |
|----------|---------|
| `overflow: overlay` | Scrollbar floats over content (Chromium) |
| `scrollbar-gutter: stable` | Reserves scrollbar space to prevent jiggle |
| `background: transparent` on track | Makes overlay scrollbar less intrusive |

**Available Utility Classes** (from `src/ui/css/obsidian-scrollbars.css`):

| Class | Description |
|-------|-------------|
| `.obsidian-scroll-overlay` | **RECOMMENDED** - No layout jiggle, gold theme |
| `.obsidian-scroll-overlay-glow` | Overlay + gold glow on hover |
| `.obsidian-scroll` | Standard scrollbar (may jiggle) |
| `.obsidian-scroll-thin` | 6px width scrollbar |
| `.obsidian-scroll-hidden` | Hidden scrollbar (still scrollable) |

### CSS Variables for Scrollbars

Use these CSS variables (defined in `:root`) for consistent scrollbar theming:

```css
:root {
  /* Core backgrounds */
  --obsidian-bg-deep: rgba(10, 13, 20, 0.99);
  --obsidian-bg-surface: rgba(20, 24, 36, 0.98);
  --obsidian-bg-elevated: rgba(30, 35, 50, 0.95);
  
  /* Gold accents */
  --obsidian-gold: #c9a227;
  --obsidian-gold-dim: rgba(201, 162, 39, 0.6);
  --obsidian-gold-glow: rgba(201, 162, 39, 0.4);
  
  /* Borders */
  --obsidian-border: rgba(201, 162, 39, 0.3);
  --obsidian-border-dim: rgba(201, 162, 39, 0.15);
}
```

### Standard Scrollbar Implementation

Apply to any scrollable container:

```css
/* Scrollbar - Obsidian Luxury */
.your-scrollable-container {
  overflow-y: auto;
  scrollbar-width: thin;                    /* Firefox */
  scrollbar-color: var(--obsidian-border) var(--obsidian-bg-deep); /* Firefox */
}

/* WebKit Browsers (Chrome, Safari, Edge) */
.your-scrollable-container::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.your-scrollable-container::-webkit-scrollbar-track {
  background: var(--obsidian-bg-deep);
  border-radius: 4px;
}

.your-scrollable-container::-webkit-scrollbar-thumb {
  background: var(--obsidian-border);
  border-radius: 4px;
  border: 1px solid transparent;
  background-clip: content-box;
}

.your-scrollable-container::-webkit-scrollbar-thumb:hover {
  background: var(--obsidian-gold-dim);
}

.your-scrollable-container::-webkit-scrollbar-corner {
  background: var(--obsidian-bg-deep);
}
```

### Size Variants

| Variant | Width | Use Case |
|---------|-------|----------|
| **Thin** | 6px | Compact lists, sidebars |
| **Standard** | 8px | Default for most containers |
| **Wide** | 12px | Main content areas, data tables |

```css
/* Thin variant */
.scrollbar-thin::-webkit-scrollbar { width: 6px; }

/* Wide variant */
.scrollbar-wide::-webkit-scrollbar { width: 12px; }
```

### Scrollbar Hover Glow Effect

For premium interactive feel, add a gold glow on hover:

```css
.premium-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--obsidian-gold-dim);
  box-shadow: 
    0 0 4px var(--obsidian-gold-glow),
    inset 0 0 2px var(--obsidian-gold-glow);
}
```

### jsgui3 Integration

When building jsgui3 controls with scrollable areas, add scrollbar CSS in the control's factory:

```javascript
// In your control factory
class ScrollableListControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    this.dom.attributes.set('class', 'scrollable-list obsidian-scroll');
    // ...
  }
}
```

Reference CSS file:
- `src/ui/controls/DatabaseSelector.css` - Full implementation example
- `src/ui/css/obsidian-scrollbars.css` - Shared scrollbar utilities (create if needed)

### Best Practices

1. **Always include Firefox fallback** - `scrollbar-width: thin; scrollbar-color: ...`
2. **Use CSS variables** - Never hardcode colors
3. **Respect container borders** - Add `padding-right` to prevent content touching scrollbar
4. **Test dark mode** - Scrollbars should be subtle but visible
5. **Consider touch devices** - Scrollbar styles may be ignored on mobile

---

## Related Resources

- `docs/diagrams/decision-tree-engine-deep-dive.svg` - Reference implementation
- `tools/dev/svg-validate.js` - Validation tool with hash indexing
- `tools/dev/svg-collisions.js` - Visual collision detection
- `tools/dev/svg-shared/hashUtils.js` - Element referencing utilities
- `src/ui/controls/DatabaseSelector.css` - Scrollbar implementation reference
