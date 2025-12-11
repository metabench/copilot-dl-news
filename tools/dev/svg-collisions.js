#!/usr/bin/env node
"use strict";

/**
 * SVG Collision Detector
 * 
 * Detects PROBLEMATIC overlapping elements in SVG files using Puppeteer.
 * Focuses on actual visual problems - where text is obscured by other text,
 * or where similar-colored overlapping elements reduce readability.
 * 
 * Intentional design patterns that are IGNORED:
 *   - Text on colored background rectangles (label design)
 *   - Text inside container shapes (cards, boxes)
 *   - Lines/arrows passing near text (connectors)
 *   - Elements with very different z-order by document position
 *   - Transparent/semi-transparent overlays
 *   - Small incidental overlaps (< 20% of smaller element)
 * 
 * DETECTED problems:
 *   - Text overlapping other text (unreadable)
 *   - Two opaque shapes significantly overlapping at same z-level
 *   - Text extending outside its visual container
 * 
 * Usage:
 *   node tools/dev/svg-collisions.js <svg-file>
 *   node tools/dev/svg-collisions.js --dir <directory>
 *   node tools/dev/svg-collisions.js <svg-file> --json
 *   node tools/dev/svg-collisions.js <svg-file> --strict  (report more issues)
 *   node tools/dev/svg-collisions.js <svg-file> --positions  (output element positions)
 * 
 * Options:
 *   --json        Output results as JSON
 *   --strict      Lower thresholds, report more potential issues
 *   --dir <path>  Scan all SVG files in a directory
 *   --verbose     Show analysis details
 *   --positions   Output absolute positions for all elements
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

// ═══════════════════════════════════════════════════════════════════════════
// 简令 Bilingual Support (双语支持)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chinese flag aliases for terse bilingual CLI
 * 中文标志别名
 */
const FLAG_ALIASES = {
  // Core flags (核心标志)
  '--位': '--positions',     // positions → 位置
  '--碰': '--collisions',    // collisions (implicit)
  '--严': '--strict',        // strict → 严格
  '--容': '--containment',   // containment → 容纳
  '--元': '--element',       // element → 元素
  '--目': '--dir',           // directory → 目录
  '--详': '--verbose',       // verbose → 详细
  '--静': '--quiet',         // quiet → 静默
  '--助': '--help',          // help → 帮助
  '--帮': '--help',
  '--修': '--fix',           // fix → 修复
  '--试': '--dry-run',       // dry-run → 试运行
  '-助': '-h',
  '-帮': '-h',
};

/**
 * Terse Chinese output labels
 * 简洁中文输出标签
 */
const TERSE_LABELS = {
  // Status (状态)
  'analysis': '析',
  'file': '文',
  'elements': '元',
  'pairs': '对',
  'checked': '验',
  'skipped': '略',
  'collisions': '碰',
  'issues': '题',
  'error': '错',
  'warning': '警',
  'success': '成',
  
  // Severity (严重程度)
  'high': '高',
  'medium': '中',
  'low': '低',
  
  // Types (类型)
  'text-overlap': '文重',
  'shape-overlap': '形重',
  'text-clipped': '文切',
  'general-overlap': '重叠',
  
  // Actions (动作)
  'fix': '修',
  'move': '移',
  'spacing': '距',
  'found': '找',
  'at': '于',
  'overlap': '重',
  'position': '位',
  'size': '寸',
  
  // Results (结果)
  'no_issues': '无碰撞',
  'found_issues': '发现问题',
};

/**
 * Detect if Chinese mode should be used
 * 检测是否使用中文模式
 */
function detectChineseMode(args) {
  return args.some(arg => /[\u4e00-\u9fff]/.test(arg) || Object.keys(FLAG_ALIASES).includes(arg));
}

/**
 * Translate Chinese flags to English
 * 翻译中文标志
 */
function translateArgs(args) {
  return args.map(arg => FLAG_ALIASES[arg] || arg);
}

// Detect language mode before parsing
const rawArgs = process.argv.slice(2);
const chineseMode = detectChineseMode(rawArgs);
const args = translateArgs(rawArgs);

// Parse command line arguments
const flags = {
  json: args.includes("--json"),
  verbose: args.includes("--verbose"),
  strict: args.includes("--strict"),
  positions: args.includes("--positions"),
  containment: args.includes("--containment"),
  fix: args.includes("--fix"),
  dryRun: args.includes("--dry-run"),
  help: args.includes("--help") || args.includes("-h"),
  terse: chineseMode  // Enable terse mode when Chinese flags detected
};

// Extract --element selector
const elementIdx = args.indexOf("--element");
const elementSelector = elementIdx !== -1 ? args[elementIdx + 1] : null;

// Extract directory
const dirIdx = args.indexOf("--dir");
const scanDir = dirIdx !== -1 ? args[dirIdx + 1] : null;

// Get file path (first non-flag argument)
const filePath = args.find(arg => !arg.startsWith("--") && arg !== scanDir && !Object.keys(FLAG_ALIASES).includes(arg));

if (flags.help || (!filePath && !scanDir)) {
  console.log(`
SVG Collision Detector - Find PROBLEMATIC overlaps in SVG files
SVG 碰撞检测器 - 发现SVG文件中的问题重叠

This tool focuses on actual visual problems, ignoring common design patterns
like text on colored backgrounds or labels near shapes.

Usage:
  node svg-collisions.js <svg-file> [options]
  node svg-collisions.js --dir <directory> [options]

Options (English/简令):
  --json              Output results as JSON
  --strict   | --严   Lower thresholds, report more potential issues
  --positions| --位   Output absolute positions for all elements
  --containment|--容  Check if elements overflow their parent bounds
  --element <sel>     Query position of a specific element (id or CSS selector)
  --dir <path>        Scan all SVG files in a directory  
  --fix      | --修   Auto-apply repair suggestions to fix collisions
  --dry-run  | --试   Preview fixes without modifying files (use with --fix)
  --verbose  | --详   Show analysis details
  --help, -h          Show this help message

简令 Mode (Terse Output):
  Using any Chinese flag (--位, --碰, --严, --含, --详) automatically 
  enables terse output mode with compact Chinese labels.

What gets reported:
  🔴 Text overlapping other text (always a problem)
  🟠 Significant shape overlaps at similar z-levels
  🟡 Text potentially clipped by container bounds

What gets ignored:
  ✓ Text inside container rectangles (normal label design)
  ✓ Text on colored backgrounds
  ✓ Lines/paths crossing near text (connectors/arrows)
  ✓ Overlaps < 20% of smaller element area
  ✓ Parent-child structural relationships

Examples:
  node svg-collisions.js docs/diagrams/CRAWLER_PIPELINE_FLOW.svg
  node svg-collisions.js --dir docs/diagrams --json
  node svg-collisions.js diagram.svg --strict
  node svg-collisions.js diagram.svg --positions --json
  node svg-collisions.js diagram.svg --containment
  node svg-collisions.js diagram.svg --element "#my-label" --json
  
Fix Mode:
  node svg-collisions.js diagram.svg --fix --dry-run  # Preview fixes
  node svg-collisions.js diagram.svg --fix            # Apply fixes
  node svg-collisions.js --dir docs --fix --dry-run   # Batch preview
  
简令 Examples (Terse Mode):
  node svg-collisions.js diagram.svg --位            # Positions, terse output
  node svg-collisions.js diagram.svg --严 --含       # Strict + containment
  node svg-collisions.js --dir docs/designs --碰    # Scan dir, collisions
  node svg-collisions.js diagram.svg --修 --试       # Preview fixes (dry-run)
`);
  process.exit(0);
}

