#!/usr/bin/env node
/**
 * svg-contrast.js — SVG Color Contrast Analyzer & Fixer
 * 
 * Detects text-on-background color combinations that fail WCAG contrast requirements.
 * Can suggest fixes and optionally auto-fix by adjusting text colors.
 * 
 * Usage:
 *   node tools/dev/svg-contrast.js <file.svg>           # Analyze contrasts
 *   node tools/dev/svg-contrast.js <file.svg> --fix     # Auto-fix failures
 *   node tools/dev/svg-contrast.js <file.svg> --json    # JSON output
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// ═══════════════════════════════════════════════════════════════════════════
// Color Utilities
// ═══════════════════════════════════════════════════════════════════════════

const NAMED_COLORS = {
  white: '#ffffff', black: '#000000', red: '#ff0000', green: '#00ff00',
  blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff', magenta: '#ff00ff',
  gray: '#808080', grey: '#808080', silver: '#c0c0c0', maroon: '#800000',
  olive: '#808000', lime: '#00ff00', aqua: '#00ffff', teal: '#008080',
  navy: '#000080', fuchsia: '#ff00ff', purple: '#800080', orange: '#ffa500'
};

function parseColor(colorStr) {
  if (!colorStr || colorStr === 'none' || colorStr.startsWith('url(')) return null;
  colorStr = colorStr.trim().toLowerCase();
  
  if (NAMED_COLORS[colorStr]) colorStr = NAMED_COLORS[colorStr];
  
  // Hex color
  if (colorStr.startsWith('#')) {
    if (colorStr.length === 4) {
      colorStr = '#' + colorStr[1] + colorStr[1] + colorStr[2] + colorStr[2] + colorStr[3] + colorStr[3];
    }
    if (colorStr.length === 7) {
      return {
        r: parseInt(colorStr.slice(1, 3), 16),
        g: parseInt(colorStr.slice(3, 5), 16),
        b: parseInt(colorStr.slice(5, 7), 16),
        hex: colorStr
      };
    }
  }
  
  // RGB color
  const rgbMatch = colorStr.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    return { r, g, b, hex: rgbToHex(r, g, b) };
  }
  
  return null;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function relativeLuminance(rgb) {
  const sRGB = [rgb.r, rgb.g, rgb.b].map(v => {
    v = v / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

function contrastRatio(c1, c2) {
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function wcagLevel(ratio) {
  if (ratio >= 7) return { level: 'AAA', pass: true, icon: '✓✓✓' };
  if (ratio >= 4.5) return { level: 'AA', pass: true, icon: '✓✓' };
  if (ratio >= 3) return { level: 'AA-large', pass: true, icon: '✓' };
  return { level: 'FAIL', pass: false, icon: '✗' };
}

// Generate a darker version of a color for better contrast on light backgrounds
function darkenColor(rgb, factor = 0.3) {
  return {
    r: Math.round(rgb.r * factor),
    g: Math.round(rgb.g * factor),
    b: Math.round(rgb.b * factor),
    hex: rgbToHex(Math.round(rgb.r * factor), Math.round(rgb.g * factor), Math.round(rgb.b * factor))
  };
}

// Generate a lighter version for dark backgrounds
function lightenColor(rgb, factor = 0.7) {
  return {
    r: Math.round(rgb.r + (255 - rgb.r) * factor),
    g: Math.round(rgb.g + (255 - rgb.g) * factor),
    b: Math.round(rgb.b + (255 - rgb.b) * factor),
    hex: rgbToHex(
      Math.round(rgb.r + (255 - rgb.r) * factor),
      Math.round(rgb.g + (255 - rgb.g) * factor),
      Math.round(rgb.b + (255 - rgb.b) * factor)
    )
  };
}

// Find the best contrasting color (dark or light variant)
function findBestContrast(bgColor, originalTextColor) {
  const bgLum = relativeLuminance(bgColor);
  
  // Try dark variant first (for light/mid backgrounds)
  const dark = darkenColor(originalTextColor, 0.25);
  const darkRatio = contrastRatio(bgColor, dark);
  
  // Try light variant (for dark backgrounds)
  const light = lightenColor(originalTextColor, 0.8);
  const lightRatio = contrastRatio(bgColor, light);
  
  // Try black and white
  const black = { r: 0, g: 0, b: 0, hex: '#000000' };
  const white = { r: 255, g: 255, b: 255, hex: '#ffffff' };
  const blackRatio = contrastRatio(bgColor, black);
  const whiteRatio = contrastRatio(bgColor, white);
  
  // Choose best option that passes AA (4.5:1)
  const options = [
    { color: dark, ratio: darkRatio, name: 'dark variant' },
    { color: light, ratio: lightRatio, name: 'light variant' },
    { color: black, ratio: blackRatio, name: 'black' },
    { color: white, ratio: whiteRatio, name: 'white' }
  ].filter(o => o.ratio >= 4.5);
  
  if (options.length === 0) {
    // Nothing passes AA, return best option
    return blackRatio > whiteRatio 
      ? { color: black, ratio: blackRatio, name: 'black' }
      : { color: white, ratio: whiteRatio, name: 'white' };
  }
  
  // Prefer dark/light variant over black/white for aesthetics
  const variants = options.filter(o => o.name.includes('variant'));
  if (variants.length > 0) {
    return variants.reduce((a, b) => a.ratio > b.ratio ? a : b);
  }
  
  return options.reduce((a, b) => a.ratio > b.ratio ? a : b);
}

// ═══════════════════════════════════════════════════════════════════════════
// SVG Analysis
// ═══════════════════════════════════════════════════════════════════════════

function findNearbyRect(textEl, maxDistance = 50) {
  const textX = parseFloat(textEl.getAttribute('x')) || 0;
  const textY = parseFloat(textEl.getAttribute('y')) || 0;
  
  // Check siblings first
  const parent = textEl.parentElement;
  if (parent) {
    const rects = Array.from(parent.children).filter(el => el.tagName === 'rect');
    for (const rect of rects) {
      const rx = parseFloat(rect.getAttribute('x')) || 0;
      const ry = parseFloat(rect.getAttribute('y')) || 0;
      const rw = parseFloat(rect.getAttribute('width')) || 0;
      const rh = parseFloat(rect.getAttribute('height')) || 0;
      
      // Check if text is inside or very close to rect
      if (textX >= rx - 10 && textX <= rx + rw + 10 &&
          textY >= ry - 5 && textY <= ry + rh + 15) {
        return rect;
      }
    }
  }
  
  return null;
}

function analyzeContrasts(svgContent, options = {}) {
  const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
  const document = dom.window.document;
  const svg = document.documentElement;
  
  const issues = [];
  const goodPairs = [];
  
  // Find all text elements
  const textElements = svg.querySelectorAll('text');
  
  for (const textEl of textElements) {
    const textFill = textEl.getAttribute('fill');
    if (!textFill) continue;
    
    const textColor = parseColor(textFill);
    if (!textColor) continue;
    
    // Find nearby rect that might be the background
    const rect = findNearbyRect(textEl);
    if (!rect) continue;
    
    const rectFill = rect.getAttribute('fill');
    const bgColor = parseColor(rectFill);
    if (!bgColor) continue;
    
    // Calculate contrast
    const ratio = contrastRatio(textColor, bgColor);
    const wcag = wcagLevel(ratio);
    const text = textEl.textContent.trim().substring(0, 40);
    
    const entry = {
      text,
      textColor: textColor.hex,
      bgColor: bgColor.hex,
      ratio: Math.round(ratio * 100) / 100,
      wcag: wcag.level,
      pass: wcag.pass,
      textLuminance: Math.round(relativeLuminance(textColor) * 1000) / 1000,
      bgLuminance: Math.round(relativeLuminance(bgColor) * 1000) / 1000,
      element: textEl,
      rect
    };
    
    if (!wcag.pass || ratio < 4.5) {
      // Find suggested fix
      const suggestion = findBestContrast(bgColor, textColor);
      entry.suggestedColor = suggestion.color.hex;
      entry.suggestedRatio = Math.round(suggestion.ratio * 100) / 100;
      entry.suggestedName = suggestion.name;
      issues.push(entry);
    } else {
      goodPairs.push(entry);
    }
  }
  
  return { issues, goodPairs, dom };
}

function applyFixes(dom, issues) {
  let fixCount = 0;
  
  for (const issue of issues) {
    if (issue.suggestedColor && issue.element) {
      issue.element.setAttribute('fill', issue.suggestedColor);
      fixCount++;
    }
  }
  
  return { fixCount, content: dom.serialize() };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    json: false,
    fix: false,
    dryRun: false,
    minRatio: 4.5,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--json' || arg === '-j') options.json = true;
    else if (arg === '--fix' || arg === '-f') options.fix = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--min-ratio' && args[i + 1]) {
      options.minRatio = parseFloat(args[++i]);
    }
    else if (!arg.startsWith('-') && !options.file) {
      options.file = arg;
    }
  }
  
  return options;
}

function showHelp() {
  console.log(`
svg-contrast — SVG Color Contrast Analyzer & Fixer

Usage:
  node tools/dev/svg-contrast.js <file.svg> [options]

Options:
  --json, -j          Output as JSON
  --fix, -f           Auto-fix contrast failures (changes text fill colors)
  --dry-run           Preview fixes without writing (with --fix)
  --min-ratio <n>     Minimum contrast ratio (default: 4.5 for WCAG AA)
  --help, -h          Show this help

What it detects:
  🔴 FAIL: Contrast ratio < 3:1 (inaccessible)
  🟠 AA-large: 3:1 - 4.5:1 (only for large text 18pt+)
  🟢 AA: 4.5:1 - 7:1 (normal text accessible)
  🟢 AAA: ≥ 7:1 (enhanced accessibility)

Examples:
  node tools/dev/svg-contrast.js diagram.svg
  node tools/dev/svg-contrast.js diagram.svg --json
  node tools/dev/svg-contrast.js diagram.svg --fix --dry-run
  node tools/dev/svg-contrast.js diagram.svg --fix
`);
}

function formatOutput(results, options) {
  const { issues, goodPairs } = results;
  const fileName = path.basename(options.file);
  
  if (options.json) {
    return JSON.stringify({
      file: fileName,
      issueCount: issues.length,
      passCount: goodPairs.length,
      issues: issues.map(i => ({
        text: i.text,
        textColor: i.textColor,
        bgColor: i.bgColor,
        ratio: i.ratio,
        wcag: i.wcag,
        textLuminance: i.textLuminance,
        bgLuminance: i.bgLuminance,
        suggestedColor: i.suggestedColor,
        suggestedRatio: i.suggestedRatio
      })),
      good: goodPairs.map(g => ({
        text: g.text,
        textColor: g.textColor,
        bgColor: g.bgColor,
        ratio: g.ratio,
        wcag: g.wcag
      }))
    }, null, 2);
  }
  
  const lines = [];
  lines.push('');
  lines.push('═'.repeat(70));
  lines.push(`SVG Contrast Analysis: ${fileName}`);
  lines.push('═'.repeat(70));
  
  if (issues.length === 0) {
    lines.push('\n✅ All text-on-background pairs pass WCAG AA contrast requirements!\n');
  } else {
    lines.push(`\n⚠️  Found ${issues.length} contrast issue(s):\n`);
    lines.push('─'.repeat(70));
    
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      lines.push(`\n🔴 #${i + 1} [${issue.wcag}] Ratio: ${issue.ratio}:1`);
      lines.push(`   Text: "${issue.text}"`);
      lines.push(`   Text color: ${issue.textColor} (luminance: ${issue.textLuminance})`);
      lines.push(`   Background: ${issue.bgColor} (luminance: ${issue.bgLuminance})`);
      if (issue.suggestedColor) {
        lines.push(`   💡 Suggested: ${issue.suggestedColor} (${issue.suggestedName}) → ${issue.suggestedRatio}:1`);
      }
    }
    lines.push('');
  }
  
  if (goodPairs.length > 0 && !options.json) {
    lines.push('─'.repeat(70));
    lines.push(`✅ ${goodPairs.length} pair(s) passing WCAG requirements`);
  }
  
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const options = parseArgs();
  
  if (options.help || !options.file) {
    showHelp();
    process.exit(options.help ? 0 : 1);
  }
  
  const filePath = path.resolve(options.file);
  
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${options.file}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const results = analyzeContrasts(content, options);
  
  console.log(formatOutput(results, options));
  
  if (options.fix && results.issues.length > 0) {
    const { fixCount, content: fixedContent } = applyFixes(results.dom, results.issues);
    
    if (options.dryRun) {
      console.log(`\n🔧 Would fix ${fixCount} issue(s) (dry-run mode)\n`);
    } else {
      fs.writeFileSync(filePath, fixedContent);
      console.log(`\n🔧 Fixed ${fixCount} issue(s) - file updated\n`);
    }
  }
  
  process.exit(results.issues.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(2);
});
