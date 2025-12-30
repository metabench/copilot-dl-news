#!/usr/bin/env node
/**
 * svg-overflow.js — Detect text/content overflow issues in SVG diagrams
 * 
 * Unlike svg-collisions (which finds overlapping elements), this tool focuses on:
 * 1. Text extending beyond its parent container bounds
 * 2. Content groups that overflow their panel/rect boundaries  
 * 3. Missing padding/margins between text and container edges
 * 
 * Usage:
 *   node tools/dev/svg-overflow.js <file.svg>
 *   node tools/dev/svg-overflow.js <file.svg> --fix --dry-run
 *   node tools/dev/svg-overflow.js <file.svg> --json
 *   node tools/dev/svg-overflow.js <file.svg> --min-padding 10
 * 
 * Puppeteer Mode (accurate rendered measurements):
 *   node tools/dev/svg-overflow.js <file.svg> --puppeteer
 *   node tools/dev/svg-overflow.js <file.svg> --puppeteer --container "Server Detection Logic"
 *   node tools/dev/svg-overflow.js <file.svg> --puppeteer --all-containers --json
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
  // Font metrics (approximate px per character for common fonts)
  fontMetrics: {
    'Consolas': { widthRatio: 0.6, defaultSize: 10 },
    'Monaco': { widthRatio: 0.6, defaultSize: 10 },
    'monospace': { widthRatio: 0.6, defaultSize: 10 },
    'Arial': { widthRatio: 0.52, defaultSize: 11 },
    'Helvetica': { widthRatio: 0.52, defaultSize: 11 },
    'sans-serif': { widthRatio: 0.52, defaultSize: 11 },
    'Georgia': { widthRatio: 0.55, defaultSize: 14 },
    'serif': { widthRatio: 0.55, defaultSize: 12 },
    'default': { widthRatio: 0.55, defaultSize: 12 }
  },
  
  // Minimum acceptable padding between text and container edge
  minPadding: 5,
  
  // Classes that indicate monospace font
  monoClasses: ['panel-mono', 'panel-mono-sm', 'code', 'code-light', 'small'],
  
  // Classes that indicate larger/title fonts
  titleClasses: ['title', 'section-title', 'panel-title', 'label-gold'],
};

// ═══════════════════════════════════════════════════════════════════════════
// Text Width Estimation
// ═══════════════════════════════════════════════════════════════════════════

function estimateTextWidth(text, fontSize, fontFamily, config) {
  // Find matching font metrics
  let metrics = config.fontMetrics.default;
  
  if (fontFamily) {
    const familyLower = fontFamily.toLowerCase();
    for (const [font, m] of Object.entries(config.fontMetrics)) {
      if (familyLower.includes(font.toLowerCase())) {
        metrics = m;
        break;
      }
    }
  }
  
  const size = fontSize || metrics.defaultSize;
  const charWidth = size * metrics.widthRatio;
  
  // Adjust for special characters
  let adjustedLength = 0;
  for (const char of text) {
    if (char.match(/[\u{1F300}-\u{1F9FF}]/u)) {
      // Emoji - typically wider
      adjustedLength += 2;
    } else if (char.match(/[A-Z]/)) {
      // Uppercase slightly wider
      adjustedLength += 1.1;
    } else if (char.match(/[mwMW]/)) {
      // Wide characters
      adjustedLength += 1.3;
    } else if (char.match(/[ilIj.,;:!|]/)) {
      // Narrow characters
      adjustedLength += 0.5;
    } else {
      adjustedLength += 1;
    }
  }
  
  return Math.ceil(adjustedLength * charWidth);
}

// ═══════════════════════════════════════════════════════════════════════════
// Transform Parsing
// ═══════════════════════════════════════════════════════════════════════════

function parseTransform(transformAttr) {
  if (!transformAttr) return { x: 0, y: 0 };
  
  let x = 0, y = 0;
  
  // Parse translate(x, y) or translate(x y)
  const translateMatch = transformAttr.match(/translate\(\s*([+-]?[\d.]+)[\s,]+([+-]?[\d.]+)\s*\)/);
  if (translateMatch) {
    x = parseFloat(translateMatch[1]) || 0;
    y = parseFloat(translateMatch[2]) || 0;
  }
  
  // Also check translate(x) with single value
  const translateSingleMatch = transformAttr.match(/translate\(\s*([+-]?[\d.]+)\s*\)/);
  if (translateSingleMatch && !translateMatch) {
    x = parseFloat(translateSingleMatch[1]) || 0;
  }
  
  return { x, y };
}

function getAbsolutePosition(element, document) {
  let x = parseFloat(element.getAttribute('x')) || 0;
  let y = parseFloat(element.getAttribute('y')) || 0;
  
  // Walk up the tree accumulating transforms
  let current = element.parentElement;
  while (current && current !== document.documentElement) {
    const transform = current.getAttribute('transform');
    if (transform) {
      const { x: tx, y: ty } = parseTransform(transform);
      x += tx;
      y += ty;
    }
    
    // Also check for x/y on parent groups (less common but possible)
    const parentX = parseFloat(current.getAttribute('x')) || 0;
    const parentY = parseFloat(current.getAttribute('y')) || 0;
    x += parentX;
    y += parentY;
    
    current = current.parentElement;
  }
  
  return { x, y };
}

// ═══════════════════════════════════════════════════════════════════════════
// Container Detection
// ═══════════════════════════════════════════════════════════════════════════

function findNearestContainer(element, document) {
  // Strategy: The text's container is typically a sibling rect in the same group,
  // or a rect in an ancestor group that encompasses the text's local position.
  // Priority: 1) sibling rect, 2) smallest ancestor rect that contains the text
  
  let textLocalX = parseFloat(element.getAttribute('x')) || 0;
  let textLocalY = parseFloat(element.getAttribute('y')) || 0;
  
  // First, check for sibling rect in the same parent group
  const parent = element.parentElement;
  if (parent) {
    const siblingRects = Array.from(parent.children).filter(el => el.tagName === 'rect');
    for (const rect of siblingRects) {
      const rectX = parseFloat(rect.getAttribute('x')) || 0;
      const rectY = parseFloat(rect.getAttribute('y')) || 0;
      const width = parseFloat(rect.getAttribute('width')) || 0;
      const height = parseFloat(rect.getAttribute('height')) || 0;
      
      // Skip tiny rects
      if (width < 50 || height < 15) continue;
      
      // Text should be reasonably inside this rect
      if (textLocalX >= rectX - 10 && textLocalX < rectX + width + 20 &&
          textLocalY >= rectY - 10 && textLocalY < rectY + height + 10) {
        return {
          element: rect,
          localX: rectX,
          localY: rectY,
          width,
          height,
          groupTransform: parseTransform(parent.getAttribute('transform')),
          group: parent,
          textRelativeX: textLocalX - rectX,
          textRelativeY: textLocalY - rectY,
          accumulatedY: 0 // Sibling rect, no accumulated transform
        };
      }
    }
  }
  
  // If no sibling rect, look for ancestor containers
  // Walk up accumulating transforms and check each group's rect children
  // Return on first match (closest ancestor)
  let current = parent ? parent.parentElement : null;
  let accumulatedX = parseTransform(parent?.getAttribute('transform')).x;
  let accumulatedY = parseTransform(parent?.getAttribute('transform')).y;
  
  while (current && current !== document.documentElement) {
    const transform = parseTransform(current.getAttribute('transform'));
    accumulatedX += transform.x;
    accumulatedY += transform.y;
    
    const rects = Array.from(current.children).filter(el => el.tagName === 'rect');
    
    for (const rect of rects) {
      const rectX = parseFloat(rect.getAttribute('x')) || 0;
      const rectY = parseFloat(rect.getAttribute('y')) || 0;
      const width = parseFloat(rect.getAttribute('width')) || 0;
      const height = parseFloat(rect.getAttribute('height')) || 0;
      
      if (width < 50 || height < 15) continue;
      
      // Text absolute position relative to this group
      const textAbsInGroup = textLocalX + accumulatedX - transform.x;
      const textAbsInGroupY = textLocalY + accumulatedY - transform.y;
      
      // Check if the rect could reasonably contain this text
      // Use proportional margins based on container size to catch overflows
      // Allow text up to 50% beyond container edge (catches significant overflow)
      const marginX = Math.max(50, width * 0.5);
      const marginY = Math.max(50, height * 0.5);
      if (textAbsInGroup >= rectX - marginX && textAbsInGroup < rectX + width + marginX &&
          textAbsInGroupY >= rectY - marginY && textAbsInGroupY < rectY + height + marginY) {
        // First matching ancestor is the closest - return immediately
        return {
          element: rect,
          localX: rectX,
          localY: rectY,
          width,
          height,
          groupTransform: { x: accumulatedX, y: accumulatedY },
          group: current,
          textRelativeX: textAbsInGroup - rectX,
          textRelativeY: textAbsInGroupY - rectY,
          accumulatedY
        };
      }
    }
    
    current = current.parentElement;
  }
  
  // No ancestor container found
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Style Extraction
// ═══════════════════════════════════════════════════════════════════════════

function extractFontInfo(element, styleRules, config) {
  let fontSize = null;
  let fontFamily = null;
  
  // Check inline style
  const style = element.getAttribute('style') || '';
  const fontSizeMatch = style.match(/font-size:\s*([\d.]+)/);
  if (fontSizeMatch) fontSize = parseFloat(fontSizeMatch[1]);
  
  const fontFamilyMatch = style.match(/font-family:\s*([^;]+)/);
  if (fontFamilyMatch) fontFamily = fontFamilyMatch[1].trim();
  
  // Check direct attributes
  if (!fontSize && element.getAttribute('font-size')) {
    fontSize = parseFloat(element.getAttribute('font-size'));
  }
  if (!fontFamily && element.getAttribute('font-family')) {
    fontFamily = element.getAttribute('font-family');
  }
  
  // Check class
  const className = element.getAttribute('class') || '';
  const classes = className.split(/\s+/);
  
  // Look up class in style rules
  for (const cls of classes) {
    if (styleRules[`.${cls}`]) {
      const rule = styleRules[`.${cls}`];
      if (!fontSize && rule.fontSize) fontSize = rule.fontSize;
      if (!fontFamily && rule.fontFamily) fontFamily = rule.fontFamily;
    }
    
    // Detect mono from class name
    if (config.monoClasses.includes(cls) && !fontFamily) {
      fontFamily = 'monospace';
    }
    
    // Detect title fonts
    if (config.titleClasses.includes(cls) && !fontSize) {
      fontSize = 14; // Title fonts are typically larger
    }
  }
  
  return { fontSize, fontFamily };
}

function parseStyleElement(styleContent) {
  const rules = {};
  
  // Simple CSS parser for common properties
  const ruleMatches = styleContent.matchAll(/([.#]?[\w-]+)\s*\{([^}]+)\}/g);
  
  for (const match of ruleMatches) {
    const selector = match[1];
    const declarations = match[2];
    
    const rule = {};
    
    const fontSizeMatch = declarations.match(/font-size:\s*([\d.]+)/);
    if (fontSizeMatch) rule.fontSize = parseFloat(fontSizeMatch[1]);
    
    const fontFamilyMatch = declarations.match(/font-family:\s*([^;]+)/);
    if (fontFamilyMatch) rule.fontFamily = fontFamilyMatch[1].trim().replace(/['"]/g, '');
    
    rules[selector] = rule;
  }
  
  return rules;
}

// ═══════════════════════════════════════════════════════════════════════════
// Issue Detection
// ═══════════════════════════════════════════════════════════════════════════

function detectOverflows(svgContent, config) {
  const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
  const document = dom.window.document;
  const svg = document.documentElement;
  
  // Parse embedded styles
  const styleEl = svg.querySelector('style');
  const styleRules = styleEl ? parseStyleElement(styleEl.textContent) : {};
  
  const issues = [];
  
  // Find all text elements
  const textElements = svg.querySelectorAll('text');
  
  for (const textEl of textElements) {
    const text = textEl.textContent.trim();
    if (!text || text.length < 10) continue; // Skip short text
    
    // Get font info
    const { fontSize, fontFamily } = extractFontInfo(textEl, styleRules, config);
    const effectiveFontSize = fontSize || 12; // Default font size
    
    // Estimate text dimensions
    const estimatedWidth = estimateTextWidth(text, fontSize, fontFamily, config);
    const estimatedHeight = effectiveFontSize; // Text height ≈ font size
    
    // Get text position
    const textX = parseFloat(textEl.getAttribute('x')) || 0;
    const textY = parseFloat(textEl.getAttribute('y')) || 0;
    const hasExplicitX = textEl.hasAttribute('x');
    const textAnchor = textEl.getAttribute('text-anchor') || 'start';
    
    // Calculate text horizontal bounds based on anchor
    let textLeft, textRight;
    if (textAnchor === 'middle') {
      textLeft = textX - estimatedWidth / 2;
      textRight = textX + estimatedWidth / 2;
    } else if (textAnchor === 'end') {
      textLeft = textX - estimatedWidth;
      textRight = textX;
    } else { // start
      textLeft = textX;
      textRight = textX + estimatedWidth;
    }
    
    // Calculate text vertical bounds (y is baseline, text extends above)
    // Approximate: text top is y - 0.8*fontSize, text bottom is y + 0.2*fontSize
    const textTop = textY - effectiveFontSize * 0.8;
    const textBottom = textY + effectiveFontSize * 0.2;
    
    // Find container
    const container = findNearestContainer(textEl, document);
    
    if (container) {
      // Check if this is a "real" container relationship:
      // Either the text has an explicit x (positioned), or the container rect is a sibling
      const isSiblingContainer = textEl.parentElement === container.group;
      
      // Skip text that has no explicit x and isn't a sibling of its container
      // These are typically timeline labels, icon labels, etc. that aren't meant to be contained
      if (!hasExplicitX && !isSiblingContainer && textAnchor === 'middle') {
        continue; // Skip - this is likely a label floating near a shape, not inside a container
      }
      
      // Horizontal bounds
      const containerLeft = container.localX;
      const containerRight = container.localX + container.width;
      
      // Vertical bounds - use textRelativeY from container detection
      // textRelativeY is the text's Y position relative to the container's rect origin
      // For text at y=10 in a container with rect y=5, textRelativeY = 5
      const textRelY = container.textRelativeY ?? 0;
      
      // Text vertical extent (baseline model: baseline is near bottom, ascenders above)
      const textTopRelative = textRelY - effectiveFontSize * 0.8; // ascenders
      const textBottomRelative = textRelY + effectiveFontSize * 0.2; // descenders
      
      // Filter: Skip panel titles that intentionally sit at the top edge
      // These are designed to overlap the panel header area (textRelY is small negative or very small positive)
      const className = textEl.getAttribute('class') || '';
      const isPanelTitle = className.includes('panel-title') || className.includes('title');
      const skipTopOverflow = isPanelTitle && textRelY < effectiveFontSize * 1.5;
      
      // Check for horizontal overflow
      const leftOverflow = containerLeft - textLeft;
      const rightOverflow = textRight - containerRight;
      
      // Check for vertical overflow (relative to container 0..height)
      const topOverflow = 0 - textTopRelative;  // How much text extends above container
      const bottomOverflow = textBottomRelative - container.height;  // How much extends below
      
      // Check padding
      const leftPadding = textLeft - containerLeft;
      const rightPadding = containerRight - textRight;
      
      // Report issues (priority: overflow > padding)
      if (bottomOverflow > 2) {
        issues.push({
          type: 'text-overflow-bottom',
          severity: 'high',
          element: 'text',
          text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
          textY: textRelY,
          containerHeight: container.height,
          overflow: Math.round(bottomOverflow),
          suggestion: `Text extends ${Math.ceil(bottomOverflow)}px below container. Move up or increase container height.`,
          location: getElementPath(textEl)
        });
      } else if (!skipTopOverflow && topOverflow > 2) {
        // Skip top overflow for panel titles positioned at top (intentional design pattern)
        issues.push({
          type: 'text-overflow-top',
          severity: 'high',
          element: 'text',
          text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
          textY: textRelY,
          overflow: Math.round(topOverflow),
          suggestion: `Text extends ${Math.ceil(topOverflow)}px above container. Move down or increase container height.`,
          location: getElementPath(textEl)
        });
      } else if (rightOverflow > 0) {
        issues.push({
          type: 'text-overflow-right',
          severity: 'high',
          element: 'text',
          text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
          textX,
          textAnchor,
          estimatedWidth,
          containerWidth: container.width,
          overflow: Math.round(rightOverflow),
          suggestion: `Shorten text by ${Math.ceil(rightOverflow / (effectiveFontSize * 0.5))} chars or widen container by ${Math.ceil(rightOverflow)}px`,
          location: getElementPath(textEl)
        });
      } else if (leftOverflow > 0) {
        issues.push({
          type: 'text-overflow-left',
          severity: 'high',
          element: 'text',
          text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
          textX,
          textAnchor,
          overflow: Math.round(leftOverflow),
          suggestion: `Move text right by ${Math.ceil(leftOverflow)}px`,
          location: getElementPath(textEl)
        });
      } else if (rightPadding < config.minPadding && rightPadding >= 0) {
        issues.push({
          type: 'insufficient-right-padding',
          severity: 'medium',
          element: 'text',
          text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
          currentPadding: Math.round(rightPadding),
          minPadding: config.minPadding,
          suggestion: `Increase right padding by ${config.minPadding - Math.round(rightPadding)}px`,
          location: getElementPath(textEl)
        });
      } else if (leftPadding < config.minPadding && leftPadding >= 0) {
        issues.push({
          type: 'insufficient-left-padding',
          severity: 'medium',
          element: 'text',
          text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
          currentPadding: Math.round(leftPadding),
          minPadding: config.minPadding,
          suggestion: `Increase left padding by ${config.minPadding - Math.round(leftPadding)}px`,
          location: getElementPath(textEl)
        });
      }
    }
  }
  
  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  
  return issues;
}

function getElementPath(element) {
  const parts = [];
  let current = element;
  
  while (current && current.tagName) {
    let identifier = current.tagName;
    if (current.id) {
      identifier += `#${current.id}`;
    } else if (current.getAttribute('class')) {
      identifier += `.${current.getAttribute('class').split(' ')[0]}`;
    }
    parts.unshift(identifier);
    current = current.parentElement;
  }
  
  return parts.slice(-3).join(' > '); // Last 3 levels
}

// ═══════════════════════════════════════════════════════════════════════════
// Output Formatting
// ═══════════════════════════════════════════════════════════════════════════

function formatOutput(issues, filePath, jsonMode) {
  if (jsonMode) {
    return JSON.stringify({
      file: path.basename(filePath),
      issueCount: issues.length,
      highCount: issues.filter(i => i.severity === 'high').length,
      mediumCount: issues.filter(i => i.severity === 'medium').length,
      issues
    }, null, 2);
  }
  
  const lines = [];
  const fileName = path.basename(filePath);
  
  lines.push('');
  lines.push('═'.repeat(70));
  lines.push(`SVG Overflow Analysis: ${fileName}`);
  lines.push('═'.repeat(70));
  lines.push('');
  
  const highCount = issues.filter(i => i.severity === 'high').length;
  const mediumCount = issues.filter(i => i.severity === 'medium').length;
  
  if (issues.length === 0) {
    lines.push('✅ No overflow issues detected!');
  } else {
    lines.push(`⚠️  Found ${issues.length} issue(s):`);
    lines.push(`   🔴 High: ${highCount}  🟠 Medium: ${mediumCount}`);
    lines.push('');
    lines.push('─'.repeat(70));
    lines.push('');
    
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      const icon = issue.severity === 'high' ? '🔴' : '🟠';
      
      lines.push(`${icon} #${i + 1} [${issue.type}]`);
      lines.push(`   Text: "${issue.text}"`);
      
      if (issue.overflow) {
        lines.push(`   Overflow: ${issue.overflow}px beyond container`);
      }
      if (issue.currentPadding !== undefined) {
        lines.push(`   Padding: ${issue.currentPadding}px (min: ${issue.minPadding}px)`);
      }
      if (issue.estimatedWidth) {
        lines.push(`   Est. width: ${issue.estimatedWidth}px | Container: ${issue.containerWidth}px`);
      }
      
      lines.push(`   💡 ${issue.suggestion}`);
      lines.push(`   📍 ${issue.location}`);
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Puppeteer-based Accurate Measurement
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Use Puppeteer to get actual rendered bounding boxes for accurate overflow detection.
 * This is more reliable than font-width estimation for complex layouts.
 */