/**
 * Calculate intersection of two rectangles
 */
function getIntersection(rect1, rect2) {
  const x1 = Math.max(rect1.x, rect2.x);
  const y1 = Math.max(rect1.y, rect2.y);
  const x2 = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
  const y2 = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);
  
  if (x2 > x1 && y2 > y1) {
    return {
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
      area: (x2 - x1) * (y2 - y1)
    };
  }
  return null;
}

/**
 * Calculate area of a bounding box
 */
function getArea(bbox) {
  return bbox.width * bbox.height;
}

/**
 * Check if rect1 contains rect2 (rect2 is inside rect1)
 * Allows small tolerance for filters/shadows that extend bounds
 */
function contains(outer, inner, tolerance = 5) {
  return inner.x >= (outer.x - tolerance) &&
         inner.y >= (outer.y - tolerance) &&
         (inner.x + inner.width) <= (outer.x + outer.width + tolerance) &&
         (inner.y + inner.height) <= (outer.y + outer.height + tolerance);
}

/**
 * Check if element A is a structural ancestor of element B
 */
function isAncestor(ancestorPath, descendantPath) {
  return descendantPath.startsWith(ancestorPath + " > ");
}

/**
 * Check if two elements have a parent-child relationship
 */
function hasStructuralRelationship(path1, path2) {
  return isAncestor(path1, path2) || isAncestor(path2, path1);
}

/**
 * Determine if an element is a text element
 */
function isTextElement(element) {
  const textTags = ["text", "tspan", "textpath"];
  return textTags.includes(element.tagName.toLowerCase());
}

/**
 * Determine if an element is a container shape (rect, etc)
 */
function isContainerShape(element) {
  const containerTags = ["rect"];
  return containerTags.includes(element.tagName.toLowerCase());
}

/**
 * Determine if an element is a group container
 */
function isGroupElement(element) {
  const groupTags = ["g", "svg"];
  return groupTags.includes(element.tagName.toLowerCase());
}

/**
 * Determine if an element is a line/path (connectors)
 */
function isLineElement(element) {
  const lineTags = ["line", "path", "polyline"];
  return lineTags.includes(element.tagName.toLowerCase());
}

/**
 * Check if fill is transparent or very light
 */
function isTransparentFill(fill) {
  if (!fill) return true;
  if (fill === "none" || fill === "transparent") return true;
  if (fill.includes("rgba") && fill.includes(",0)")) return true;
  if (fill.startsWith("url(")) return false; // gradients are opaque
  return false;
}

/**
 * Get a human-readable description of an element
 */
function describeElement(el) {
  let desc = el.tagName;
  if (el.id) desc += `#${el.id}`;
  if (el.textContent) {
    const text = el.textContent.slice(0, 25);
    desc += ` "${text}${el.textContent.length > 25 ? '...' : ''}"`;
  }
  return desc;
}

/**
 * Determine collision type and whether it's a real problem
 */
function classifyCollision(el1, el2, intersection, strict) {
  const isText1 = isTextElement(el1);
  const isText2 = isTextElement(el2);
  const isContainer1 = isContainerShape(el1);
  const isContainer2 = isContainerShape(el2);
  const isLine1 = isLineElement(el1);
  const isLine2 = isLineElement(el2);
  const isGroup1 = isGroupElement(el1);
  const isGroup2 = isGroupElement(el2);
  
  // Skip group element overlaps entirely - they're structural, not visual
  if (isGroup1 || isGroup2) {
    return { report: false, reason: "Group element (structural)" };
  }
  
  const area1 = getArea(el1.bbox);
  const area2 = getArea(el2.bbox);
  const smallerArea = Math.min(area1, area2);
  const overlapRatio = intersection.area / smallerArea;
  
  // TEXT vs TEXT: Always a problem - two texts overlapping is unreadable
  if (isText1 && isText2) {
    // Minimum overlap to be a real issue (at least 15% overlap in strict, 30% normal)
    const minOverlap = strict ? 0.15 : 0.30;
    if (overlapRatio >= minOverlap) {
      return {
        type: "text-overlap",
        severity: "high",
        reason: "Text overlapping other text - unreadable",
        report: true
      };
    }
    return { report: false, reason: "Minor text proximity" };
  }
  
  // TEXT vs CONTAINER: Usually intentional (text inside box)
  if ((isText1 && isContainer2) || (isText2 && isContainer1)) {
    const textEl = isText1 ? el1 : el2;
    const containerEl = isText1 ? el2 : el1;
    
    // If container fully contains text, it's intentional design (label in box)
    if (contains(containerEl.bbox, textEl.bbox)) {
      return { report: false, reason: "Text inside container (intentional)" };
    }
    
    // If text extends well outside container, might be a clipping issue
    const textOutside = 1 - (intersection.area / getArea(textEl.bbox));
    if (textOutside > 0.3 && strict) {
      return {
        type: "text-clipped",
        severity: "low",
        reason: "Text may extend outside its visual container",
        report: true
      };
    }
    
    return { report: false, reason: "Text near/in container" };
  }
  
  // TEXT vs LINE: Usually connectors/arrows - not a problem unless huge overlap
  if ((isText1 && isLine2) || (isText2 && isLine1)) {
    // Lines have very small area, so even small overlap has high ratio
    // Only report if line actually covers significant portion of text
    const textEl = isText1 ? el1 : el2;
    const lineEl = isText1 ? el2 : el1;
    const textArea = getArea(textEl.bbox);
    const lineArea = getArea(lineEl.bbox);
    const coverRatio = intersection.area / textArea;
    
    // Small text near lines = labels on connectors (YES/NO on decision trees)
    // Typical label text is under 200 sq px
    if (textArea < 200) {
      return { report: false, reason: "Small label on connector line" };
    }
    
    // If line area is very small compared to text, it's just crossing nearby
    if (lineArea < textArea * 0.5) {
      return { report: false, reason: "Line passes near text" };
    }
    
    // Path shapes (like database cylinders) often contain descriptive text
    // Check if text is mostly inside the path bounding box (icon with label)
    if (lineEl.tagName.toLowerCase() === 'path') {
      // If the text bbox is mostly inside the path bbox, it's a labeled icon
      const textInsidePath = contains(lineEl.bbox, textEl.bbox, 20);
      if (textInsidePath) {
        return { report: false, reason: "Text label inside icon shape" };
      }
    }
    
    // Only report if line truly obscures the text (>80% coverage)
    if (coverRatio > 0.8) {
      return {
        type: "line-over-text",
        severity: "medium", 
        reason: "Line/path significantly covers text",
        report: true
      };
    }
    return { report: false, reason: "Line near text (connector)" };
  }
  
  // CONTAINER vs CONTAINER: Two rectangles overlapping is usually a problem
  if (isContainer1 && isContainer2) {
    // If one contains the other entirely, it's intentional nesting (card inside panel)
    if (contains(el1.bbox, el2.bbox) || contains(el2.bbox, el1.bbox)) {
      return { report: false, reason: "Nested containers" };
    }
    
    const area1 = getArea(el1.bbox);
    const area2 = getArea(el2.bbox);
    const smallerArea = Math.min(area1, area2);
    const largerArea = Math.max(area1, area2);
    const areaRatio = smallerArea / largerArea;
    
    // If one rect is significantly larger (>3x), it's likely a background/container panel
    // and the smaller rect is meant to be inside it (common in card layouts)
    if (areaRatio < 0.33) {
      return { report: false, reason: "Background container vs nested element" };
    }
    
    // Check for header/body pattern: small rect overlapping edge of larger rect
    // Common in card designs where a colored header sits on top of white body
    // If one rect is much smaller (header) and overlap is small, likely intentional
    if (areaRatio < 0.5 && intersection.area / smallerArea < 0.6) {
      return { report: false, reason: "Header/body card pattern" };
    }
    
    // Adjacent elements in doc order with small overlap = intentional layering
    const docOrderDistance = Math.abs(el1.docOrder - el2.docOrder);
    if (docOrderDistance <= 5 && overlapRatio < 0.4) {
      return { report: false, reason: "Adjacent layered containers" };
    }
    
    // Small overlap areas (<10000 sq px) are often section edges or minor layout adjustments
    if (intersection.area < 10000) {
      return { report: false, reason: "Minor edge overlap" };
    }
    
    // Two independent rects overlapping significantly is a layout problem
    // This catches cases like a white panel overlapping a colored card
    const minOverlap = strict ? 0.15 : 0.35;
    
    if (overlapRatio > minOverlap) {
      return {
        type: "shape-overlap",
        severity: overlapRatio > 0.6 ? "high" : "medium",
        reason: "Rectangles overlap - possible layout issue",
        report: true
      };
    }
    return { report: false, reason: "Minor shape overlap" };
  }
  
  // Other combinations - only report large overlaps in strict mode
  if (strict && overlapRatio > 0.5) {
    return {
      type: "general-overlap",
      severity: "low",
      reason: "Elements significantly overlap",
      report: true
    };
  }
  
  return { report: false, reason: "Normal overlap" };
}

