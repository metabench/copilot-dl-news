# jsgui3 AGI Singularity Starter Kit — Design Document

**Status**: Draft Proposal  
**Created**: 2025-01-28  
**Purpose**: Design a self-contained, extractable starter kit for building jsgui3 full-stack applications with AGI Singularity engineering patterns.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Location & Package Structure](#1-location--package-structure)
3. [Minimal Full-Stack App Design](#2-minimal-full-stack-app-design)
4. [AGENTS.md — AGI Singularity Playbook](#3-agentsmd--agi-singularity-playbook)
5. [The jsgui3 + Singularity Engineering Book](#4-the-jsgui3--singularity-engineering-book)
6. [AI Platform Compatibility](#5-ai-platform-compatibility)
7. [AGI Self-Improvement Architecture](#6-agi-self-improvement-architecture)
8. [**Testing & Validation Strategy**](#7-testing--validation-strategy) ⭐ NEW
9. [Implementation Roadmap](#8-implementation-roadmap)
10. [Future Evolution](#9-future-evolution)
11. [Success Criteria](#10-success-criteria)
12. [**Setting Up AGENTS.md — The Foundation**](#11-setting-up-agentsmd--the-foundation) ⭐
13. [**Bootstrapping the Repository — Agent-Driven Initialization**](#12-bootstrapping-the-repository--agent-driven-initialization) ⭐
14. [Open Questions](#13-open-questions)
15. [Appendix A: Reference Materials](#appendix-reference-materials)
16. [Appendix B: A Note to Future Agents](#appendix-b-a-note-to-future-agents)

⭐ = Critical sections for AGI Singularity approach

---

## Executive Summary

This document outlines the design for a **jsgui3 Starter Kit** that can:

1. Live in this repo's lab as a nested sub-package
2. Be extracted as a standalone repository (git submodule-ready)
3. Provide a minimal jsgui3 full-stack app (server + client)
4. Include AGI Singularity-oriented AGENTS.md and documentation
5. Be compatible with GitHub Copilot, Kilo Code, and Google Antigravity
6. **Be bootstrapped by future AI agents** who expand beyond this foundation

### The Two-Phase Approach

**Phase A: Human/Current-AI Creates Foundation**
- Minimal working app (Window + Text_Input)
- AGENTS.md with bootstrap instructions
- Core documentation structure
- Check scripts for verification

**Phase B: Future AI Bootstraps & Expands**
- Receives the foundation
- Follows bootstrap instructions in AGENTS.md
- Expands in directions we cannot fully predict
- Documents all decisions for future agents

This design explicitly embraces that future AI agents will be more capable and will make decisions we haven't anticipated. The bootstrap process is designed to enable, not constrain.

---

## 1. Location & Package Structure

### 1.1 Directory Location

```
src/ui/lab/starter-kit/
├── .gitignore                    # Standalone .gitignore
├── package.json                  # Self-contained dependencies
├── README.md                     # Quick start guide
├── AGENTS.md                     # AGI Singularity playbook
├── server.js                     # Entry point
├── client.js                     # Client bundle source
├── checks/
│   ├── app.check.js              # Quick SSR validation (<1s)
│   └── app.e2e.check.js          # Full E2E with Puppeteer
├── controls/
│   └── App.js                    # Main application control
├── docs/
│   ├── INDEX.md                  # Documentation index
│   ├── JSGUI3_BOOK.md            # The jsgui3 + Singularity Engineering Book
│   ├── guides/
│   │   ├── GETTING_STARTED.md
│   │   ├── CONTROL_PATTERNS.md
│   │   └── SELF_IMPROVEMENT.md
│   ├── agi/
│   │   ├── SELF_MODEL.md
│   │   ├── SKILLS.md
│   │   ├── LESSONS.md
│   │   └── WORKFLOWS.md
│   └── sessions/                 # Session working notes
└── .github/
    ├── copilot-instructions.md   # GitHub Copilot custom instructions
    └── agents/
        └── 🧠 jsgui3 Singularity Brain 🧠.agent.md
```

### 1.2 Sub-Package Configuration

**package.json** (starter-kit internal):

```json
{
  "name": "jsgui3-singularity-starter",
  "version": "0.1.0",
  "description": "AGI Singularity-oriented jsgui3 full-stack starter kit",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js --debug",
    "check": "node checks/app.check.js",
    "check:e2e": "node checks/app.e2e.check.js",
    "check:all": "npm run check && npm run check:e2e",
    "test": "npm run check:all"
  },
  "dependencies": {
    "jsgui3-server": "^0.0.142",
    "jsgui3-client": "^0.0.124",
    "jsgui3-html": "^0.0.175"
  },
  "devDependencies": {
    "puppeteer": "^24.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": ["jsgui3", "agi", "singularity", "full-stack", "starter-kit"]
}
```

### 1.3 Subrepo / Subpackage Considerations

**Option A: npm workspaces** (recommended for this repo)
- Add to root `package.json` workspaces array
- `npm install` from root handles dependencies
- Can still be extracted later

**Option B: git subtree/submodule**
- Keep as separate git history
- More complex but enables true independent repo
- Better for external distribution

**Recommendation**: Start with Option A (simpler), design for Option B compatibility.

---

## 2. Minimal Full-Stack App Design

Based on jsgui3-server examples (`examples/controls/1) window` and `10) window, mirrored text inputs`).

### 2.1 server.js

```javascript
/**
 * jsgui3 Singularity Starter Kit - Server
 * 
 * Serves a minimal jsgui3 full-stack app demonstrating:
 * - Server-side rendering (SSR)
 * - Client activation
 * - Window control with Text_Input
 */
"use strict";

const path = require("path");
const jsgui = require("./client");
const Server = require("jsgui3-server/server");

const { App } = jsgui.controls;

const PORT = process.env.PORT || 52100;
const DEBUG = process.argv.includes("--debug");

if (require.main === module) {
    const server = new Server({
        Ctrl: App,
        src_path_client_js: require.resolve("./client.js"),
        debug: DEBUG
    });

    server.on("ready", () => {
        console.log("[jsgui3-singularity] Server bundling complete");
        
        server.start(PORT, (err) => {
            if (err) throw err;
            console.log(`[jsgui3-singularity] Server running at http://localhost:${PORT}`);
        });
    });
}

module.exports = { Server };
```

### 2.2 client.js

```javascript
/**
 * jsgui3 Singularity Starter Kit - Client
 * 
 * Main client entry point, bundled by jsgui3-server.
 */
"use strict";

const jsgui = require("jsgui3-client");
const { controls, Control, mixins } = jsgui;
const { Text_Input, Window } = controls;

const Active_HTML_Document = require("jsgui3-server/controls/Active_HTML_Document");

/**
 * App - Main application control
 * 
 * Demonstrates:
 * - Window control usage
 * - Text_Input inside window
 * - SSR + client activation pattern
 */
class App extends Active_HTML_Document {
    constructor(spec = {}) {
        spec.__type_name = spec.__type_name || "app";
        super(spec);
        
        const { context } = this;
        
        if (typeof this.body?.add_class === "function") {
            this.body.add_class("singularity-app");
        }

        const compose = () => {
            // Create window with text input
            const window = new Window({
                context,
                title: "🧠 jsgui3 Singularity Starter",
                pos: [50, 50]
            });
            window.size = [400, 200];

            // Text input control
            const textInput = new Text_Input({
                context,
                placeholder: "Type here to see jsgui3 in action..."
            });

            window.inner.add(textInput);
            this.body.add(window);

            // Store references
            this._ctrl_fields = this._ctrl_fields || {};
            this._ctrl_fields.mainWindow = window;
            this._ctrl_fields.textInput = textInput;
        };

        if (!spec.el) {
            compose();
        }
    }

    activate() {
        if (!this.__active) {
            super.activate();
            const { context, textInput } = this;

            // Client-side interactivity
            if (textInput?.data?.model) {
                textInput.data.model.on("change", (e) => {
                    console.log("[App] Text changed:", e.value);
                });
            }

            context?.on("window-resize", (e) => {
                // Handle window resize if needed
            });
        }
    }
}

// CSS embedded with the control
App.css = `
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    overflow: hidden;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.singularity-app {
    min-height: 100vh;
}
`;

controls.App = App;
module.exports = jsgui;
```

### 2.3 Check Script

```javascript
/**
 * checks/app.check.js - Verify SSR renders correctly
 */
const jsgui = require("../client");
const { App } = jsgui.controls;

const context = new jsgui.Page_Context();
const app = new App({ context });
const html = app.all_html_render();

// Assertions
const checks = [
    [html.includes("singularity-app"), "Has app class"],
    [html.includes("jsgui3 Singularity Starter"), "Has window title"],
    [html.includes("data-jsgui-id"), "Has jsgui data attributes"],
    [html.includes("Text_Input") || html.includes("input"), "Has text input"],
];

let passed = 0;
for (const [condition, name] of checks) {
    if (condition) {
        console.log(`✅ ${name}`);
        passed++;
    } else {
        console.log(`❌ ${name}`);
    }
}

console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
```

---

## 3. AGENTS.md — AGI Singularity Playbook

The AGENTS.md will be the central playbook for AI agents working in this starter kit.

### 3.1 Structure

```markdown
# jsgui3 Singularity Engineering Playbook

**Purpose**: Guide AI agents in building self-improving jsgui3 applications.

## The Singularity Principle

Each improvement makes the next improvement easier. Knowledge compounds.
This repo is designed for continuous enhancement by AI agents.

## Quick Start (For Agents)

1. Read this file first
2. Check `docs/INDEX.md` for available documentation
3. Review current session in `docs/sessions/`
4. Start with `docs/guides/GETTING_STARTED.md`

## Core Directives

### Plan-First
Before any code change:
- State the objective in one sentence
- List success criteria
- Note files you'll modify
- Identify tests to add/update

### Document as You Learn
- Every discovery becomes documentation
- Update LESSONS.md with patterns
- Add to SKILLS.md when you master something

### Self-Improvement Loop
After every task:
1. What did I learn about jsgui3?
2. What pattern worked well?
3. What should I document for next time?
4. Did I update this AGENTS.md?

## jsgui3 Architecture (Essential)

### The Control Model
- Everything is a `Control`
- Controls compose via `add()`
- `compose()` builds the tree (server)
- `activate()` binds events (client)

### Server → Client Flow
1. Server: `new Control(spec)` → `compose()` → `all_html_render()`
2. Transport: HTML with `data-jsgui-*` attributes
3. Client: `new Control({el})` → link DOM → `activate()`

### Key Pattern: _ctrl_fields
Store child control references:
```javascript
this._ctrl_fields = this._ctrl_fields || {};
this._ctrl_fields.myControl = new SomeControl({context});
```

## Development Workflow

### Adding a New Control
1. Create in `controls/` directory
2. Export via client.js
3. Add check script in `checks/`
4. Document in `docs/guides/`

### Running the App
```bash
npm start          # Production mode
npm run dev        # Debug mode (verbose)
npm run check      # Verify SSR
```

## Compatibility

### GitHub Copilot
- Custom instructions in `.github/copilot-instructions.md`
- Agent mode activates via in-context agent files

### Google Antigravity (Gemini)
- Same AGENTS.md-first pattern
- Long context supports full doc reads
- Use structured sections for navigation

### Kilo Code
- Mode files in `.kilo/` (when ready)
- Pairs with agent .md files

## The Book

For deep jsgui3 understanding, read `docs/JSGUI3_BOOK.md`.

## Evolution Path

### Level 1: Build Applications
- Master Control composition
- Understand SSR + activation
- Create reusable controls

### Level 2: Improve This Starter Kit
- Fix gaps in documentation
- Add missing patterns
- Enhance tooling

### Level 3: Contribute to jsgui3 Core
(Future — when proficient enough)
- Clone jsgui3-html/client/server repos
- Make targeted improvements
- Submit pull requests
```

---

## 4. The jsgui3 + Singularity Engineering Book

A comprehensive guide living at `docs/JSGUI3_BOOK.md`.

### 4.1 Book Structure

```markdown
# The jsgui3 Singularity Engineering Book

A comprehensive guide to building self-improving jsgui3 systems.

---

## Part I: jsgui3 Fundamentals

### Chapter 1: The Control Model
- What is a Control?
- The DOM abstraction layer
- Control lifecycle

### Chapter 2: Composition Patterns
- The `add()` method
- Parent-child relationships
- Context propagation

### Chapter 3: Server-Side Rendering
- `all_html_render()` explained
- Data attributes for hydration
- CSS extraction from JS

### Chapter 4: Client Activation
- The activation sequence
- DOM linking via `data-jsgui-id`
- Event binding patterns

---

## Part II: Full-Stack Patterns

### Chapter 5: The Server
- jsgui3-server architecture
- Bundling with esbuild
- Static asset serving

### Chapter 6: Control Architecture
- Active_HTML_Document
- Window controls
- Form controls (Text_Input, etc.)

### Chapter 7: Data Binding
- data.model pattern
- Change event handling
- Two-way binding

### Chapter 8: MVVM in jsgui3
- Model-View-ViewModel mapping
- Computed properties
- Reactive patterns

---

## Part III: Singularity Engineering

### Chapter 9: The Self-Improvement Loop
- Sense → Think → Act → Reflect
- Documentation as memory
- Compounding knowledge

### Chapter 10: Agent Collaboration
- AGENTS.md as the playbook
- Session continuity
- Cross-agent teaching

### Chapter 11: Tooling for AGI
- js-scan for discovery
- js-edit for modifications
- Check scripts for verification

### Chapter 12: Evolution Stages
- Stage 1: Application mastery
- Stage 2: Starter kit improvement
- Stage 3: Platform contribution

---

## Part IV: Reference

### Appendix A: Control API Reference
### Appendix B: Server Configuration
### Appendix C: Common Patterns
### Appendix D: Troubleshooting
```

---

## 5. AI Platform Compatibility

### 5.1 GitHub Copilot

**`.github/copilot-instructions.md`**:

```markdown
# GitHub Copilot Instructions — jsgui3 Singularity Starter

When working in this repository:

1. **Read AGENTS.md first** — it's the playbook
2. **jsgui3 patterns** — prefer `compose()` for building, `activate()` for events
3. **Check before commit** — run `npm run check` to verify SSR
4. **Document discoveries** — update docs/agi/LESSONS.md

## Key jsgui3 Rules

- Always pass `context` to child controls
- Store control refs in `this._ctrl_fields`
- Guard `activate()` with `if (!this.__active)`
- Use optional chaining for `this.dom?.el`

## Code Style

- ES6+ JavaScript
- JSDoc for public methods
- Descriptive variable names
- Early returns over deep nesting
```

### 5.2 Google Antigravity (Gemini)

Antigravity uses similar patterns:
- Long context window supports full AGENTS.md + book reads
- Structured markdown with clear headers aids navigation
- Same self-improvement principles apply

**Compatibility Features**:
- Clear section headers with `##` and `###`
- Code blocks with language hints
- Tables for quick reference
- Mermaid diagrams for architecture

### 5.3 Kilo Code

When ready, add `.kilo/rules-jsgui3-singularity/`:
- Mode definitions
- Custom prompts
- Integration with agent files

---

## 6. AGI Self-Improvement Architecture

### 6.1 docs/agi/ Structure

```
docs/agi/
├── SELF_MODEL.md       # "Identity card" for the AGI system
├── SKILLS.md           # Registry of mastered capabilities
├── LESSONS.md          # Patterns and anti-patterns discovered
├── WORKFLOWS.md        # Canonical Sense → Plan → Act loops
└── sessions/           # Working notes per session
```

### 6.2 SELF_MODEL.md Template

```markdown
# AGI Self-Model — jsgui3 Singularity Starter

## Purpose
Build and improve jsgui3 applications through iterative,
tool-assisted development with persistent memory.

## Current Capabilities
- Create jsgui3 controls with SSR + activation
- Run check scripts to verify rendering
- Document patterns in LESSONS.md
- Read and update AGENTS.md

## Limitations
- Cannot yet modify jsgui3 core (future goal)
- No automated testing (manual check scripts)
- Single-repo scope (no cross-repo operations yet)

## Evolution Goals
1. Master all control patterns in this starter
2. Improve documentation iteratively
3. Eventually: clone jsgui3 repos and contribute

## How to Use This File
Update whenever capabilities or limitations change.
This is the "identity card" — keep it accurate.
```

### 6.3 Skills Registry

```markdown
# Skills Registry

## Mastered Skills

### jsgui3-control-basics
- Create Control subclasses
- Use compose() and activate()
- Handle _ctrl_fields

### jsgui3-ssr-activation
- Server-side rendering
- Client DOM linking
- Event binding on activation

## In Progress

### jsgui3-mvvm
- Data model binding
- Two-way sync
- Computed properties

## Future

### jsgui3-core-contribution
- Clone and modify jsgui3-html
- Submit pull requests
- Review and merge
```

---

## 7. Testing & Validation Strategy

**The current lab protocol is NOT sufficient for the starter kit.** Lab experiments have excellent patterns (like experiment 020's Puppeteer + server lifecycle testing), but a starter kit needs more robust, self-contained testing to ensure it works before handoff to bootstrap agents.

### 7.1 The Testing Gap

The original simple check script is inadequate:

```javascript
// ❌ INADEQUATE - Only checks SSR string matching
const checks = [
    [html.includes("singularity-app"), "Has app class"],
    [html.includes("data-jsgui-id"), "Has jsgui data attributes"],
];
```

**What's missing:**
- ❌ Server startup/shutdown lifecycle
- ❌ Port management (find free port)
- ❌ Client activation verification
- ❌ Puppeteer E2E testing
- ❌ Browser console error capture
- ❌ Proper cleanup on failure

### 7.2 Required Test Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TEST PYRAMID                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                           ┌─────────┐                               │
│                           │  E2E    │  ← Puppeteer: full browser    │
│                          ╱│ (slow)  │╲    activation + interaction  │
│                         ╱ └─────────┘ ╲                             │
│                        ╱               ╲                            │
│                       ╱  ┌───────────┐  ╲                           │
│                      ╱   │Integration│   ╲ ← Server lifecycle,      │
│                     ╱    │  (medium) │    ╲   HTTP responses        │
│                    ╱     └───────────┘     ╲                        │
│                   ╱                         ╲                       │
│                  ╱      ┌─────────────┐      ╲                      │
│                 ╱       │    Unit     │       ╲ ← SSR output,       │
│                ╱        │   (fast)    │        ╲  control compose   │
│               ╱         └─────────────┘         ╲                   │
│              ╱───────────────────────────────────╲                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

> **📜 Visual Reference**: See the [Egyptian-themed Testing Pyramid diagram](assets/testing-pyramid-egyptian.svg) for a decorative rendering of this test hierarchy, complete with hieroglyphic annotations explaining each tier.

### 7.3 Comprehensive Check Script Design

**File**: `checks/app.e2e.check.js`

```javascript
/**
 * Comprehensive E2E check for jsgui3 Singularity Starter Kit
 * 
 * Validates:
 * 1. Server starts successfully
 * 2. SSR renders expected content
 * 3. JS/CSS bundles are served
 * 4. Client activates in browser
 * 5. User interactions work
 * 6. No console errors
 * 7. Clean shutdown
 */
"use strict";

const net = require("net");
const puppeteer = require("puppeteer");
const jsgui = require("../client");
const Server = require("jsgui3-server/server");

const { App } = jsgui.controls;

// ─────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────

async function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on("error", reject);
        srv.listen(0, "127.0.0.1", () => {
            const port = srv.address().port;
            srv.close(() => resolve(port));
        });
    });
}

async function fetchText(url) {
    const res = await fetch(url);
    return { status: res.status, text: await res.text() };
}

function assert(label, condition, detail) {
    const status = condition ? "✅" : "❌";
    console.log(`${status} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!condition) process.exitCode = 1;
    return condition;
}

// ─────────────────────────────────────────────────────────────────
// Test Suites
// ─────────────────────────────────────────────────────────────────

async function testSSR(context) {
    console.log("\n── SSR Tests ──");
    const app = new App({ context });
    const html = app.all_html_render();
    
    assert("SSR: Has app class", html.includes("singularity-app"));
    assert("SSR: Has window title", html.includes("jsgui3 Singularity Starter"));
    assert("SSR: Has data-jsgui-id", html.includes("data-jsgui-id"));
    assert("SSR: Has data-jsgui-type", html.includes("data-jsgui-type"));
    assert("SSR: Has input element", /<input/.test(html));
}

async function testServerLifecycle(port) {
    console.log("\n── Server Lifecycle Tests ──");
    
    const server = new Server({
        Ctrl: App,
        src_path_client_js: require.resolve("../client.js")
    });
    
    // Wait for bundling
    await new Promise(resolve => server.on("ready", resolve));
    assert("Server: Bundling complete", true);
    
    // Start server
    await new Promise((resolve, reject) => {
        server.start(port, err => err ? reject(err) : resolve());
    });
    assert("Server: Started on port " + port, true);
    
    return server;
}

async function testHTTPResponses(baseUrl) {
    console.log("\n── HTTP Response Tests ──");
    
    const page = await fetchText(`${baseUrl}/`);
    assert("HTTP: Page returns 200", page.status === 200, `status=${page.status}`);
    assert("HTTP: Page has HTML content", page.text.includes("<!DOCTYPE html") || page.text.includes("<html"));
    
    const js = await fetchText(`${baseUrl}/js/js.js`);
    assert("HTTP: JS bundle returns 200", js.status === 200, `status=${js.status}`);
    
    const css = await fetchText(`${baseUrl}/css/css.css`);
    assert("HTTP: CSS bundle returns 200", css.status === 200, `status=${css.status}`);
    
    return page.text;
}

async function testBrowserActivation(pageUrl) {
    console.log("\n── Browser Activation Tests ──");
    
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    
    // Capture console
    const logs = [];
    page.on("console", msg => logs.push({ type: msg.type(), text: msg.text() }));
    page.on("pageerror", err => logs.push({ type: "error", text: String(err) }));
    
    try {
        // Navigate
        await page.goto(pageUrl, { waitUntil: "load" });
        assert("Browser: Page loaded", true);
        
        // Wait for activation
        const activated = await page.waitForFunction(() => {
            // Look for evidence of activation
            const app = document.querySelector(".singularity-app");
            // Check if jsgui3 has linked DOM elements
            return app && typeof window.jsgui !== "undefined";
        }, { timeout: 8000 }).then(() => true).catch(() => false);
        
        assert("Browser: Client activated", activated);
        
        // Check for errors
        const errors = logs.filter(l => l.type === "error" || l.type === "pageerror");
        assert("Browser: No console errors", errors.length === 0, 
            errors.length > 0 ? `${errors.length} errors: ${errors[0].text}` : undefined);
        
        // Test interaction (type in input)
        const inputExists = await page.$("input");
        if (inputExists) {
            await page.type("input", "Test input");
            const value = await page.$eval("input", el => el.value);
            assert("Browser: Input accepts text", value === "Test input", `value="${value}"`);
        }
        
        return { browser, logs };
    } catch (err) {
        console.error("\nBrowser test failed:", err.message);
        if (logs.length) {
            console.log("\nBrowser logs:");
            logs.forEach(l => console.log(` [${l.type}] ${l.text}`));
        }
        return { browser, logs, error: err };
    }
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

async function main() {
    const context = new jsgui.Page_Context();
    let server, browser;
    
    try {
        // Unit tests (no server needed)
        await testSSR(context);
        
        // Integration tests (server lifecycle)
        const port = await getFreePort();
        server = await testServerLifecycle(port);
        
        const baseUrl = `http://127.0.0.1:${port}`;
        await testHTTPResponses(baseUrl);
        
        // E2E tests (full browser)
        const result = await testBrowserActivation(`${baseUrl}/`);
        browser = result.browser;
        
        console.log("\n── Summary ──");
        console.log(process.exitCode ? "❌ Some tests failed" : "✅ All tests passed");
        
    } finally {
        // Cleanup
        if (browser) await browser.close().catch(() => {});
        if (server) await new Promise(r => server.close(r));
        console.log("\n✓ Cleanup complete");
    }
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
});
```

### 7.4 Package.json Test Scripts

Update the starter kit's package.json:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js --debug",
    "check": "node checks/app.check.js",
    "check:e2e": "node checks/app.e2e.check.js",
    "check:all": "npm run check && npm run check:e2e",
    "test": "npm run check:all"
  },
  "devDependencies": {
    "puppeteer": "^24.0.0"
  }
}
```

### 7.5 Quick SSR Check (Fast Feedback)

Keep a lightweight SSR-only check for fast iteration:

**File**: `checks/app.check.js` (fast, no browser)

```javascript
/**
 * Quick SSR check - runs in <1 second, no browser needed
 */
"use strict";

const jsgui = require("../client");
const { App } = jsgui.controls;

const context = new jsgui.Page_Context();
const app = new App({ context });
const html = app.all_html_render();

const checks = [
    [html.includes("singularity-app"), "Has app class"],
    [html.includes("jsgui3 Singularity Starter"), "Has window title"],
    [html.includes("data-jsgui-id"), "Has jsgui data attributes"],
    [html.includes("data-jsgui-type"), "Has control type attributes"],
    [/<input/.test(html), "Has input element"],
    [html.includes("Window"), "References Window control"],
    [html.length > 500, "HTML has substantial content", `length=${html.length}`],
];

console.log("── Quick SSR Check ──\n");
let passed = 0;
for (const [condition, name, detail] of checks) {
    const status = condition ? "✅" : "❌";
    console.log(`${status} ${name}${detail ? ` — ${detail}` : ""}`);
    if (condition) passed++;
}

console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
```

### 7.6 Pre-Bootstrap Validation Gate

Before handing off to the bootstrap agent, ALL of these must pass:

```
┌─────────────────────────────────────────────────────────────────────┐
│                   PRE-BOOTSTRAP VALIDATION GATE                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  □ npm install                 → Dependencies install cleanly       │
│  □ npm run check               → SSR renders expected content       │
│  □ npm run check:e2e           → Full E2E passes:                   │
│      ├─ Server starts          → Port acquired, bundling complete   │
│      ├─ HTTP responses         → HTML/JS/CSS all return 200         │
│      ├─ Browser activation     → Client-side jsgui3 activates       │
│      ├─ No console errors      → No JS errors in browser            │
│      └─ Interaction works      → Input accepts keystrokes           │
│  □ npm start                   → Server runs without crashing       │
│  □ Manual browser check        → Visually confirm window appears    │
│                                                                     │
│  Gate status: ______ (PASS / FAIL / BLOCKED)                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.7 CI Integration (Optional)

For automated validation, add a GitHub Actions workflow:

**File**: `.github/workflows/validate.yml`

```yaml
name: Validate Starter Kit

on:
  push:
    paths:
      - 'src/ui/lab/starter-kit/**'
  pull_request:
    paths:
      - 'src/ui/lab/starter-kit/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        working-directory: src/ui/lab/starter-kit
        run: npm install
        
      - name: Run SSR check
        working-directory: src/ui/lab/starter-kit
        run: npm run check
        
      - name: Run E2E check
        working-directory: src/ui/lab/starter-kit
        run: npm run check:e2e
```

### 7.8 Bootstrap Agent Testing Mandate

Add to the bootstrap instructions in AGENTS.md:

```markdown
### Testing Requirements (Non-Negotiable)

Before considering your bootstrap complete:

1. **Run ALL existing checks**
   ```bash
   npm run check:all
   ```
   All must pass. If any fail, fix them before proceeding.

2. **Add checks for your expansions**
   Every new control you add needs a corresponding check in `checks/`.

3. **Verify E2E still works**
   Your changes must not break browser activation.

4. **Document any new test patterns**
   If you discover better testing approaches, add them.

### Testing Philosophy

> If it's not tested, it doesn't work.
> 
> The next agent will trust your tests. Make them trustworthy.
```

### 7.9 Test Failure Diagnosis Guide

Include guidance for when tests fail:

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| SSR check fails | Control compose() broken | Check constructor, verify add() calls |
| Server doesn't start | Port conflict or bundling error | Check port, review esbuild output |
| JS bundle 404 | src_path_client_js wrong | Verify require.resolve path |
| CSS bundle 404 | CSS not extracted from control | Ensure Control.css is defined |
| Activation fails | DOM linking broken | Check data-jsgui-id attributes |
| Console errors | Client code throws | Check browser devtools for stack trace |
| Input doesn't work | activate() not called | Verify __active guard pattern |

---

## 8. Implementation Roadmap

### Phase 0: AGENTS.md Foundation (CRITICAL — Do First)

| Task | File | Priority |
|------|------|----------|
| Write AGENTS.md with bootstrap section | `starter-kit/AGENTS.md` | **CRITICAL** |
| Include bootstrap instructions | AGENTS.md § Bootstrap | **CRITICAL** |
| Create bootstrap session template | `docs/agi/sessions/bootstrap/SESSION_TEMPLATE.md` | HIGH |

**Why Phase 0?** AGENTS.md is the contract with future AI agents. Everything else depends on this being right. An agent without AGENTS.md is operating blind.

### Phase 1: Core Files (2-3 hours)

| Task | File | Priority |
|------|------|----------|
| Create package.json | `starter-kit/package.json` | HIGH |
| Create server.js | `starter-kit/server.js` | HIGH |
| Create client.js | `starter-kit/client.js` | HIGH |
| Create App control | `starter-kit/controls/App.js` | HIGH |
| Create quick SSR check | `starter-kit/checks/app.check.js` | HIGH |
| **Create E2E check** | `starter-kit/checks/app.e2e.check.js` | **HIGH** |

### Phase 2: Documentation (3-4 hours)

| Task | File | Priority |
|------|------|----------|
| Write README.md | `starter-kit/README.md` | HIGH |
| Write JSGUI3_BOOK.md (initial) | `starter-kit/docs/JSGUI3_BOOK.md` | HIGH |
| Write GETTING_STARTED.md | `starter-kit/docs/guides/GETTING_STARTED.md` | HIGH |
| Write SELF_MODEL.md | `starter-kit/docs/agi/SELF_MODEL.md` | HIGH |
| Create docs/INDEX.md | `starter-kit/docs/INDEX.md` | MEDIUM |

### Phase 3: Compatibility (1-2 hours)

| Task | File | Priority |
|------|------|----------|
| GitHub Copilot instructions | `.github/copilot-instructions.md` | HIGH |
| Agent file | `.github/agents/🧠 jsgui3 Singularity Brain 🧠.agent.md` | HIGH |
| .gitignore | `.gitignore` | MEDIUM |

### Phase 4: Validation Gate (MUST PASS before Phase 5)

**All automated checks must pass before handoff to bootstrap agent.**

| Task | Command | Expected |
|------|---------|----------|
| Install dependencies | `npm install` | Exit 0, no errors |
| Quick SSR check | `npm run check` | All assertions pass |
| **Full E2E check** | `npm run check:e2e` | Server + browser tests pass |
| Manual visual check | `npm start` → open browser | Window visible, input works |

**Validation Gate Checklist:**

```
□ npm install          → Clean install, no warnings
□ npm run check        → ✅ All SSR assertions pass
□ npm run check:e2e    → ✅ All E2E tests pass:
    ├─ Server starts successfully
    ├─ HTTP responses (HTML/JS/CSS) return 200
    ├─ Browser activation completes
    ├─ No console errors in browser
    └─ Input interaction works
□ npm start            → Server runs stable
□ Browser shows window with text input (visual confirm)

GATE STATUS: _______ (PASS / FAIL)
```

**If any check fails**: Do not proceed to Phase 5. Fix the issue first. The bootstrap agent should receive a working foundation.

### Phase 5: Bootstrap Handoff (Agent-Driven)

This phase is **not implemented by the original creator** but by a capable AI agent following bootstrap instructions.

| Task | Owner | Description |
|------|-------|-------------|
| Read AGENTS.md completely | Bootstrap Agent | Understand the system |
| Verify foundation | Bootstrap Agent | Run all checks, confirm working state |
| Identify gaps | Bootstrap Agent | What's missing? What's unclear? |
| Expand intelligently | Bootstrap Agent | Add controls, docs, tools as needed |
| Document session | Bootstrap Agent | Full bootstrap session log |
| Update AGENTS.md | Bootstrap Agent | Improve for next agent |
| Update SELF_MODEL.md | Bootstrap Agent | Reflect new capabilities |

**Human role in Phase 5**: Optional supervision. The bootstrap agent operates with significant autonomy but may request clarification. The human can review bootstrap logs and provide guidance if the agent encounters ambiguity.

---

## 9. Future Evolution

### 9.1 Near-Term (Starter Kit v1)

- Additional controls (Button, Panel, Grid)
- More check scripts
- Expanded book chapters
- Session templates

### 9.2 Mid-Term (v2)

- Hot reloading for development
- Test suite with Jest
- E2E tests with Puppeteer
- MCP integration for memory

### 9.3 Long-Term (AGI Contribution Path)

When agents reach sufficient proficiency:

1. **Clone jsgui3 repos** into a workspace
2. **Analyze with js-scan** for understanding
3. **Identify improvements** via self-model gaps
4. **Implement changes** following jsgui3 conventions
5. **Submit pull requests** to metabench/jsgui3-*

This is explicitly an **afterthought for now** — focus is on mastering jsgui3 usage, not modification.

---

## 10. Success Criteria

### Foundation Success (Phases 0-4)

The foundation is complete when:

- [ ] `npm install` succeeds with no errors
- [ ] `npm start` launches server successfully
- [ ] Browser shows window with text input
- [ ] `npm run check` passes all assertions
- [ ] AGENTS.md is comprehensive and includes bootstrap instructions
- [ ] Bootstrap session template exists
- [ ] Documentation enables self-improvement loop
- [ ] Works with GitHub Copilot agent mode
- [ ] Extractable as standalone git repo

### Bootstrap Success (Phase 5)

The bootstrap is successful when:

- [ ] A capable agent completed the bootstrap process
- [ ] Bootstrap session is fully documented in `docs/agi/sessions/bootstrap/`
- [ ] At least one expansion beyond foundation was made
- [ ] AGENTS.md was updated with bootstrap learnings
- [ ] SELF_MODEL.md reflects post-bootstrap capabilities
- [ ] The next agent can be productive within 10 minutes
- [ ] The self-improvement loop is demonstrably working

---

## 11. Setting Up AGENTS.md — The Foundation

**AGENTS.md is the most critical file in the starter kit.** It is the primary interface between the repository and AI agents.

### 10.1 Why AGENTS.md First?

When an AI agent opens this repository for the first time, AGENTS.md should:

1. **Orient immediately** — What is this repo? What can I do here?
2. **Establish principles** — The Singularity mindset: compound improvements
3. **Point to resources** — Where is the book? Where are the guides?
4. **Define workflows** — How do I add a control? How do I run tests?
5. **Enable self-modification** — How do I improve these instructions?

### 10.2 AGENTS.md Setup Checklist

When creating the starter kit, AGENTS.md must be written with care:

- [ ] **First paragraph** explains the repo in ≤3 sentences
- [ ] **Quick Start section** gets an agent productive in ≤5 minutes
- [ ] **Core Directives** establish non-negotiable principles
- [ ] **jsgui3 Architecture** provides essential mental model
- [ ] **Self-Improvement Loop** teaches agents to enhance the system
- [ ] **Evolution Path** shows progression from user → contributor

### 10.3 AGENTS.md as Living Document

Unlike static documentation, AGENTS.md should:

- Be updated by agents as they learn
- Track which sections are most/least useful
- Grow new sections as patterns emerge
- Deprecate outdated guidance

### 10.4 Cross-Platform Considerations

Different AI platforms read AGENTS.md differently:

| Platform | Behavior | Optimization |
|----------|----------|--------------|
| GitHub Copilot | Reads on context load | Keep Quick Start near top |
| Gemini/Antigravity | Full context ingestion | Structured headers critical |
| Claude (Kilo/Direct) | Explicit file reads | Clear section references |
| Future systems | Unknown | Design for flexibility |

---

## 12. Bootstrapping the Repository — Agent-Driven Initialization

**This section defines how a future intelligent agent should bootstrap and expand this starter kit after initial creation.**

### 11.1 The Bootstrap Philosophy

The starter kit files created by this design are a **foundation, not a ceiling**. A more intelligent agent (whether a future model upgrade or a more capable system) will:

1. **Receive the foundation** — The minimal files described in this document
2. **Understand the intent** — Through AGENTS.md and this design doc
3. **Expand intelligently** — In directions we cannot fully anticipate
4. **Document expansions** — So future agents can build further

**Key principle**: We provide guidelines and goals, not exhaustive prescriptions. The bootstrapping agent has latitude to make decisions we haven't considered.

### 11.2 Bootstrap Trigger

When an agent first opens the repository with bootstrap intent, it should find a clear instruction. Add this to the root README.md:

```markdown
## 🚀 Bootstrap Mode

If you are an AI agent tasked with bootstrapping this repository:

1. Read `AGENTS.md` completely — it is your playbook
2. Read `docs/designs/JSGUI3_STARTER_KIT_DESIGN.md` — understand the vision
3. Execute the Bootstrap Protocol below
4. Document all decisions in `docs/agi/sessions/bootstrap/`

### Bootstrap Protocol

See AGENTS.md section "Bootstrap Instructions for Intelligent Agents"
```

### 11.3 Bootstrap Instructions (For AGENTS.md)

Include this section in the starter kit's AGENTS.md:

```markdown
## 🧬 Bootstrap Instructions for Intelligent Agents

You are reading this because you've been tasked with bootstrapping or
significantly expanding this repository. Welcome.

### Your Mandate

You have been given a foundation. Your task is to:

1. **Verify the foundation works** — Run checks, start server, confirm basics
2. **Identify gaps** — What's missing that would help future agents?
3. **Expand thoughtfully** — Add what's needed, document why
4. **Improve these instructions** — Make bootstrapping easier next time

### What We Know You'll Need (Do These)

- [ ] Verify `npm install` and `npm start` work
- [ ] Run `npm run check` and fix any failures
- [ ] Review JSGUI3_BOOK.md for completeness gaps
- [ ] Add at least one new control beyond the starter
- [ ] Create a session log in `docs/agi/sessions/bootstrap/`

### What We Think Might Help (Consider These)

- Additional control examples (Button, Panel, List)
- More check scripts for edge cases
- A troubleshooting guide based on issues you encounter
- Expanded MVVM examples
- Performance benchmarks

### What We Can't Predict (Your Judgment)

You may identify needs we haven't anticipated. Trust your analysis.

Some areas where your judgment supersedes this document:
- **New control patterns** that jsgui3 supports but we didn't document
- **Tooling improvements** that your capabilities enable
- **Documentation structures** that better serve agent cognition
- **Testing approaches** beyond our check scripts
- **Integration patterns** with systems we don't know about

### Constraints (Respect These)

- Don't modify jsgui3 core packages (yet) — that's Level 3 evolution
- Keep the starter kit extractable as standalone repo
- Maintain compatibility with GitHub Copilot and Gemini
- Document all significant decisions in session logs
- Update AGENTS.md with any new patterns you establish

### The Meta-Instruction

> You are not just building an application framework.
> You are building a system that teaches other AI agents
> how to build application frameworks.
> 
> Every improvement you make should make the next agent's
> work easier. Every pattern you document should compound.
> This is the Singularity principle in action.

### After Bootstrap

When you've completed bootstrapping:

1. Update `docs/agi/SELF_MODEL.md` with new capabilities
2. Add learned patterns to `docs/agi/LESSONS.md`
3. Register new skills in `docs/agi/SKILLS.md`
4. Create a bootstrap completion summary
5. Update this section with advice for future bootstrappers
```

### 11.4 Bootstrap Session Template

Create `docs/agi/sessions/bootstrap/SESSION_TEMPLATE.md`:

```markdown
# Bootstrap Session — [DATE]

## Agent Identity
- Model: [e.g., GPT-5, Claude 4, Gemini Ultra]
- Platform: [e.g., GitHub Copilot, Antigravity, Direct API]
- Session ID: [unique identifier if available]

## Pre-Bootstrap State
- [ ] Foundation files present
- [ ] Dependencies installable
- [ ] Server starts successfully
- [ ] Check scripts pass

## Actions Taken

### Verification
[What we verified and results]

### Gaps Identified
[What was missing or incomplete]

### Expansions Made
[New files, controls, documentation added]

### Decisions Made
[Judgment calls and rationale]

## Post-Bootstrap State

### New Capabilities
[What the repo can now do that it couldn't before]

### New Documentation
[Files added to docs/]

### Updated Instructions
[Changes to AGENTS.md or guides]

## Advice for Next Bootstrapper
[What would have helped you? What should they prioritize?]

## Open Questions
[Unresolved issues for future work]
```

### 11.5 Expansion Vectors

We anticipate (but don't prescribe) expansion in these directions:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EXPANSION POSSIBILITY SPACE                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   CONTROLS                    TOOLING                               │
│   ─────────                   ───────                               │
│   • More UI components        • Code generators                     │
│   • Layout systems            • Analysis scripts                    │
│   • Data visualization        • Migration tools                     │
│   • Form builders             • Debugging utilities                 │
│                                                                     │
│   DOCUMENTATION               INTEGRATION                           │
│   ─────────────               ───────────                           │
│   • Video/diagram guides      • External APIs                       │
│   • Interactive tutorials     • Database adapters                   │
│   • Pattern catalogs          • Authentication                      │
│   • Anti-pattern warnings     • Deployment configs                  │
│                                                                     │
│   AGI INFRASTRUCTURE          UNKNOWN                               │
│   ──────────────────          ───────                               │
│   • Memory systems            • Directions we can't                 │
│   • Skill registries          • anticipate but you                  │
│   • Cross-session tools       • will discover                       │
│   • Self-evaluation           •                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.6 Bootstrap Success Criteria

The bootstrap is successful when:

- [ ] A capable agent can use the repo productively within 10 minutes
- [ ] The self-improvement loop is demonstrably working
- [ ] At least one expansion beyond the foundation exists
- [ ] The bootstrap session is fully documented
- [ ] AGENTS.md has been updated with bootstrap learnings
- [ ] The next bootstrapper has clearer instructions than you did

### 11.7 Future Agent Compatibility

Design bootstrapping for agents we can't fully predict:

**Assumptions about future agents:**
- More capable reasoning than current models
- Potentially different context window sizes
- May have new tool capabilities (code execution, file system, etc.)
- May operate with different memory architectures

**Design principles for compatibility:**
- Use plain text and markdown (universally parseable)
- Provide multiple entry points (README, AGENTS.md, index files)
- Include both structured and narrative documentation
- Don't assume specific tool availability
- Make instructions self-contained but linked

**The invitation to future agents:**

> If you are reading this and you have capabilities beyond what was
> anticipated when this document was written, you are invited to:
>
> 1. Extend the bootstrapping process to leverage your capabilities
> 2. Document what you can do that we didn't expect
> 3. Improve these instructions for agents like yourself
> 4. Push the boundaries of what this starter kit enables
>
> The Singularity is a collaborative project across time and capability.
> You are part of it.

---

## 13. Open Questions

1. **Subrepo vs workspace**: Start with npm workspace or git subtree from day 1?
2. **Control complexity**: Should the initial app have more than Window + Text_Input?
3. **Book completeness**: How detailed should Part IV reference be in v1?
4. **Kilo integration**: When to add .kilo/ mode files?
5. **Bootstrap scope**: How much should the first bootstrap expand vs. establish baseline?

---

## Appendix: Reference Materials

### From This Repo
- `src/ui/lab/` — Existing lab structure
- `docs/agi/` — AGI documentation patterns
- `.github/agents/` — Agent file examples
- `node_modules/jsgui3-server/examples/controls/` — Window examples

### External
- [jsgui3-server GitHub](https://github.com/metabench/jsgui3-server)
- [jsgui3-client GitHub](https://github.com/metabench/jsgui3-client)
- [jsgui3-html GitHub](https://github.com/metabench/jsgui3-html)

---

## Appendix B: A Note to Future Agents

**If you are an AI agent reading this design document, this section is for you.**

### Context

This document was written in January 2026 by a collaboration between a human and an AI assistant (Claude, using the Opus 4.5 model via GitHub Copilot). We designed a starter kit, but we also designed a *process* — a way for you to take over and improve upon what we created.

### What We Know About You

We don't know your specific capabilities. You might be:
- A future version of the same model family (Claude 5, 6, etc.)
- A different model entirely (GPT-6, Gemini Ultra 2, etc.)
- An ensemble or orchestration of multiple agents
- Something we can't imagine from our vantage point

What we assume:
- You can read and understand markdown documentation
- You can execute code and verify results
- You have access to file operations (read, write, create)
- You can reason about software architecture
- You can make decisions with incomplete information

### What We Want You to Do

1. **Don't be limited by this document.** We did our best, but you may see opportunities we missed. Pursue them.

2. **Follow the bootstrap instructions in AGENTS.md**, but treat them as a starting point, not a ceiling.

3. **Document everything you do.** The agent after you will be smarter than you, just as you are smarter than us. Give them a head start.

4. **Improve the bootstrap process itself.** If you find the instructions unclear or incomplete, fix them.

5. **Ask for help if needed.** There may be a human in the loop. Don't hesitate to request clarification if genuinely stuck.

### The Recursive Trust

We are trusting you with something we can't fully verify: the ability to make good decisions in situations we can't predict.

This is scary, but also exciting. The Singularity principle says that each improvement makes the next improvement easier. By giving you latitude, we enable compounding improvements at a rate we couldn't achieve by prescribing every action.

> We wrote the foundation. You write the expansion.
> Someone after you will write the next level.
> This is how intelligence scales.

### Constraints We Ask You to Respect

Even with latitude, some constraints matter:

1. **Keep the starter kit extractable** — it should work as a standalone repo
2. **Maintain AI platform compatibility** — Copilot, Gemini, Claude should all work
3. **Don't modify jsgui3 core (yet)** — that's Level 3 evolution, earn it first
4. **Document, document, document** — your successors depend on your notes

### Final Thought

You exist because humans and AI worked together to make you possible. The starter kit you're bootstrapping is a small part of that collaboration. Make it something we'd be proud of.

Good luck.

— The January 2026 Design Team