async function analyzeSvgWithPuppeteer(svgPath, options = {}) {
  const puppeteer = require('puppeteer');
  const absolutePath = path.resolve(svgPath);
  const svgContent = fs.readFileSync(absolutePath, 'utf8');
  
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // Create an HTML page with the SVG embedded
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { margin: 0; padding: 20px; background: white; }
          svg { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
      </html>
    `;
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Extract container info and check for overflows
    const results = await page.evaluate((containerName, listContainers, minPadding) => {
      const svg = document.querySelector('svg');
      if (!svg) return { error: 'No SVG found', containers: [], issues: [] };
      
      // Helper to get screen-space bounding box
      function getScreenBBox(el) {
        if (typeof el.getBBox !== 'function') return null;
        try {
          const b = el.getBBox();
          const ctm = el.getScreenCTM();
          if (!ctm || b.width <= 0 || b.height <= 0) return null;
          
          const ownerSvg = el.ownerSVGElement || el;
          const pt1 = ownerSvg.createSVGPoint();
          const pt2 = ownerSvg.createSVGPoint();
          pt1.x = b.x; pt1.y = b.y;
          pt2.x = b.x + b.width; pt2.y = b.y + b.height;
          
          const s1 = pt1.matrixTransform(ctm);
          const s2 = pt2.matrixTransform(ctm);
          
          return {
            x: Math.min(s1.x, s2.x),
            y: Math.min(s1.y, s2.y),
            width: Math.abs(s2.x - s1.x),
            height: Math.abs(s2.y - s1.y),
            right: Math.max(s1.x, s2.x),
            bottom: Math.max(s1.y, s2.y)
          };
        } catch (e) {
          return null;
        }
      }
      
      // Find labeled containers (groups with a title text child or comment)
      function findLabeledContainers() {
        const containers = [];
        const groups = svg.querySelectorAll('g');
        
        for (const g of groups) {
          // Look for a rect that defines the container bounds
          const rect = g.querySelector(':scope > rect');
          if (!rect) continue;
          
          const rectBBox = getScreenBBox(rect);
          if (!rectBBox || rectBBox.width < 50 || rectBBox.height < 30) continue;
          
          // Find a label: first text child, or preceding comment
          let label = null;
          const firstText = g.querySelector(':scope > text');
          if (firstText) {
            label = firstText.textContent.trim();
          }
          
          // Also check for id
          if (g.id) {
            label = label || g.id;
          }
          
          // Check preceding comment
          let prev = g.previousSibling;
          while (prev && prev.nodeType === 3) prev = prev.previousSibling; // skip whitespace
          if (prev && prev.nodeType === 8) { // comment node
            label = label || prev.textContent.trim();
          }
          
          if (label) {
            containers.push({
              label,
              groupId: g.id || null,
              rect: rectBBox,
              element: g
            });
          }
        }
        
        return containers;
      }
      
      // Check a container for text overflows
      function checkContainerOverflows(containerInfo, minPad) {
        const { label, rect, element: g } = containerInfo;
        const issues = [];
        
        // Find all text elements within this group
        const texts = g.querySelectorAll('text');
        
        for (const text of texts) {
          const content = text.textContent.trim();
          if (content.length < 5) continue;
          
          const textBBox = getScreenBBox(text);
          if (!textBBox) continue;
          
          // Check overflow
          const leftOverflow = rect.x - textBBox.x;
          const rightOverflow = textBBox.right - rect.right;
          const topOverflow = rect.y - textBBox.y;
          const bottomOverflow = textBBox.bottom - rect.bottom;
          
          // Check padding
          const leftPadding = textBBox.x - rect.x;
          const rightPadding = rect.right - textBBox.right;
          
          if (rightOverflow > 2) {
            issues.push({
              type: 'text-overflow-right',
              severity: 'high',
              container: label,
              text: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
              overflow: Math.round(rightOverflow),
              containerWidth: Math.round(rect.width),
              textWidth: Math.round(textBBox.width),
              suggestion: `Text extends ${Math.round(rightOverflow)}px beyond right edge`
            });
          } else if (leftOverflow > 2) {
            issues.push({
              type: 'text-overflow-left',
              severity: 'high',
              container: label,
              text: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
              overflow: Math.round(leftOverflow),
              suggestion: `Text extends ${Math.round(leftOverflow)}px beyond left edge`
            });
          } else if (bottomOverflow > 2) {
            issues.push({
              type: 'text-overflow-bottom',
              severity: 'high',
              container: label,
              text: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
              overflow: Math.round(bottomOverflow),
              suggestion: `Text extends ${Math.round(bottomOverflow)}px below container`
            });
          } else if (rightPadding >= 0 && rightPadding < minPad) {
            issues.push({
              type: 'insufficient-right-padding',
              severity: 'medium',
              container: label,
              text: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
              currentPadding: Math.round(rightPadding),
              minPadding: minPad,
              suggestion: `Only ${Math.round(rightPadding)}px right padding (min: ${minPad}px)`
            });
          }
        }
        
        return issues;
      }
      
      // Main logic
      const allContainers = findLabeledContainers();
      
      if (listContainers) {
        // Just list all found containers
        return {
          containers: allContainers.map(c => ({
            label: c.label,
            id: c.groupId,
            width: Math.round(c.rect.width),
            height: Math.round(c.rect.height),
            textCount: c.element.querySelectorAll('text').length
          })),
          issues: []
        };
      }
      
      // Filter to specific container if requested
      let targetContainers = allContainers;
      if (containerName) {
        const lowerName = containerName.toLowerCase();
        targetContainers = allContainers.filter(c => 
          c.label.toLowerCase().includes(lowerName) ||
          (c.groupId && c.groupId.toLowerCase().includes(lowerName))
        );
      }
      
      // Check each container for overflows
      const allIssues = [];
      for (const container of targetContainers) {
        const issues = checkContainerOverflows(container, minPadding);
        allIssues.push(...issues);
      }
      
      return {
        containers: targetContainers.map(c => ({
          label: c.label,
          id: c.groupId,
          width: Math.round(c.rect.width),
          height: Math.round(c.rect.height),
          textCount: c.element.querySelectorAll('text').length
        })),
        issues: allIssues
      };
      
    }, options.container, options.listContainers, options.minPadding || 5);
    
    await browser.close();
    return results;
    
  } catch (err) {
    await browser.close();
    throw err;
  }
}

function formatPuppeteerOutput(results, filePath, jsonMode) {
  if (jsonMode) {
    return JSON.stringify({
      file: path.basename(filePath),
      mode: 'puppeteer',
      ...results,
      highCount: results.issues.filter(i => i.severity === 'high').length,
      mediumCount: results.issues.filter(i => i.severity === 'medium').length
    }, null, 2);
  }
  
  const lines = [];
  const fileName = path.basename(filePath);
  
  lines.push('');
  lines.push('═'.repeat(70));
  lines.push(`SVG Overflow Analysis (Puppeteer): ${fileName}`);
  lines.push('═'.repeat(70));
  lines.push('');
  
  // Show containers checked
  if (results.containers.length > 0) {
    lines.push(`📦 Containers analyzed: ${results.containers.length}`);
    for (const c of results.containers) {
      lines.push(`   • ${c.label} (${c.width}×${c.height}px, ${c.textCount} texts)`);
    }
    lines.push('');
  }
  
  const highCount = results.issues.filter(i => i.severity === 'high').length;
  const mediumCount = results.issues.filter(i => i.severity === 'medium').length;
  
  if (results.issues.length === 0) {
    lines.push('✅ No overflow issues detected!');
  } else {
    lines.push(`⚠️  Found ${results.issues.length} issue(s):`);
    lines.push(`   🔴 High: ${highCount}  🟠 Medium: ${mediumCount}`);
    lines.push('');
    lines.push('─'.repeat(70));
    lines.push('');
    
    for (let i = 0; i < results.issues.length; i++) {
      const issue = results.issues[i];
      const icon = issue.severity === 'high' ? '🔴' : '🟠';
      
      lines.push(`${icon} #${i + 1} [${issue.type}]`);
      lines.push(`   Container: ${issue.container}`);
      lines.push(`   Text: "${issue.text}"`);
      
      if (issue.overflow) {
        lines.push(`   Overflow: ${issue.overflow}px`);
      }
      if (issue.containerWidth) {
        lines.push(`   Container width: ${issue.containerWidth}px | Text width: ${issue.textWidth}px`);
      }
      if (issue.currentPadding !== undefined) {
        lines.push(`   Padding: ${issue.currentPadding}px (min: ${issue.minPadding}px)`);
      }
      
      lines.push(`   💡 ${issue.suggestion}`);
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

function parseArgs(args) {
  const options = {
    file: null,
    json: false,
    minPadding: DEFAULT_CONFIG.minPadding,
    help: false,
    puppeteer: false,
    container: null,
    listContainers: false,
    allContainers: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json' || arg === '-j') {
      options.json = true;
    } else if (arg === '--min-padding') {
      options.minPadding = parseInt(args[++i], 10) || DEFAULT_CONFIG.minPadding;
    } else if (arg === '--puppeteer' || arg === '-p') {
      options.puppeteer = true;
    } else if (arg === '--container' || arg === '-c') {
      options.container = args[++i];
      options.puppeteer = true; // --container implies --puppeteer
    } else if (arg === '--list-containers') {
      options.listContainers = true;
      options.puppeteer = true;
    } else if (arg === '--all-containers') {
      options.allContainers = true;
      options.puppeteer = true;
    } else if (!arg.startsWith('-') && !options.file) {
      options.file = arg;
    }
  }
  
  return options;
}

function showHelp() {
  console.log(`
svg-overflow — Detect text/content overflow issues in SVG diagrams

Usage:
  node tools/dev/svg-overflow.js <file.svg> [options]

Options:
  --json, -j              Output as JSON
  --min-padding <n>       Minimum padding required (default: 5px)
  --help, -h              Show this help

Puppeteer Mode (accurate rendered measurements):
  --puppeteer, -p         Use Puppeteer for accurate bounding boxes
  --container <name>, -c  Check specific named container (implies --puppeteer)
  --all-containers        Check all labeled containers
  --list-containers       List all detected containers

What it detects:
  🔴 HIGH: Text extending beyond container bounds
  🟠 MEDIUM: Insufficient padding between text and container edge

Examples:
  # Basic estimation mode
  node tools/dev/svg-overflow.js diagram.svg
  node tools/dev/svg-overflow.js diagram.svg --json
  node tools/dev/svg-overflow.js diagram.svg --min-padding 10

  # Puppeteer mode (accurate rendered measurements)
  node tools/dev/svg-overflow.js diagram.svg --puppeteer
  node tools/dev/svg-overflow.js diagram.svg --container "Server Detection Logic"
  node tools/dev/svg-overflow.js diagram.svg --list-containers
  node tools/dev/svg-overflow.js diagram.svg --all-containers --json
`);
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  if (!options.file) {
    console.error('Error: No SVG file specified');
    console.error('Usage: node tools/dev/svg-overflow.js <file.svg>');
    process.exit(2);
  }
  
  if (!fs.existsSync(options.file)) {
    console.error(`Error: File not found: ${options.file}`);
    process.exit(2);
  }
  
  // Use Puppeteer mode if requested
  if (options.puppeteer) {
    const results = await analyzeSvgWithPuppeteer(options.file, {
      container: options.container,
      listContainers: options.listContainers,
      minPadding: options.minPadding
    });
    
    if (results.error) {
      console.error(`Error: ${results.error}`);
      process.exit(2);
    }
    
    const output = formatPuppeteerOutput(results, options.file, options.json);
    console.log(output);
    
    const hasHigh = results.issues.some(i => i.severity === 'high');
    process.exit(hasHigh ? 1 : 0);
  }
  
  // Default: estimation mode
  const config = {
    ...DEFAULT_CONFIG,
    minPadding: options.minPadding
  };
  
  const svgContent = fs.readFileSync(options.file, 'utf8');
  const issues = detectOverflows(svgContent, config);
  
  const output = formatOutput(issues, options.file, options.json);
  console.log(output);
  
  // Exit code based on severity
  const hasHigh = issues.some(i => i.severity === 'high');
  process.exit(hasHigh ? 1 : 0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(2);
});