/**
 * Generate repair suggestions for a collision
 * @param {Object} el1 - First element
 * @param {Object} el2 - Second element
 * @param {Object} intersection - Intersection bounds
 * @param {string} type - Collision type
 * @returns {Object} - Repair suggestion with actionable move data
 */
function generateRepairSuggestion(el1, el2, intersection, type) {
  // Determine which element to move (prefer smaller, later in doc order)
  const area1 = el1.bbox.width * el1.bbox.height;
  const area2 = el2.bbox.width * el2.bbox.height;
  const moveEl = area2 <= area1 ? el2 : el1;
  const fixedEl = moveEl === el2 ? el1 : el2;
  const moveId = moveEl.id || moveEl.path.split(" > ").pop();
  const fixedId = fixedEl.id || fixedEl.path.split(" > ").pop();
  
  // Calculate minimum separation needed (overlap + 5px padding)
  const padding = 5;
  const horizontalSep = intersection.width + padding;
  const verticalSep = intersection.height + padding;
  
  // Determine best direction based on overlap shape
  const isHorizontalOverlap = intersection.width > intersection.height;
  
  let suggestion, strategy, alternatives = [];
  let dx = 0, dy = 0; // Actionable movement deltas
  
  if (type === "text-overlap") {
    if (isHorizontalOverlap) {
      // Elements side by side - move one horizontally
      const moveRight = moveEl.bbox.x > fixedEl.bbox.x;
      dx = moveRight ? Math.ceil(horizontalSep) : -Math.ceil(horizontalSep);
      suggestion = `Move "${moveId}" ${moveRight ? "right" : "left"} by ${Math.ceil(horizontalSep)}px`;
      strategy = "separate-horizontal";
      alternatives = [
        `Move "${fixedId}" ${moveRight ? "left" : "right"} by ${Math.ceil(horizontalSep)}px`,
        `Reduce "${moveId}" text by ~${Math.ceil(intersection.width / 8)} characters`
      ];
    } else {
      // Elements stacked - move one vertically
      const moveDown = moveEl.bbox.y > fixedEl.bbox.y;
      dy = moveDown ? Math.ceil(verticalSep) : -Math.ceil(verticalSep);
      suggestion = `Move "${moveId}" ${moveDown ? "down" : "up"} by ${Math.ceil(verticalSep)}px`;
      strategy = "separate-vertical";
      alternatives = [
        `Move "${fixedId}" ${moveDown ? "up" : "down"} by ${Math.ceil(verticalSep)}px`
      ];
    }
  } else if (type === "shape-overlap") {
    if (isHorizontalOverlap) {
      const moveRight = moveEl.bbox.x > fixedEl.bbox.x;
      dx = moveRight ? Math.ceil(horizontalSep) : -Math.ceil(horizontalSep);
      suggestion = `Move "${moveId}" ${moveRight ? "right" : "left"} by ${Math.ceil(horizontalSep)}px`;
      strategy = "separate-horizontal";
    } else {
      const moveDown = moveEl.bbox.y > fixedEl.bbox.y;
      dy = moveDown ? Math.ceil(verticalSep) : -Math.ceil(verticalSep);
      suggestion = `Move "${moveId}" ${moveDown ? "down" : "up"} by ${Math.ceil(verticalSep)}px`;
      strategy = "separate-vertical";
    }
    alternatives = [`Reduce "${moveId}" size by ${Math.ceil(Math.max(horizontalSep, verticalSep))}px`];
  } else if (type === "text-clipped") {
    suggestion = `Expand container width by ${Math.ceil(horizontalSep)}px`;
    strategy = "expand-container";
    alternatives = [`Reduce text "${moveId}" by ~${Math.ceil(intersection.width / 8)} characters`];
  } else {
    // General overlap - move vertically by default
    dy = Math.ceil(Math.max(horizontalSep, verticalSep));
    suggestion = `Increase spacing by ${Math.ceil(Math.max(horizontalSep, verticalSep))}px`;
    strategy = "increase-spacing";
  }
  
  return { 
    strategy, 
    suggestion, 
    alternatives,
    // Actionable data for --fix mode
    moveElementId: moveEl.id,
    moveElementPath: moveEl.path,
    moveElementTagName: moveEl.tagName,
    dx,
    dy
  };
}

/**
 * Apply collision fixes to an SVG file
 * Uses regex-based editing to adjust element positions
 * 
 * @param {string} svgPath - Path to the SVG file
 * @param {Array} collisions - Array of collision objects with repair info
 * @param {boolean} dryRun - If true, preview changes without writing
 * @returns {Object} - Result of the fix operation
 */
