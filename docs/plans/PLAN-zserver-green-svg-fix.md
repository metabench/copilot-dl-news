# EXECUTION PLAN: Fix Z-Server Green SVG Indicator

## Context
- **Purpose**: Copy missing CSS for the green pulsating SVG indicator from factory file to styles.css
- **Triggered by**: Green indicator not displaying when server is running
- **Related files**: `z-server/styles.css`, `z-server/ui/controls/zServerControlsFactory.js`

## Prerequisites
- [x] File exists: `z-server/styles.css`
- [x] File exists: `z-server/ui/controls/zServerControlsFactory.js`

## Steps (Execute in order)

### Step 1: Add Server URL CSS to styles.css

**Type**: EDIT
**File**: `z-server/styles.css`
**Operation**: INSERT_AFTER
**Find** (end of file marker - the last closing brace and animation):
```css
.zs-server-item {
  animation: zs-fade-in 0.4s ease both;
}
```
**Insert this CSS block**:
```css

/* ═══════════════════════════════════════════════════════════════════════════ */
/* SERVER URL DISPLAY - Industrial Luxury Obsidian + White Leather + Emerald   */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-server-url {
  display: flex;
  align-items: center;
  gap: 28px;
  background: linear-gradient(135deg, 
    rgba(16, 185, 129, 0.12) 0%,
    rgba(5, 150, 105, 0.08) 30%,
    rgba(20, 24, 36, 0.95) 70%,
    rgba(10, 13, 20, 0.98) 100%
  );
  border: 3px solid transparent;
  border-image: linear-gradient(135deg, #34d399 0%, #10b981 50%, #059669 100%) 1;
  border-radius: 16px;
  padding: 24px 32px;
  margin-bottom: 24px;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  box-shadow: 
    0 0 40px rgba(16, 185, 129, 0.15),
    0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

/* White leather texture overlay */
.zs-server-url::before {
  content: "";
  position: absolute;
  inset: 0;
  background: 
    radial-gradient(ellipse at 20% 20%, rgba(255, 255, 255, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 80%, rgba(16, 185, 129, 0.1) 0%, transparent 50%);
  opacity: 1;
  pointer-events: none;
}

/* Animated glow border */
.zs-server-url::after {
  content: "";
  position: absolute;
  inset: -3px;
  background: linear-gradient(135deg, #2dd4bf, #10b981, #059669, #10b981, #2dd4bf);
  background-size: 300% 300%;
  border-radius: 18px;
  z-index: -1;
  animation: zs-border-glow 3s ease-in-out infinite;
}

@keyframes zs-border-glow {
  0%, 100% { background-position: 0% 50%; opacity: 0.6; }
  50% { background-position: 100% 50%; opacity: 1; }
}

.zs-server-url:hover {
  transform: translateY(-4px) scale(1.01);
  box-shadow: 
    0 0 60px rgba(16, 185, 129, 0.3),
    0 0 100px rgba(16, 185, 129, 0.15),
    0 16px 48px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.zs-server-url:active {
  transform: translateY(-2px) scale(1.005);
}

.zs-server-url--hidden {
  display: none !important;
}

/* Large SVG Icon Container */
.zs-server-url__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.zs-server-url__svg {
  filter: drop-shadow(0 0 20px rgba(16, 185, 129, 0.5));
}

/* Outer ring - obsidian with emerald glow */
.zs-server-url__outer-ring {
  fill: none;
  stroke: url(#outerRingGrad);
  stroke-width: 3;
  opacity: 0.6;
  animation: zs-outer-ring-pulse 2.5s ease-in-out infinite;
  transform-origin: 60px 60px;
}

@keyframes zs-outer-ring-pulse {
  0%, 100% { 
    opacity: 0.4;
    stroke-width: 3;
  }
  50% { 
    opacity: 0.9;
    stroke-width: 4;
  }
}

/* Middle ring - emerald glow */
.zs-server-url__middle-ring {
  fill: none;
  stroke: #10b981;
  stroke-width: 2;
  filter: drop-shadow(0 0 12px #10b981);
  animation: zs-middle-ring-pulse 2s ease-in-out infinite;
  transform-origin: 60px 60px;
}

@keyframes zs-middle-ring-pulse {
  0%, 100% { 
    opacity: 0.5;
    filter: drop-shadow(0 0 8px #10b981);
  }
  50% { 
    opacity: 1;
    filter: drop-shadow(0 0 20px #10b981);
  }
}

/* Inner circle - white leather with emerald tint */
.zs-server-url__inner-circle {
  fill: url(#innerGlowGrad);
  filter: drop-shadow(0 0 15px rgba(52, 211, 153, 0.6));
  animation: zs-inner-breathe 1.8s ease-in-out infinite;
}

@keyframes zs-inner-breathe {
  0%, 100% { 
    filter: drop-shadow(0 0 10px rgba(52, 211, 153, 0.5));
    transform: scale(1);
  }
  50% { 
    filter: drop-shadow(0 0 25px rgba(52, 211, 153, 0.8));
    transform: scale(1.02);
  }
}

/* Check mark - obsidian colored */
.zs-server-url__check {
  fill: none;
  stroke: #0a0d14;
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

/* Radiating rays - luxury detail */
.zs-server-url__ray {
  stroke: #34d399;
  stroke-width: 2;
  stroke-linecap: round;
  opacity: 0.4;
  animation: zs-ray-pulse 2s ease-in-out infinite;
}

@keyframes zs-ray-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.8; }
}

/* URL Text Wrapper */
.zs-server-url__wrapper {
  flex: 1;
  min-width: 0;
}

.zs-server-url__label {
  font-family: var(--zs-font-display);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 4px;
  color: #34d399;
  margin-bottom: 8px;
  text-shadow: 0 0 20px rgba(52, 211, 153, 0.5);
}

.zs-server-url__text {
  font-family: var(--zs-font-mono);
  font-size: 28px;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 
    0 0 30px rgba(52, 211, 153, 0.4),
    0 2px 4px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Open Button */
.zs-server-url__open-btn {
  font-family: var(--zs-font-body);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: #0a0d14;
  background: linear-gradient(135deg, #34d399 0%, #10b981 50%, #059669 100%);
  padding: 14px 24px;
  border-radius: 8px;
  white-space: nowrap;
  transition: all 0.3s ease;
  box-shadow: 
    0 4px 15px rgba(16, 185, 129, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.zs-server-url:hover .zs-server-url__open-btn {
  transform: translateX(4px);
  box-shadow: 
    0 6px 25px rgba(16, 185, 129, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
  background: linear-gradient(135deg, #2dd4bf 0%, #34d399 50%, #10b981 100%);
}

/* Hidden utility class */
.zs-hidden {
  display: none !important;
}
```

