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
 * 
 * Options:
 *   --json        Output results as JSON
 *   --strict      Lower thresholds, report more potential issues
 *   --dir <path>  Scan all SVG files in a directory
 *   --verbose     Show analysis details
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  json: args.includes("--json"),
  verbose: args.includes("--verbose"),
  strict: args.includes("--strict"),
  help: args.includes("--help") || args.includes("-h")
};

// Extract directory
const dirIdx = args.indexOf("--dir");
const scanDir = dirIdx !== -1 ? args[dirIdx + 1] : null;

// Get file path (first non-flag argument)
const filePath = args.find(arg => !arg.startsWith("--") && arg !== scanDir);

if (flags.help || (!filePath && !scanDir)) {
  console.log(`
SVG Collision Detector - Find PROBLEMATIC overlaps in SVG files

This tool focuses on actual visual problems, ignoring common design patterns
like text on colored backgrounds or labels near shapes.

Usage:
  node svg-collisions.js <svg-file> [options]
  node svg-collisions.js --dir <directory> [options]

Options:
  --json          Output results as JSON
  --strict        Lower thresholds, report more potential issues
  --dir <path>    Scan all SVG files in a directory  
  --verbose       Show analysis details
  --help, -h      Show this help message

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
    const textArea = getArea(textEl.bbox);
    const coverRatio = intersection.area / textArea;
    
    if (coverRatio > 0.5) {
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
    
    // If one rect is MUCH larger (>10x), it's likely a background/container panel
    // and the smaller rect is meant to be inside it (common in card layouts)
    if (areaRatio < 0.1) {
      return { report: false, reason: "Background container vs small element" };
    }
    
    // Check for header/body pattern: small rect overlapping edge of larger rect
    // Common in card designs where a colored header sits on top of white body
    // If one rect is much smaller (header) and overlap is small, likely intentional
    if (areaRatio < 0.3 && intersection.area / smallerArea < 0.5) {
      return { report: false, reason: "Header/body card pattern" };
    }
    
    // Adjacent elements in doc order with small overlap = intentional layering
    const docOrderDistance = Math.abs(el1.docOrder - el2.docOrder);
    if (docOrderDistance <= 3 && overlapRatio < 0.35) {
      return { report: false, reason: "Adjacent layered containers" };
    }
    
    // Two independent rects overlapping significantly is a layout problem
    // This catches cases like a white panel overlapping a colored card
    const minOverlap = strict ? 0.15 : 0.30;
    
    if (overlapRatio > minOverlap) {
      return {
        type: "shape-overlap",
        severity: overlapRatio > 0.5 ? "high" : "medium",
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
        
        collisions.push({
          element1: {
            tagName: el1.tagName,
            id: el1.id,
            path: el1.path,
            textContent: el1.textContent,
            bbox: el1.bbox,
            description: describeElement(el1)
          },
          element2: {
            tagName: el2.tagName,
            id: el2.id,
            path: el2.path,
            textContent: el2.textContent,
            bbox: el2.bbox,
            description: describeElement(el2)
          },
          intersection: intersection,
          type: classification.type,
          severity: classification.severity,
          reason: classification.reason
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
    
    return {
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
    lines.push(`   → ${collision.element2.description}`);
    lines.push(`   Overlap: ${Math.round(collision.intersection.width)}×${Math.round(collision.intersection.height)}px at (${Math.round(collision.intersection.x)}, ${Math.round(collision.intersection.y)})`);
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
    
    // Output results
    if (flags.json) {
      console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
    } else {
      for (const result of results) {
        console.log(formatReport(result));
      }
      
      // Summary for multiple files
      if (results.length > 1) {
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