function applyFixes(svgPath, collisions, dryRun = false) {
  const absolutePath = path.resolve(svgPath);
  let svgContent = fs.readFileSync(absolutePath, "utf-8");
  const originalContent = svgContent;
  
  const fixResults = [];
  const fixableCollisions = collisions.filter(c => 
    c.repair && 
    c.repair.moveElementId && 
    (c.repair.dx !== 0 || c.repair.dy !== 0) &&
    c.repair.strategy !== "expand-container" // Skip container expansion for now
  );
  
  for (const collision of fixableCollisions) {
    const { repair } = collision;
    const elementId = repair.moveElementId;
    
    if (!elementId) {
      fixResults.push({
        collision: collision.type,
        success: false,
        reason: "No element ID available for fix"
      });
      continue;
    }
    
    // Find the element by ID and adjust its position
    // Pattern: id="elementId" ... x="value" or y="value"
    // Or for transforms: transform="translate(x, y)"
    
    const escapedId = elementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Try to find element with x/y attributes (text, rect, etc.)
    const elementPattern = new RegExp(
      `(<[^>]*\\sid="${escapedId}"[^>]*?)\\s(x)="([^"]+)"`,
      'g'
    );
    
    let modified = false;
    
    if (repair.dx !== 0) {
      // Adjust x coordinate
      const xPattern = new RegExp(
        `(<[^>]*\\sid="${escapedId}"[^>]*?)\\sx="([^"]+)"`,
        ''
      );
      const xMatch = svgContent.match(xPattern);
      
      if (xMatch) {
        const oldX = parseFloat(xMatch[2]);
        const newX = oldX + repair.dx;
        svgContent = svgContent.replace(
          xPattern,
          `$1 x="${newX}"`
        );
        modified = true;
        fixResults.push({
          elementId,
          collision: collision.type,
          attribute: "x",
          oldValue: oldX,
          newValue: newX,
          delta: repair.dx,
          success: true
        });
      }
    }
    
    if (repair.dy !== 0) {
      // Adjust y coordinate
      const yPattern = new RegExp(
        `(<[^>]*\\sid="${escapedId}"[^>]*?)\\sy="([^"]+)"`,
        ''
      );
      const yMatch = svgContent.match(yPattern);
      
      if (yMatch) {
        const oldY = parseFloat(yMatch[2]);
        const newY = oldY + repair.dy;
        svgContent = svgContent.replace(
          yPattern,
          `$1 y="${newY}"`
        );
        modified = true;
        fixResults.push({
          elementId,
          collision: collision.type,
          attribute: "y",
          oldValue: oldY,
          newValue: newY,
          delta: repair.dy,
          success: true
        });
      }
    }
    
    // If no direct x/y attributes, try adjusting transform
    if (!modified && (repair.dx !== 0 || repair.dy !== 0)) {
      // Look for transform="translate(...)"
      const transformPattern = new RegExp(
        `(<[^>]*\\sid="${escapedId}"[^>]*?)\\stransform="translate\\(([^)]+)\\)"`,
        ''
      );
      const transformMatch = svgContent.match(transformPattern);
      
      if (transformMatch) {
        const coords = transformMatch[2].split(/[,\s]+/).map(s => parseFloat(s.trim()));
        const oldX = coords[0] || 0;
        const oldY = coords[1] || 0;
        const newX = oldX + repair.dx;
        const newY = oldY + repair.dy;
        
        svgContent = svgContent.replace(
          transformPattern,
          `$1 transform="translate(${newX}, ${newY})"`
        );
        modified = true;
        fixResults.push({
          elementId,
          collision: collision.type,
          attribute: "transform",
          oldValue: `translate(${oldX}, ${oldY})`,
          newValue: `translate(${newX}, ${newY})`,
          delta: { dx: repair.dx, dy: repair.dy },
          success: true
        });
      }
    }
    
    if (!modified) {
      fixResults.push({
        elementId,
        collision: collision.type,
        success: false,
        reason: "Could not find element or position attribute to modify"
      });
    }
  }
  
  const hasChanges = svgContent !== originalContent;
  
  if (hasChanges && !dryRun) {
    // Write the modified SVG
    fs.writeFileSync(absolutePath, svgContent, "utf-8");
  }
  
  return {
    file: svgPath,
    dryRun,
    hasChanges,
    totalCollisions: collisions.length,
    fixableCollisions: fixableCollisions.length,
    fixResults,
    successCount: fixResults.filter(r => r.success).length,
    failCount: fixResults.filter(r => !r.success).length
  };
}

/**
 * Format fix results for console output
 */
function formatFixReport(fixResult, terse = false) {
  const lines = [];
  const fname = path.basename(fixResult.file);
  
  if (terse) {
    const status = fixResult.dryRun ? "试" : (fixResult.hasChanges ? "改" : "无");
    lines.push(`${status} ${fname} 修${fixResult.successCount}/${fixResult.fixableCollisions}`);
    return lines.join("\n");
  }
  
  lines.push(`\n${"═".repeat(70)}`);
  lines.push(`Fix Results: ${fname}${fixResult.dryRun ? " (DRY RUN)" : ""}`);
  lines.push(`${"═".repeat(70)}`);
  
  if (!fixResult.hasChanges) {
    lines.push("\n⚡ No changes needed or possible");
    return lines.join("\n");
  }
  
  lines.push(`\nCollisions: ${fixResult.totalCollisions} total, ${fixResult.fixableCollisions} fixable`);
  lines.push(`Applied: ${fixResult.successCount} successful, ${fixResult.failCount} failed`);
  
  if (fixResult.fixResults.length > 0) {
    lines.push(`\n${"─".repeat(70)}`);
    lines.push("Changes:");
    
    for (const fix of fixResult.fixResults) {
      if (fix.success) {
        const delta = typeof fix.delta === 'object' 
          ? `dx=${fix.delta.dx}, dy=${fix.delta.dy}`
          : (fix.delta > 0 ? `+${fix.delta}` : fix.delta);
        lines.push(`  ✅ #${fix.elementId} ${fix.attribute}: ${fix.oldValue} → ${fix.newValue} (${delta})`);
      } else {
        lines.push(`  ❌ #${fix.elementId || 'unknown'}: ${fix.reason}`);
      }
    }
  }
  
  if (fixResult.dryRun && fixResult.hasChanges) {
    lines.push(`\n💡 Run without --dry-run to apply these changes`);
  } else if (fixResult.hasChanges) {
    lines.push(`\n✅ Changes written to ${fname}`);
    lines.push(`💡 Run collision check again to verify fixes`);
  }
  
  return lines.join("\n");
}

/**
 * Analyze an SVG file for collisions
 */