**Verify command**: `node -e "const fs = require('fs'); const css = fs.readFileSync('z-server/styles.css', 'utf8'); console.log(css.includes('.zs-server-url') ? 'CSS FOUND' : 'CSS MISSING')"`

### Step 2: Rebuild the z-server client bundle

**Type**: COMMAND
**Command**: `cd z-server && npm run build`
**Working directory**: `z-server`
**Expected output contains**: `esbuild` or no error output
**Expected exit code**: 0
**Timeout**: 30

### Step 3: Verify CSS file contains the new styles

**Type**: VERIFY
**Check**: styles.css contains `.zs-server-url` class
**Command**: `node -e "const fs = require('fs'); const css = fs.readFileSync('z-server/styles.css', 'utf8'); const hasClass = css.includes('.zs-server-url__svg'); const hasAnim = css.includes('@keyframes zs-inner-breathe'); console.log('SVG class:', hasClass, '| Animation:', hasAnim); if (!hasClass || !hasAnim) process.exit(1);"`
**Success pattern**: `SVG class: true | Animation: true`
**Failure pattern**: `false`

## Completion Criteria
- [ ] `z-server/styles.css` contains `.zs-server-url` class and child classes
- [ ] `z-server/styles.css` contains all 5 keyframe animations
- [ ] `npm run build` completes without errors
- [ ] Verification command shows both SVG class and Animation as `true`

## Rollback
1. Revert `z-server/styles.css` to previous version: `git checkout z-server/styles.css`

## Error Escalation
STOP and report if:
- styles.css cannot be found
- Build command fails
- Verification shows missing classes or animations

## Notes for Robot Agent
- The CSS block is ~200 lines
- It must be inserted AFTER the last existing rule in styles.css
- The CSS includes 5 `@keyframes` animations that are critical for the pulsating effect
- After this fix, starting a server in z-server should show a large animated green circle with the URL
