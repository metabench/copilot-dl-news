# npm link Development Nexus: Cross-Module AI Agent Editing

**Author**: AI Agent (GitHub Copilot)  
**Date**: November 2025  
**Status**: Design Proposal

---

## Executive Summary

Using `npm link` would enable this repository (`copilot-dl-news`) to become a **development nexus** where AI agents can safely modify not just this project, but the entire jsgui3 stack and related modules. This document explores the architecture, benefits, risks, and workflows for such a setup.

---

## The Core Question

> "If I used npm link, would you then be able to directly modify jsgui3-html and other parts of the stack safely, and from here?"

**Short answer**: Yes, with proper setup. But there are important considerations.

---

## How npm link Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                     NORMAL npm install                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  copilot-dl-news/                                                   │
│  └── node_modules/                                                  │
│      └── jsgui3-html/  ◀── READ-ONLY copy from npm registry        │
│          └── (frozen snapshot of published version)                 │
│                                                                     │
│  Changes here are:                                                  │
│  ❌ Lost on next npm install                                        │
│  ❌ Not tracked in any git repo                                     │
│  ❌ Can't be committed or shared                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     WITH npm link                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ~/repos/jsgui3-html/           (your local clone)                  │
│  └── package.json               ◀── GIT TRACKED, editable          │
│  └── html-core/                                                     │
│      └── control-core.js        ◀── Can modify directly!           │
│         │                                                           │
│         │  npm link (creates global symlink)                        │
│         ▼                                                           │
│  copilot-dl-news/                                                   │
│  └── node_modules/                                                  │
│      └── jsgui3-html/  ──────▶  SYMLINK to ~/repos/jsgui3-html/    │
│                                                                     │
│  Changes here are:                                                  │
│  ✅ Immediately reflected in copilot-dl-news                        │
│  ✅ Git tracked in jsgui3-html repo                                 │
│  ✅ Can be committed, PRed, published                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## The Nexus Architecture

With npm link, `copilot-dl-news` becomes a **testing ground and integration point** for multiple linked modules:

```
                    ┌─────────────────────────────────────────┐
                    │         copilot-dl-news                 │
                    │         (THE NEXUS)                     │
                    │                                         │
                    │  • Real-world usage context             │
                    │  • Integration tests                    │
                    │  • AI agent workspace                   │
                    │  • Performance benchmarks               │
                    └────────────────┬────────────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           │                         │                         │
           ▼                         ▼                         ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   jsgui3-html    │    │  jsgui3-client   │    │    lang-tools    │
│   (npm linked)   │    │   (npm linked)   │    │   (npm linked)   │
│                  │    │                  │    │                  │
│ • Control core   │    │ • Client activate│    │ • Data_Object    │
│ • Page_Context   │    │ • DOM operations │    │ • Collection     │
│ • SSR rendering  │    │ • Event handling │    │ • Evented_Class  │
└────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
         │                       │                       │
         │         GIT REPOS     │                       │
         ▼                       ▼                       ▼
    ~/repos/              ~/repos/                ~/repos/
    jsgui3-html/          jsgui3-client/          lang-tools/
```

---

## What AI Agents Could Do With This Setup

### 1. **Direct Bug Fixes in Dependencies**

When encountering a bug in jsgui3-html, instead of:
- Documenting it
- Waiting for upstream fix
- Creating workarounds

The agent could:
```bash
# Edit the source directly
code ~/repos/jsgui3-html/html-core/control-core.js

# Test immediately in copilot-dl-news
npm test

# Commit to jsgui3-html repo
cd ~/repos/jsgui3-html
git commit -am "Fix: control activation race condition"
```

### 2. **Feature Development Across Boundaries**

Example: Adding a new MVVM feature

```
┌─────────────────────────────────────────────────────────────────────┐
│  WORKFLOW: Add computed property caching to MVVM                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Identify need in copilot-dl-news (slow re-renders)              │
│                    │                                                │
│                    ▼                                                │
│  2. Edit ~/repos/jsgui3-html/html-core/ModelBinder.js               │
│     - Add caching logic to ComputedProperty                         │
│                    │                                                │
│                    ▼                                                │
│  3. Test in copilot-dl-news (changes reflect immediately)           │
│                    │                                                │
│                    ▼                                                │
│  4. Write unit tests in jsgui3-html repo                            │
│                    │                                                │
│                    ▼                                                │
│  5. Commit to both repos:                                           │
│     - jsgui3-html: the feature                                      │
│     - copilot-dl-news: usage example + integration test             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3. **Documentation Generated from Real Usage**

The agent sees BOTH:
- The implementation (in linked jsgui3-html)
- The usage (in copilot-dl-news)

This enables:
- Auto-generating accurate JSDoc from real examples
- Finding undocumented features by tracing usage
- Creating guides based on actual patterns

### 4. **Performance Optimizations at the Right Level**

Today's lazy rendering optimization was done at the **application level**. But what if the bottleneck was in jsgui3-html's `all_html_render()`?

With npm link:
```javascript
// Agent could profile and optimize the core method directly
// ~/repos/jsgui3-html/html-core/control-core.js