async function analyzeSvg(browser, svgPath) {
  const absolutePath = path.resolve(svgPath);
  
  if (!fs.existsSync(absolutePath)) {
    return { error: `File not found: ${absolutePath}`, collisions: [] };
  }
  
  const svgContent = fs.readFileSync(absolutePath, "utf-8");
  
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
    
    await page.setContent(html, { waitUntil: "networkidle0" });
    
    // Extract all element bounding boxes with document order
    const elements = await page.evaluate(() => {
      const svg = document.querySelector("svg");
      if (!svg) return [];
      
      const results = [];
      let docOrder = 0;
      
      function getPath(el) {
        const parts = [];
        let current = el;
        while (current && current !== svg.parentElement) {
          let selector = current.tagName.toLowerCase();
          if (current.id) {
            selector += `#${current.id}`;
          } else {
            const siblings = current.parentElement ? 
              Array.from(current.parentElement.children).filter(c => c.tagName === current.tagName) : [];
            if (siblings.length > 1) {
              const idx = siblings.indexOf(current);
              selector += `:nth-of-type(${idx + 1})`;
            }
          }
          parts.unshift(selector);
          current = current.parentElement;
        }
        return parts.join(" > ");
      }
      
      function processElement(el, depth = 0) {
        // Skip defs, markers, gradients, filters, etc.
        const skipTags = ["defs", "marker", "lineargradient", "radialgradient", "filter", "clippath", "mask", "pattern", "symbol", "title", "desc"];
        if (skipTags.includes(el.tagName.toLowerCase())) return;
        
        // Get bounding box
        let bbox;
        try {
          if (typeof el.getBBox === "function") {
            const b = el.getBBox();
            // Transform to screen coordinates
            const ctm = el.getScreenCTM();
            if (ctm && b.width > 0 && b.height > 0) {
              const svg = el.ownerSVGElement || el;
              const pt1 = svg.createSVGPoint();
              const pt2 = svg.createSVGPoint();
              pt1.x = b.x;
              pt1.y = b.y;
              pt2.x = b.x + b.width;
              pt2.y = b.y + b.height;
              
              const screenPt1 = pt1.matrixTransform(ctm);
              const screenPt2 = pt2.matrixTransform(ctm);
              
              bbox = {
                x: Math.min(screenPt1.x, screenPt2.x),
                y: Math.min(screenPt1.y, screenPt2.y),
                width: Math.abs(screenPt2.x - screenPt1.x),
                height: Math.abs(screenPt2.y - screenPt1.y)
              };
            }
          }
        } catch (e) {
          // Some elements don't support getBBox
        }
        
        if (bbox && bbox.width > 0 && bbox.height > 0) {
          const tagName = el.tagName.toLowerCase();
          const textContent = el.textContent ? el.textContent.trim() : "";
          const isText = ["text", "tspan", "textpath"].includes(tagName);
          
          // Only track text elements for text, or meaningful text for containers
          const relevantText = isText ? textContent.slice(0, 100) : null;
          
          results.push({
            tagName: tagName,
            id: el.id || null,
            path: getPath(el),
            bbox: bbox,
            textContent: relevantText,
            depth: depth,
            docOrder: docOrder++,
            fill: el.getAttribute("fill") || window.getComputedStyle(el).fill,
            stroke: el.getAttribute("stroke"),
            opacity: parseFloat(window.getComputedStyle(el).opacity) || 1,
            fillOpacity: parseFloat(el.getAttribute("fill-opacity") || window.getComputedStyle(el).fillOpacity) || 1
          });
        }
        
        // Process children
        for (const child of el.children) {
          processElement(child, depth + 1);
        }
      }
      
      processElement(svg);
      return results;
    });
    
    // Find PROBLEMATIC collisions only
    const collisions = [];
    const analyzed = { total: 0, skipped: 0 };
    
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const el1 = elements[i];
        const el2 = elements[j];
        
        analyzed.total++;
        
        // Skip if one is ancestor of the other (structural relationship)
        if (hasStructuralRelationship(el1.path, el2.path)) {
          analyzed.skipped++;
          continue;
        }
        
        // Skip invisible elements (opacity 0)
        if (el1.opacity === 0 || el2.opacity === 0) {
          analyzed.skipped++;
          continue;
        }
        
        // Skip very transparent fills
        if (el1.fillOpacity < 0.1 && el2.fillOpacity < 0.1) {
          analyzed.skipped++;
          continue;
        }
        
        // Calculate intersection
        const intersection = getIntersection(el1.bbox, el2.bbox);
        
        // No overlap at all
        if (!intersection || intersection.area < 5) {
          continue;
        }
        
        // Classify the collision - determine if it's a real problem
        const classification = classifyCollision(el1, el2, intersection, flags.strict);
        
        if (!classification.report) {
          if (flags.verbose) {
            console.log(`  Skipped: ${describeElement(el1)} vs ${describeElement(el2)} - ${classification.reason}`);
          }
          analyzed.skipped++;
          continue;
        }
        
        // Generate repair suggestion for this collision
        const repair = generateRepairSuggestion(el1, el2, intersection, classification.type);
        
        collisions.push({
          element1: {
            tagName: el1.tagName,
            id: el1.id,
            path: el1.path,
            textContent: el1.textContent,
            description: describeElement(el1),
            absolutePosition: {
              x: Math.round(el1.bbox.x * 10) / 10,
              y: Math.round(el1.bbox.y * 10) / 10
            },
            size: {
              width: Math.round(el1.bbox.width * 10) / 10,
              height: Math.round(el1.bbox.height * 10) / 10
            },
            bounds: {
              left: Math.round(el1.bbox.x * 10) / 10,
              top: Math.round(el1.bbox.y * 10) / 10,
              right: Math.round((el1.bbox.x + el1.bbox.width) * 10) / 10,
              bottom: Math.round((el1.bbox.y + el1.bbox.height) * 10) / 10
            }
          },
          element2: {
            tagName: el2.tagName,
            id: el2.id,
            path: el2.path,
            textContent: el2.textContent,
            description: describeElement(el2),
            absolutePosition: {
              x: Math.round(el2.bbox.x * 10) / 10,
              y: Math.round(el2.bbox.y * 10) / 10
            },
            size: {
              width: Math.round(el2.bbox.width * 10) / 10,
              height: Math.round(el2.bbox.height * 10) / 10
            },
            bounds: {
              left: Math.round(el2.bbox.x * 10) / 10,
              top: Math.round(el2.bbox.y * 10) / 10,
              right: Math.round((el2.bbox.x + el2.bbox.width) * 10) / 10,
              bottom: Math.round((el2.bbox.y + el2.bbox.height) * 10) / 10
            }
          },
          intersection: intersection,
          type: classification.type,
          severity: classification.severity,
          reason: classification.reason,
          repair: repair
        });
      }
    }
    
    // Sort by severity (high first) then by overlap area
    const severityOrder = { high: 0, medium: 1, low: 2 };
    collisions.sort((a, b) => {
      if (a.severity !== b.severity) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return b.intersection.area - a.intersection.area;
    });
    
    // Build result object
    const result = {
      file: svgPath,
      totalElements: elements.length,
      pairsAnalyzed: analyzed.total,
      pairsSkipped: analyzed.skipped,
      collisions: collisions,
      summary: {
        total: collisions.length,
        high: collisions.filter(c => c.severity === "high").length,
        medium: collisions.filter(c => c.severity === "medium").length,
        low: collisions.filter(c => c.severity === "low").length
      }
    };
    
    // Add element positions if --positions flag is set
    if (flags.positions) {
      result.elements = elements.map(el => ({
        tagName: el.tagName,
        id: el.id,
        textContent: el.textContent,
        path: el.path,
        absolutePosition: {
          x: Math.round(el.bbox.x * 10) / 10,
          y: Math.round(el.bbox.y * 10) / 10
        },
        size: {
          width: Math.round(el.bbox.width * 10) / 10,
          height: Math.round(el.bbox.height * 10) / 10
        },
        bounds: {
          left: Math.round(el.bbox.x * 10) / 10,
          top: Math.round(el.bbox.y * 10) / 10,
          right: Math.round((el.bbox.x + el.bbox.width) * 10) / 10,
          bottom: Math.round((el.bbox.y + el.bbox.height) * 10) / 10
        },
        depth: el.depth,
        docOrder: el.docOrder
      }));
    }
    
    // Check containment if --containment flag is set
    if (flags.containment) {
      const containmentIssues = [];
      
      // For each element, check if it overflows its parent group
      for (const el of elements) {
        // Skip the SVG root and groups themselves
        if (el.tagName === "svg" || el.depth === 0) continue;
        
        // Find the parent group (element with depth = current depth - 1 and is an ancestor in path)
        const parentPath = el.path.split(" > ").slice(0, -1).join(" > ");
        const parent = elements.find(p => p.path === parentPath && (p.tagName === "g" || p.tagName === "svg"));
        
        if (!parent) continue;
        
        // Check if element overflows parent
        const overflow = {
          left: Math.max(0, parent.bbox.x - el.bbox.x),
          top: Math.max(0, parent.bbox.y - el.bbox.y),
          right: Math.max(0, (el.bbox.x + el.bbox.width) - (parent.bbox.x + parent.bbox.width)),
          bottom: Math.max(0, (el.bbox.y + el.bbox.height) - (parent.bbox.y + parent.bbox.height))
        };
        
        const hasOverflow = overflow.left > 2 || overflow.top > 2 || overflow.right > 2 || overflow.bottom > 2;
        
        if (hasOverflow) {
          const elId = el.id || el.path.split(" > ").pop();
          const parentId = parent.id || parent.path.split(" > ").pop();
          
          // Determine repair strategy
          let suggestion, strategy;
          const maxOverflow = Math.max(overflow.left, overflow.top, overflow.right, overflow.bottom);
          
          if (overflow.right > 0 && overflow.right >= maxOverflow) {
            suggestion = `Move "${elId}" left by ${Math.ceil(overflow.right)}px`;
            strategy = "move-inward";
          } else if (overflow.left > 0 && overflow.left >= maxOverflow) {
            suggestion = `Move "${elId}" right by ${Math.ceil(overflow.left)}px`;
            strategy = "move-inward";
          } else if (overflow.bottom > 0 && overflow.bottom >= maxOverflow) {
            suggestion = `Move "${elId}" up by ${Math.ceil(overflow.bottom)}px`;
            strategy = "move-inward";
          } else {
            suggestion = `Move "${elId}" down by ${Math.ceil(overflow.top)}px`;
            strategy = "move-inward";
          }
          
          containmentIssues.push({
            element: {
              id: el.id,
              tagName: el.tagName,
              textContent: el.textContent,
              path: el.path,
              absolutePosition: { x: Math.round(el.bbox.x * 10) / 10, y: Math.round(el.bbox.y * 10) / 10 },
              size: { width: Math.round(el.bbox.width * 10) / 10, height: Math.round(el.bbox.height * 10) / 10 },
              bounds: {
                left: Math.round(el.bbox.x * 10) / 10,
                top: Math.round(el.bbox.y * 10) / 10,
                right: Math.round((el.bbox.x + el.bbox.width) * 10) / 10,
                bottom: Math.round((el.bbox.y + el.bbox.height) * 10) / 10
              }
            },
            parent: {
              id: parent.id,
              tagName: parent.tagName,
              path: parent.path,
              absolutePosition: { x: Math.round(parent.bbox.x * 10) / 10, y: Math.round(parent.bbox.y * 10) / 10 },
              size: { width: Math.round(parent.bbox.width * 10) / 10, height: Math.round(parent.bbox.height * 10) / 10 },
              bounds: {
                left: Math.round(parent.bbox.x * 10) / 10,
                top: Math.round(parent.bbox.y * 10) / 10,
                right: Math.round((parent.bbox.x + parent.bbox.width) * 10) / 10,
                bottom: Math.round((parent.bbox.y + parent.bbox.height) * 10) / 10
              }
            },
            overflow: {
              left: Math.round(overflow.left * 10) / 10,
              top: Math.round(overflow.top * 10) / 10,
              right: Math.round(overflow.right * 10) / 10,
              bottom: Math.round(overflow.bottom * 10) / 10
            },
            repair: {
              strategy: strategy,
              suggestion: suggestion,
              alternatives: [
                `Expand "${parentId}" by ${Math.ceil(maxOverflow)}px`,
                `Reduce "${elId}" size by ${Math.ceil(maxOverflow)}px`
              ]
            }
          });
        }
      }
      
      result.containmentIssues = containmentIssues;
    }
    
    // Query specific element if --element flag is set
    if (elementSelector) {
      const selector = elementSelector.startsWith("#") ? elementSelector.slice(1) : elementSelector;
      const found = elements.find(el => 
        el.id === selector || 
        el.id === elementSelector ||
        el.path.includes(elementSelector)
      );
      
      if (found) {
        result.query = {
          selector: elementSelector,
          found: true,
          element: {
            id: found.id,
            tagName: found.tagName,
            textContent: found.textContent,
            path: found.path,
            absolutePosition: { x: Math.round(found.bbox.x * 10) / 10, y: Math.round(found.bbox.y * 10) / 10 },
            size: { width: Math.round(found.bbox.width * 10) / 10, height: Math.round(found.bbox.height * 10) / 10 },
            bounds: {
              left: Math.round(found.bbox.x * 10) / 10,
              top: Math.round(found.bbox.y * 10) / 10,
              right: Math.round((found.bbox.x + found.bbox.width) * 10) / 10,
              bottom: Math.round((found.bbox.y + found.bbox.height) * 10) / 10
            },
            depth: found.depth,
            docOrder: found.docOrder
          }
        };
      } else {
        result.query = {
          selector: elementSelector,
          found: false,
          message: `No element found matching "${elementSelector}"`
        };
      }
    }
    
    return result;
    
  } finally {
    await page.close();
  }
}

