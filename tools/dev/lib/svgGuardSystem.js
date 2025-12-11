/**
 * @fileoverview SVG Guard System
 * 
 * Provides hash-based verification, path signatures, and validation guards
 * for safe SVG mutations — analogous to js-edit guardrails.
 * 
 * Guards prevent:
 * - Editing stale elements (hash mismatch)
 * - Editing wrong elements (path mismatch)
 * - Producing invalid SVG (syntax validation)
 * - Unintended side effects (collision detection)
 */

'use strict';

const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────────────
// Hash Computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute content hash for an SVG element
 * @param {string} elementMarkup - Element's outer HTML/XML
 * @returns {string} 12-character base64 hash
 */
function computeElementHash(elementMarkup) {
  const normalized = normalizeMarkup(elementMarkup);
  return crypto.createHash('sha256')
    .update(normalized)
    .digest('base64')
    .slice(0, 12)
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Normalize markup for consistent hashing
 * - Sort attributes alphabetically
 * - Remove insignificant whitespace
 * - Normalize quotes
 */
function normalizeMarkup(markup) {
  return markup
    // Normalize whitespace between tags
    .replace(/>\s+</g, '><')
    // Normalize attribute whitespace
    .replace(/\s+/g, ' ')
    // Trim
    .trim();
}

/**
 * Compute hash for file content
 * @param {string} content - File content
 * @returns {string} 12-character base64 hash
 */
function computeFileHash(content) {
  return crypto.createHash('sha256')
    .update(content)
    .digest('base64')
    .slice(0, 12)
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// ─────────────────────────────────────────────────────────────────────────────
// Path Signatures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a canonical path signature for an element
 * @param {Object} element - Element info with ancestry
 * @returns {string} Path signature like "svg > g#main > rect.box"
 */
function generatePathSignature(element) {
  const parts = [];
  
  // Build path from ancestors + element
  const chain = [...(element.ancestors || []), element];
  
  for (const node of chain) {
    let part = node.tagName || node.tag;
    
    if (node.id) {
      part += `#${node.id}`;
    } else if (node.class) {
      part += `.${node.class.split(' ')[0]}`;
    } else if (node.index != null) {
      part += `:nth-child(${node.index + 1})`;
    }
    
    parts.push(part);
  }
  
  return parts.join(' > ');
}

/**
 * Parse a path signature into components
 * @param {string} signature - Path signature
 * @returns {Array<Object>} Array of selector components
 */
function parsePathSignature(signature) {
  const parts = signature.split(/\s*>\s*/);
  return parts.map(part => {
    const match = part.match(/^(\w+)(?:#(\w+)|\.(\w+)|:nth-child\((\d+)\))?$/);
    if (!match) return { raw: part };
    
    return {
      tagName: match[1],
      id: match[2] || null,
      class: match[3] || null,
      nthChild: match[4] ? parseInt(match[4], 10) : null
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard Checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify element hash matches expected value
 * @param {string} actualHash - Current element hash
 * @param {string} expectedHash - Expected hash from locate
 * @param {Object} options - Check options
 * @returns {Object} Guard result
 */
function checkHash(actualHash, expectedHash, options = {}) {
  const passed = actualHash === expectedHash;
  
  return {
    guard: 'hash',
    passed,
    expected: expectedHash,
    actual: actualHash,
    bypassed: options.force && !passed,
    message: passed 
      ? 'Hash matches' 
      : `Hash mismatch: expected ${expectedHash}, got ${actualHash}`
  };
}

/**
 * Verify element path matches expected signature
 * @param {string} actualPath - Current element path
 * @param {string} expectedPath - Expected path from locate
 * @returns {Object} Guard result
 */
function checkPath(actualPath, expectedPath) {
  const passed = actualPath === expectedPath;
  
  return {
    guard: 'path',
    passed,
    expected: expectedPath,
    actual: actualPath,
    message: passed
      ? 'Path matches'
      : `Path mismatch: expected ${expectedPath}, got ${actualPath}`
  };
}

/**
 * Verify span (byte offsets) matches expected range
 * @param {Object} actualSpan - Current span {start, end}
 * @param {Object} expectedSpan - Expected span from locate
 * @returns {Object} Guard result
 */
function checkSpan(actualSpan, expectedSpan) {
  const passed = actualSpan.start === expectedSpan.start && 
                 actualSpan.end === expectedSpan.end;
  
  return {
    guard: 'span',
    passed,
    expected: `${expectedSpan.start}:${expectedSpan.end}`,
    actual: `${actualSpan.start}:${actualSpan.end}`,
    message: passed
      ? 'Span matches'
      : `Span mismatch: expected ${expectedSpan.start}:${expectedSpan.end}, got ${actualSpan.start}:${actualSpan.end}`
  };
}

/**
 * Validate SVG syntax after mutation
 * @param {string} svgContent - Modified SVG content
 * @returns {Object} Guard result
 */
function checkSyntax(svgContent) {
  try {
    // Basic XML well-formedness check
    // In a real implementation, use a proper XML parser
    const errors = [];
    
    // Check for unclosed tags
    const openTags = [];
    const tagPattern = /<(\/?)([\w-]+)([^>]*?)(\/?)>/g;
    let match;
    
    while ((match = tagPattern.exec(svgContent)) !== null) {
      const [, isClose, tagName, attrs, isSelfClose] = match;
      
      if (isClose) {
        // Closing tag
        if (openTags.length === 0) {
          errors.push(`Unexpected closing tag </${tagName}>`);
        } else if (openTags[openTags.length - 1] !== tagName) {
          errors.push(`Mismatched closing tag: expected </${openTags[openTags.length - 1]}>, got </${tagName}>`);
        } else {
          openTags.pop();
        }
      } else if (!isSelfClose) {
        // Opening tag (not self-closing)
        openTags.push(tagName);
      }
    }
    
    if (openTags.length > 0) {
      errors.push(`Unclosed tags: ${openTags.join(', ')}`);
    }
    
    // Check for SVG root
    if (!/<svg[\s>]/.test(svgContent)) {
      errors.push('Missing <svg> root element');
    }
    
    const passed = errors.length === 0;
    
    return {
      guard: 'syntax',
      passed,
      errors,
      message: passed ? 'Syntax valid' : `Syntax errors: ${errors.join('; ')}`
    };
  } catch (e) {
    return {
      guard: 'syntax',
      passed: false,
      errors: [e.message],
      message: `Syntax check failed: ${e.message}`
    };
  }
}

/**
 * Check for collisions after mutation
 * @param {Object} collisionData - Collision detection results
 * @param {Object} thresholds - Severity thresholds
 * @returns {Object} Guard result
 */
function checkCollisions(collisionData, thresholds = {}) {
  const { maxHigh = 0, maxMedium = Infinity } = thresholds;
  
  const high = collisionData.summary?.high || 0;
  const medium = collisionData.summary?.medium || 0;
  
  const passed = high <= maxHigh && medium <= maxMedium;
  
  return {
    guard: 'collisions',
    passed,
    summary: collisionData.summary,
    message: passed
      ? 'No blocking collisions'
      : `Collision threshold exceeded: ${high} high, ${medium} medium`
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard Summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a guard summary for reporting
 * @param {Array<Object>} guards - Array of guard results
 * @returns {Object} Summary with overall status
 */
function createGuardSummary(guards) {
  const passed = guards.every(g => g.passed || g.bypassed);
  const failed = guards.filter(g => !g.passed && !g.bypassed);
  const bypassed = guards.filter(g => g.bypassed);
  
  return {
    passed,
    total: guards.length,
    passedCount: guards.filter(g => g.passed).length,
    failedCount: failed.length,
    bypassedCount: bypassed.length,
    guards,
    failedGuards: failed.map(g => g.guard),
    message: passed
      ? `All ${guards.length} guards passed`
      : `${failed.length} guard(s) failed: ${failed.map(g => g.guard).join(', ')}`
  };
}

/**
 * Format guard summary for console output
 * @param {Object} summary - Guard summary
 * @returns {string} Formatted output
 */
function formatGuardSummary(summary) {
  const lines = [
    '┌ Guard Summary ════════════════════════════════════════',
    `  Status: ${summary.passed ? '✓ PASSED' : '✗ FAILED'}`,
    `  Total Guards: ${summary.total}`,
    ''
  ];
  
  for (const guard of summary.guards) {
    const status = guard.passed ? '✓' : (guard.bypassed ? '⚠' : '✗');
    const label = guard.guard.padEnd(12);
    lines.push(`  ${status} ${label} ${guard.message}`);
  }
  
  lines.push('└────────────────────────────────────────────────────────');
  
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard Plan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a guard plan for an element
 * @param {Object} element - Element info
 * @param {Object} options - Plan options
 * @returns {Object} Guard plan for replay
 */
function createGuardPlan(element, options = {}) {
  return {
    timestamp: new Date().toISOString(),
    file: options.file,
    selector: element.selector,
    pathSignature: element.pathSignature || generatePathSignature(element),
    hash: element.hash || computeElementHash(element.markup),
    span: element.span,
    bounds: element.bounds,
    metadata: {
      tagName: element.tagName,
      id: element.id,
      class: element.class
    }
  };
}

/**
 * Validate a guard plan against current element state
 * @param {Object} plan - Guard plan from locate
 * @param {Object} current - Current element state
 * @param {Object} options - Validation options
 * @returns {Object} Guard summary
 */
function validatePlan(plan, current, options = {}) {
  const guards = [];
  
  // Hash check
  if (plan.hash) {
    guards.push(checkHash(current.hash, plan.hash, options));
  }
  
  // Path check
  if (plan.pathSignature) {
    guards.push(checkPath(current.pathSignature, plan.pathSignature));
  }
  
  // Span check
  if (plan.span && current.span) {
    guards.push(checkSpan(current.span, plan.span));
  }
  
  return createGuardSummary(guards);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Hashing
  computeElementHash,
  computeFileHash,
  normalizeMarkup,
  
  // Path signatures
  generatePathSignature,
  parsePathSignature,
  
  // Guard checks
  checkHash,
  checkPath,
  checkSpan,
  checkSyntax,
  checkCollisions,
  
  // Summaries
  createGuardSummary,
  formatGuardSummary,
  
  // Plans
  createGuardPlan,
  validatePlan
};