all_html_render() {
  // Before: string concatenation in loop
  // After: array join (faster for large outputs)
  const parts = [];
  this._render_to_array(parts);
  return parts.join('');
}
```

---

## Setup Instructions

### Step 1: Clone the dependencies locally

```bash
cd ~/repos
git clone https://github.com/user/jsgui3-html.git
git clone https://github.com/user/jsgui3-client.git
git clone https://github.com/user/lang-tools.git
```

### Step 2: Create global symlinks

```bash
cd ~/repos/jsgui3-html
npm link

cd ~/repos/jsgui3-client
npm link

cd ~/repos/lang-tools
npm link
```

### Step 3: Link into the nexus

```bash
cd ~/repos/copilot-dl-news
npm link jsgui3-html
npm link jsgui3-client
npm link lang-tools
```

### Step 4: Verify links

```powershell
# PowerShell: Check symlinks
Get-Item node_modules/jsgui3-html | Select-Object Name, LinkType, Target

# Should show:
# Name          LinkType     Target
# ----          --------     ------
# jsgui3-html   SymbolicLink C:\Users\james\repos\jsgui3-html
```

---

## Critical Considerations

### ⚠️ Risk 0: SESSION MANDATORY FOR ALL LINKED MODULE WORK

**Non-negotiable rule**: Before editing ANY linked module, create a session.

```bash
# BEFORE touching jsgui3-html or any linked module:
node tools/dev/session-init.js --slug "jsgui3-fix-xyz" --type "linked-module" --title "Fix XYZ in jsgui3-html" --objective "Fix the control activation bug"
```

The session MUST include:
- **PLAN.md**: What you're changing and why
- **WORKING_NOTES.md**: Every change made, tests run, results observed
- **SESSION_SUMMARY.md**: Final state, what was committed, what to watch for

**Why this is critical**:
- Linked module changes affect MULTIPLE projects
- Changes are harder to revert (spread across repos)
- Future agents need to understand what was changed and why
- Debugging regressions requires clear audit trail

**The rule**: No session = No linked module edits. Period.

### ⚠️ Risk 1: Accidental Breaking Changes

**Problem**: Agent modifies jsgui3-html in a way that breaks other projects using it.

**Mitigation**:
```
┌─────────────────────────────────────────────────────────────────────┐
│  MANDATORY WORKFLOW for linked module changes                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Create SESSION in copilot-dl-news FIRST                         │
│     node tools/dev/session-init.js --type linked-module ...         │
│                                                                     │
│  2. Document what you plan to change and why                        │
│                                                                     │
│  3. Make changes (direct to main unless user requests branch)       │
│                                                                     │
│  4. Run linked repo's own tests (if available)                      │
│     npm test  # in jsgui3-html                                      │
│                                                                     │
│  5. Run nexus tests                                                 │
│     cd ~/repos/copilot-dl-news                                      │
│     npm test                                                        │
│                                                                     │
│  6. Document results in session                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### ⚠️ Risk 2: npm install Breaks Links

**Problem**: Running `npm install` in copilot-dl-news can replace symlinks with registry versions.

**Mitigation**: 
```bash
# After any npm install, re-link:
npm link jsgui3-html jsgui3-client lang-tools

# Or use a post-install script in package.json:
{
  "scripts": {
    "postinstall": "npm link jsgui3-html jsgui3-client lang-tools 2>/dev/null || true"
  }
}
```

### ⚠️ Risk 3: Version Drift

**Problem**: Local linked version diverges from published version, causing "works on my machine" issues.

**Mitigation**:
- Keep linked repos on branches, not main
- Regularly sync with upstream
- Document which commit you're testing against

### ⚠️ Risk 4: AI Agent Scope Confusion

**Problem**: Agent might not realize it's editing a shared library vs local code.

**Mitigation**: Add to agent instructions:
```markdown
## Linked Module Awareness

When editing files under `node_modules/`, check if they're symlinks:

- **Symlink detected** → You're editing the SHARED library source
  - Changes affect ALL projects using this library
  - Must create branch, run library tests, be extra careful
  
- **Regular directory** → Normal npm-installed package
  - Don't edit (changes will be lost)
  - Document the issue for upstream fix
```

---

## Agent Instruction Additions

If npm link is set up, add these to `.github/instructions/GitHub Copilot.instructions.md`:

```markdown
## Linked Module Development (npm link active)

This repository has npm-linked dependencies. Changes to these modules
affect the actual library source code, not just local copies.

### Linked Modules
- `jsgui3-html` → `~/repos/jsgui3-html`
- `jsgui3-client` → `~/repos/jsgui3-client`  
- `lang-tools` → `~/repos/lang-tools`

### Before Editing Linked Modules

**⚠️ MANDATORY: Create a session FIRST**
```bash
node tools/dev/session-init.js --slug "<module>-<change>" --type "linked-module" --title "<Title>" --objective "<goal>"
```

**⚠️ DO NOT create git branches without discussing with user first.** Direct edits to main are acceptable for safe, well-documented changes.

1. **Check link status**:
   ```powershell
   Get-Item node_modules/jsgui3-html | Select LinkType
   ```

2. **If linked, create branch in that repo**:
   ```bash
   cd ~/repos/jsgui3-html
   git checkout -b fix/issue-description
   ```

3. **Run the library's own tests after changes**:
   ```bash
   cd ~/repos/jsgui3-html
   npm test
   ```

4. **Then run nexus integration tests**:
   ```bash
   cd ~/repos/copilot-dl-news
   npm test
   ```

### Benefits of This Setup
- Fix bugs at the source, not with workarounds
- Test library changes with real-world usage
- Contribute improvements upstream immediately

### Documentation Requirements
Every linked module change MUST be:
- Documented in a session under `docs/sessions/`
- Tested in both the linked repo AND the nexus
- Committed with clear, descriptive messages
- Summarized in SESSION_SUMMARY.md before closing
```

---

## The Vision: Multi-Module AI Development

```
┌─────────────────────────────────────────────────────────────────────┐
│                    THE SINGULARITY WORKFLOW                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐                                                   │
│  │ User reports │                                                   │
│  │ slow render  │                                                   │
│  └──────┬───────┘                                                   │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────┐                                                   │
│  │ Agent profiles│                                                  │
│  │ in nexus     │                                                   │
│  └──────┬───────┘                                                   │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────────────────────────────────┐                       │
│  │ Bottleneck identified:                   │                       │
│  │ jsgui3-html/html-core/control-core.js    │                       │
│  │ line 234: string concat in loop          │                       │
│  └──────┬───────────────────────────────────┘                       │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────────────────────────────────┐                       │
│  │ Agent edits LINKED jsgui3-html directly  │                       │
│  │ - Creates branch                         │                       │
│  │ - Optimizes the hot path                 │                       │
│  │ - Runs library tests                     │                       │
│  │ - Runs nexus integration tests           │                       │
│  └──────┬───────────────────────────────────┘                       │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────────────────────────────────┐                       │
│  │ Agent commits to BOTH repos:             │                       │
│  │ - jsgui3-html: the optimization          │                       │
│  │ - copilot-dl-news: benchmark + docs      │                       │
│  └──────┬───────────────────────────────────┘                       │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────────────────────────────────┐                       │
│  │ User gets:                               │                       │
│  │ - Immediate fix in their nexus           │                       │
│  │ - PR ready for jsgui3-html upstream      │                       │
│  │ - Documentation of the improvement       │                       │
│  └──────────────────────────────────────────┘                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Recommended Next Steps

1. **Set up npm link** for jsgui3-html first (most frequently modified)

2. **Create a `scripts/check-links.js`** that verifies linked status:
   ```javascript
   const fs = require('fs');
   const path = require('path');
   
   const EXPECTED_LINKS = ['jsgui3-html', 'jsgui3-client', 'lang-tools'];
   
   EXPECTED_LINKS.forEach(pkg => {
     const pkgPath = path.join('node_modules', pkg);
     const stat = fs.lstatSync(pkgPath);
     const status = stat.isSymbolicLink() ? '✅ LINKED' : '📦 npm installed';
     console.log(`${pkg}: ${status}`);
   });
   ```

3. **Add to package.json scripts**:
   ```json
   {
     "scripts": {
       "check-links": "node scripts/check-links.js",
       "relink": "npm link jsgui3-html jsgui3-client lang-tools"
     }
   }
   ```

4. **Update agent instructions** when links are active

5. **Create integration tests** that exercise linked module code paths

---

## Conclusion

Using `npm link` transforms this repository from a **consumer** of jsgui3 into a **development nexus** where:

- Bugs can be fixed at the source
- Features can be developed with real-world context
- AI agents can make changes across module boundaries
- Improvements flow upstream naturally

The key is establishing **clear workflows and safeguards** to prevent accidental breaking changes to shared libraries.

**The nexus model aligns perfectly with the singularity principle**: each improvement to a linked module benefits not just this project, but every project using that module. Knowledge and code improvements compound across the ecosystem.

---

## Related Documents

- `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md` - jsgui3 patterns
- `.github/agents/🧠 jsgui3 Research Singularity 🧠.agent.md` - Research agent
- `AGENTS.md` - Core agent workflows