/**
 * Format collision report for console output
 */
function formatReport(result) {
  const lines = [];
  
  lines.push(`\n${"═".repeat(70)}`);
  lines.push(`SVG Analysis: ${path.basename(result.file)}`);
  lines.push(`${"═".repeat(70)}`);
  
  if (result.error) {
    lines.push(`\n❌ Error: ${result.error}`);
    return lines.join("\n");
  }
  
  lines.push(`\nElements: ${result.totalElements} | Pairs checked: ${result.pairsAnalyzed - result.pairsSkipped}`);
  
  if (result.collisions.length === 0) {
    lines.push(`\n✅ No problematic overlaps detected!`);
    return lines.join("\n");
  }
  
  lines.push(`\n⚠️  Found ${result.collisions.length} issue(s):`);
  lines.push(`   🔴 High: ${result.summary.high}  🟠 Medium: ${result.summary.medium}  🟡 Low: ${result.summary.low}`);
  
  lines.push(`\n${"─".repeat(70)}`);
  
  result.collisions.forEach((collision, idx) => {
    const icon = collision.severity === "high" ? "🔴" : collision.severity === "medium" ? "🟠" : "🟡";
    lines.push(`\n${icon} #${idx + 1} [${collision.type}] ${collision.reason}`);
    lines.push(`   → ${collision.element1.description}`);
    lines.push(`     at (${collision.element1.absolutePosition.x}, ${collision.element1.absolutePosition.y})`);
    lines.push(`   → ${collision.element2.description}`);
    lines.push(`     at (${collision.element2.absolutePosition.x}, ${collision.element2.absolutePosition.y})`);
    lines.push(`   Overlap: ${Math.round(collision.intersection.width)}×${Math.round(collision.intersection.height)}px at (${Math.round(collision.intersection.x)}, ${Math.round(collision.intersection.y)})`);
    if (collision.repair) {
      lines.push(`   💡 Fix: ${collision.repair.suggestion}`);
    }
  });
  
  // Suggestions based on issue types
  const types = new Set(result.collisions.map(c => c.type));
  if (types.size > 0) {
    lines.push(`\n${"─".repeat(70)}`);
    lines.push("💡 Suggestions:");
    
    if (types.has("text-overlap")) {
      lines.push("   • Increase spacing between text elements");
      lines.push("   • Adjust font sizes or use abbreviations");
    }
    if (types.has("shape-overlap")) {
      lines.push("   • Reposition overlapping shapes");
      lines.push("   • Consider using transparency or different z-ordering");
    }
    if (types.has("text-clipped")) {
      lines.push("   • Expand container bounds or reduce text length");
    }
  }
  
  return lines.join("\n");
}

/**
 * Format positions report for console output (--positions flag)
 */
function formatPositionsReport(result) {
  const lines = [];
  
  lines.push(`\n${"═".repeat(70)}`);
  lines.push(`Element Positions: ${path.basename(result.file)}`);
  lines.push(`${"═".repeat(70)}`);
  
  if (result.error) {
    lines.push(`\n❌ Error: ${result.error}`);
    return lines.join("\n");
  }
  
  if (!result.elements || result.elements.length === 0) {
    lines.push(`\nNo elements found.`);
    return lines.join("\n");
  }
  
  lines.push(`\nFound ${result.elements.length} elements:\n`);
  
  // Group by tag name for easier reading
  const byTag = {};
  result.elements.forEach(el => {
    const tag = el.tagName;
    if (!byTag[tag]) byTag[tag] = [];
    byTag[tag].push(el);
  });
  
  for (const [tag, elements] of Object.entries(byTag)) {
    lines.push(`\n📦 ${tag.toUpperCase()} (${elements.length})`);
    lines.push(`${"─".repeat(40)}`);
    
    elements.slice(0, 20).forEach(el => {  // Limit to first 20 per type
      const id = el.id ? `#${el.id}` : `[${el.docOrder}]`;
      const text = el.textContent ? ` "${el.textContent.slice(0, 20)}${el.textContent.length > 20 ? '...' : ''}"` : "";
      const pos = `(${el.absolutePosition.x}, ${el.absolutePosition.y})`;
      const size = `${el.size.width}×${el.size.height}`;
      lines.push(`  ${id}${text}`);
      lines.push(`    pos: ${pos}  size: ${size}`);
    });
    
    if (elements.length > 20) {
      lines.push(`  ... and ${elements.length - 20} more`);
    }
  }
  
  return lines.join("\n");
}

/**
 * Format containment report for console output (--containment flag)
 */
function formatContainmentReport(result) {
  const lines = [];
  
  lines.push(`\n${"═".repeat(70)}`);
  lines.push(`Containment Check: ${path.basename(result.file)}`);
  lines.push(`${"═".repeat(70)}`);
  
  if (result.error) {
    lines.push(`\n❌ Error: ${result.error}`);
    return lines.join("\n");
  }
  
  if (!result.containmentIssues || result.containmentIssues.length === 0) {
    lines.push(`\n✅ All elements contained within their parents!`);
    return lines.join("\n");
  }
  
  lines.push(`\n⚠️  Found ${result.containmentIssues.length} containment issue(s):\n`);
  
  result.containmentIssues.forEach((issue, idx) => {
    const elId = issue.element.id || issue.element.path.split(" > ").pop();
    const parentId = issue.parent.id || issue.parent.path.split(" > ").pop();
    
    lines.push(`\n📦 #${idx + 1} Element overflows parent`);
    lines.push(`   Element: ${issue.element.tagName}${issue.element.id ? "#" + issue.element.id : ""}`);
    lines.push(`     bounds: (${issue.element.bounds.left}, ${issue.element.bounds.top}) → (${issue.element.bounds.right}, ${issue.element.bounds.bottom})`);
    lines.push(`   Parent: ${issue.parent.tagName}${issue.parent.id ? "#" + issue.parent.id : ""}`);
    lines.push(`     bounds: (${issue.parent.bounds.left}, ${issue.parent.bounds.top}) → (${issue.parent.bounds.right}, ${issue.parent.bounds.bottom})`);
    
    const overflows = [];
    if (issue.overflow.left > 0) overflows.push(`left: ${issue.overflow.left}px`);
    if (issue.overflow.top > 0) overflows.push(`top: ${issue.overflow.top}px`);
    if (issue.overflow.right > 0) overflows.push(`right: ${issue.overflow.right}px`);
    if (issue.overflow.bottom > 0) overflows.push(`bottom: ${issue.overflow.bottom}px`);
    lines.push(`   Overflow: ${overflows.join(", ")}`);
    
    if (issue.repair) {
      lines.push(`   💡 Fix: ${issue.repair.suggestion}`);
    }
  });
  
  return lines.join("\n");
}

/**
 * Format element query report for console output (--element flag)
 */
function formatElementQueryReport(result) {
  const lines = [];
  
  lines.push(`\n${"═".repeat(70)}`);
  lines.push(`Element Query: ${path.basename(result.file)}`);
  lines.push(`${"═".repeat(70)}`);
  
  if (result.error) {
    lines.push(`\n❌ Error: ${result.error}`);
    return lines.join("\n");
  }
  
  if (!result.query) {
    lines.push(`\nNo query specified.`);
    return lines.join("\n");
  }
  
  lines.push(`\nQuery: "${result.query.selector}"`);
  
  if (!result.query.found) {
    lines.push(`\n❌ ${result.query.message}`);
    return lines.join("\n");
  }
  
  const el = result.query.element;
  lines.push(`\n✅ Found element:`);
  lines.push(`   Tag: ${el.tagName}`);
  if (el.id) lines.push(`   ID: #${el.id}`);
  if (el.textContent) lines.push(`   Text: "${el.textContent.slice(0, 50)}${el.textContent.length > 50 ? '...' : ''}"`);
  lines.push(`   Path: ${el.path}`);
  lines.push(`\n   Position:`);
  lines.push(`     absolute: (${el.absolutePosition.x}, ${el.absolutePosition.y})`);
  lines.push(`     size: ${el.size.width} × ${el.size.height}`);
  lines.push(`     bounds: (${el.bounds.left}, ${el.bounds.top}) → (${el.bounds.right}, ${el.bounds.bottom})`);
  lines.push(`\n   Hierarchy:`);
  lines.push(`     depth: ${el.depth}`);
  lines.push(`     doc order: ${el.docOrder}`);
  
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// TERSE OUTPUT FORMATTERS (简令 mode)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format collision report in terse 简令 mode
 * 碰撞报告 - 简洁模式
 */
function formatReportTerse(result) {
  const lines = [];
  const fname = path.basename(result.file);
  
  if (result.error) {
    lines.push(`❌ ${fname}: ${result.error}`);
    return lines.join("\n");
  }
  
  const h = result.summary?.high || 0;
  const m = result.summary?.medium || 0;
  const l = result.summary?.low || 0;
  const total = h + m + l;
  
  if (total === 0) {
    lines.push(`✅ ${fname} 元${result.totalElements} 碰0`);
    return lines.join("\n");
  }
  
  // Header: filename elements collisions severity-breakdown
  lines.push(`⚠️ ${fname} 元${result.totalElements} 碰${total} [高${h}中${m}低${l}]`);
  
  // Each collision in terse format
  result.collisions.forEach((c, i) => {
    const sev = c.severity === "high" ? "高" : c.severity === "medium" ? "中" : "低";
    const type = c.type === "text-overlap" ? "文重" : c.type === "shape-overlap" ? "形重" : "溢出";
    const pos1 = `${Math.round(c.element1.absolutePosition.x)},${Math.round(c.element1.absolutePosition.y)}`;
    const pos2 = `${Math.round(c.element2.absolutePosition.x)},${Math.round(c.element2.absolutePosition.y)}`;
    const overlap = `${Math.round(c.intersection.width)}×${Math.round(c.intersection.height)}`;
    lines.push(`  ${i+1}.${sev}${type} (${pos1})↔(${pos2}) 重${overlap}`);
  });
  
  return lines.join("\n");
}

/**
 * Format positions report in terse 简令 mode
 * 位置报告 - 简洁模式
 */
function formatPositionsReportTerse(result) {
  const lines = [];
  const fname = path.basename(result.file);
  
  if (result.error) {
    lines.push(`❌ ${fname}: ${result.error}`);
    return lines.join("\n");
  }
  
  if (!result.elements || result.elements.length === 0) {
    lines.push(`${fname} 元0`);
    return lines.join("\n");
  }
  
  lines.push(`📍 ${fname} 元${result.elements.length}`);
  
  // Group by tag name
  const byTag = {};
  result.elements.forEach(el => {
    const tag = el.tagName;
    if (!byTag[tag]) byTag[tag] = [];
    byTag[tag].push(el);
  });
  
  for (const [tag, elements] of Object.entries(byTag)) {
    lines.push(`${tag}(${elements.length}):`);
    
    elements.slice(0, 15).forEach(el => {
      const id = el.id ? `#${el.id}` : `[${el.docOrder}]`;
      const pos = `${Math.round(el.absolutePosition.x)},${Math.round(el.absolutePosition.y)}`;
      const size = `${Math.round(el.size.width)}×${Math.round(el.size.height)}`;
      const text = el.textContent ? ` "${el.textContent.slice(0, 15)}${el.textContent.length > 15 ? '..' : ''}"` : "";
      lines.push(`  ${id}${text} 位(${pos}) 寸${size}`);
    });
    
    if (elements.length > 15) {
      lines.push(`  ...余${elements.length - 15}`);
    }
  }
  
  return lines.join("\n");
}

/**
 * Format containment report in terse 简令 mode  
 * 包含检查 - 简洁模式
 */
function formatContainmentReportTerse(result) {
  const lines = [];
  const fname = path.basename(result.file);
  
  if (result.error) {
    lines.push(`❌ ${fname}: ${result.error}`);
    return lines.join("\n");
  }
  
  if (!result.containmentIssues || result.containmentIssues.length === 0) {
    lines.push(`✅ ${fname} 溢0`);
    return lines.join("\n");
  }
  
  lines.push(`⚠️ ${fname} 溢${result.containmentIssues.length}`);
  
  result.containmentIssues.forEach((issue, i) => {
    const elId = issue.element.id ? `#${issue.element.id}` : issue.element.tagName;
    const parentId = issue.parent.id ? `#${issue.parent.id}` : issue.parent.tagName;
    
    const overflows = [];
    if (issue.overflow.left > 0) overflows.push(`左${Math.round(issue.overflow.left)}`);
    if (issue.overflow.top > 0) overflows.push(`上${Math.round(issue.overflow.top)}`);
    if (issue.overflow.right > 0) overflows.push(`右${Math.round(issue.overflow.right)}`);
    if (issue.overflow.bottom > 0) overflows.push(`下${Math.round(issue.overflow.bottom)}`);
    
    lines.push(`  ${i+1}.${elId}⊄${parentId} 溢${overflows.join(",")}`);
  });
  
  return lines.join("\n");
}

/**
 * Format element query report in terse 简令 mode
 * 元素查询 - 简洁模式
 */
function formatElementQueryReportTerse(result) {
  const lines = [];
  const fname = path.basename(result.file);
  
  if (result.error) {
    lines.push(`❌ ${fname}: ${result.error}`);
    return lines.join("\n");
  }
  
  if (!result.query) {
    lines.push(`${fname} 无查询`);
    return lines.join("\n");
  }
  
  if (!result.query.found) {
    lines.push(`❌ 查"${result.query.selector}" 无果`);
    return lines.join("\n");
  }
  
  const el = result.query.element;
  const pos = `${Math.round(el.absolutePosition.x)},${Math.round(el.absolutePosition.y)}`;
  const size = `${Math.round(el.size.width)}×${Math.round(el.size.height)}`;
  const id = el.id ? `#${el.id}` : el.tagName;
  const text = el.textContent ? ` "${el.textContent.slice(0, 20)}${el.textContent.length > 20 ? '..' : ''}"` : "";
  
  lines.push(`✅ ${id}${text} 位(${pos}) 寸${size} 深${el.depth}`);
  
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main entry point
 */
async function main() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  
  try {
    let files = [];
    
    if (scanDir) {
      // Scan directory for SVG files
      const dirPath = path.resolve(scanDir);
      if (!fs.existsSync(dirPath)) {
        console.error(`Directory not found: ${dirPath}`);
        process.exit(1);
      }
      
      const entries = fs.readdirSync(dirPath);
      files = entries
        .filter(f => f.toLowerCase().endsWith(".svg"))
        .map(f => path.join(dirPath, f));
      
      if (files.length === 0) {
        console.error(`No SVG files found in: ${dirPath}`);
        process.exit(1);
      }
    } else {
      files = [filePath];
    }
    
    const results = [];
    
    for (const file of files) {
      const result = await analyzeSvg(browser, file);
      results.push(result);
    }
    
    // Apply fixes if --fix flag is set
    const fixResults = [];
    if (flags.fix) {
      for (const result of results) {
        if (result.collisions && result.collisions.length > 0) {
          const fixResult = applyFixes(result.file, result.collisions, flags.dryRun);
          fixResults.push(fixResult);
        }
      }
    }
    
    // Output results
    if (flags.json) {
      const output = results.length === 1 ? results[0] : results;
      if (flags.fix && fixResults.length > 0) {
        // Include fix results in JSON output
        if (results.length === 1) {
          output.fixResult = fixResults[0];
        } else {
          output.fixResults = fixResults;
        }
      }
      console.log(JSON.stringify(output, null, 2));
    } else {
      // Select formatters based on terse mode
      const fmtReport = flags.terse ? formatReportTerse : formatReport;
      const fmtPositions = flags.terse ? formatPositionsReportTerse : formatPositionsReport;
      const fmtContainment = flags.terse ? formatContainmentReportTerse : formatContainmentReport;
      const fmtElement = flags.terse ? formatElementQueryReportTerse : formatElementQueryReport;
      
      for (const result of results) {
        // Show element query report if --element flag is set
        if (elementSelector) {
          console.log(fmtElement(result));
        }
        // Show containment report if --containment flag is set
        if (flags.containment) {
          console.log(fmtContainment(result));
        }
        // Show positions report if --positions flag is set
        if (flags.positions) {
          console.log(fmtPositions(result));
        }
        // Always show collision report (unless just doing element query)
        if (!elementSelector || flags.positions || flags.containment) {
          console.log(fmtReport(result));
        }
      }
      
      // Show fix results if --fix flag was used
      if (flags.fix && fixResults.length > 0) {
        for (const fixResult of fixResults) {
          console.log(formatFixReport(fixResult, flags.terse));
        }
      }
      
      // Summary for multiple files
      if (results.length > 1) {
        if (flags.terse) {
          // Terse summary
          const totalIssues = results.reduce((sum, r) => sum + (r.collisions?.length || 0), 0);
          const highSeverity = results.reduce((sum, r) => sum + (r.summary?.high || 0), 0);
          console.log(`\n总计: 文${results.length} 碰${totalIssues} 高${highSeverity}`);
          if (totalIssues === 0) {
            console.log("✅ 全通过");
          }
        } else {
          console.log(`\n${"═".repeat(70)}`);
          console.log("SUMMARY");
          console.log(`${"═".repeat(70)}`);
          
          const totalIssues = results.reduce((sum, r) => sum + (r.collisions?.length || 0), 0);
          const highSeverity = results.reduce((sum, r) => sum + (r.summary?.high || 0), 0);
          
          console.log(`Files scanned: ${results.length}`);
          console.log(`Total issues: ${totalIssues}`);
          console.log(`High severity: ${highSeverity}`);
          
          if (totalIssues === 0) {
            console.log("\n✅ All SVGs look good!");
          } else {
            const problemFiles = results.filter(r => (r.collisions?.length || 0) > 0);
            console.log(`\nFiles with issues:`);
            problemFiles.forEach(r => {
              console.log(`  - ${path.basename(r.file)}: ${r.collisions.length} issue(s)`);
            });
          }
        }
      }
    }
    
    // Exit with error code if collisions found
    const hasCollisions = results.some(r => (r.collisions?.length || 0) > 0);
    process.exit(hasCollisions ? 1 : 0);
    
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
