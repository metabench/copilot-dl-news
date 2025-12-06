#!/usr/bin/env node
"use strict";

/**
 * MCP Server for SVG Editor (stdio transport)
 * 
 * Provides structured SVG editing tools for AI agents:
 * 
 * DISCOVERY:
 * - svg_list_elements: List all elements with positions
 * - svg_get_element: Get details of a specific element
 * 
 * ANALYSIS:
 * - svg_detect_collisions: Find overlapping elements
 * - svg_check_containment: Check if elements overflow parents
 * 
 * MODIFICATION:
 * - svg_move_element: Move an element by offset
 * - svg_set_position: Set element to absolute position
 * - svg_set_attribute: Modify any attribute
 * 
 * LAYOUT:
 * - svg_align: Align multiple elements
 * - svg_distribute: Evenly distribute elements
 * - svg_fix_collision: Auto-fix a specific collision
 * 
 * Usage:
 *   node mcp-server.js          # Run as MCP server (stdio)
 *   node mcp-server.js --http   # Run as HTTP server (port 4398)
 */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Map<string, { dom: JSDOM, filePath: string, modified: boolean }>} */
const openFiles = new Map();

/** @type {Map<string, string[]>} Undo stacks per file */
const undoStacks = new Map();

const MAX_UNDO = 20;

// ─────────────────────────────────────────────────────────────────────────────
// SVG Parsing & Manipulation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open an SVG file and parse it
 */
const openSvg = (filePath) => {
    const absPath = path.resolve(filePath);
    
    if (openFiles.has(absPath)) {
        return { success: true, fileId: absPath, cached: true };
    }
    
    if (!fs.existsSync(absPath)) {
        return { success: false, error: `File not found: ${absPath}` };
    }
    
    const content = fs.readFileSync(absPath, "utf8");
    const dom = new JSDOM(content, { contentType: "image/svg+xml" });
    
    openFiles.set(absPath, { dom, filePath: absPath, modified: false });
    undoStacks.set(absPath, [content]);
    
    return { success: true, fileId: absPath, cached: false };
};

/**
 * Get the SVG document for a file
 */
const getSvgDoc = (fileId) => {
    const entry = openFiles.get(fileId);
    if (!entry) return null;
    return entry.dom.window.document;
};

/**
 * Save undo state before modification
 */
const saveUndoState = (fileId) => {
    const entry = openFiles.get(fileId);
    if (!entry) return;
    
    const stack = undoStacks.get(fileId) || [];
    const currentState = entry.dom.serialize();
    
    // Only save if different from last state
    if (stack.length === 0 || stack[stack.length - 1] !== currentState) {
        stack.push(currentState);
        if (stack.length > MAX_UNDO) stack.shift();
        undoStacks.set(fileId, stack);
    }
    
    entry.modified = true;
};

/**
 * Parse transform attribute to get translation
 */
const parseTransform = (transform) => {
    if (!transform) return { x: 0, y: 0 };
    
    const translateMatch = transform.match(/translate\(\s*([-\d.]+)\s*,?\s*([-\d.]+)?\s*\)/);
    if (translateMatch) {
        return {
            x: parseFloat(translateMatch[1]) || 0,
            y: parseFloat(translateMatch[2]) || 0
        };
    }
    return { x: 0, y: 0 };
};

/**
 * Calculate absolute position of an element
 */
const getAbsolutePosition = (element) => {
    let x = 0, y = 0;
    let current = element;
    
    while (current && current.tagName) {
        // Add transform translation
        const transform = current.getAttribute("transform");
        const trans = parseTransform(transform);
        x += trans.x;
        y += trans.y;
        
        // Add position attributes
        const ex = parseFloat(current.getAttribute("x")) || 0;
        const ey = parseFloat(current.getAttribute("y")) || 0;
        x += ex;
        y += ey;
        
        current = current.parentElement;
    }
    
    return { x, y };
};

/**
 * Get element size
 */
const getElementSize = (element) => {
    const width = parseFloat(element.getAttribute("width")) || 0;
    const height = parseFloat(element.getAttribute("height")) || 0;
    
    // For text, estimate based on content
    if (element.tagName.toLowerCase() === "text" && width === 0) {
        const text = element.textContent || "";
        const fontSize = parseFloat(element.getAttribute("font-size")) || 14;
        return {
            width: text.length * fontSize * 0.6,
            height: fontSize * 1.2
        };
    }
    
    return { width, height };
};

/**
 * Get bounding box for an element
 */
const getBounds = (element) => {
    const pos = getAbsolutePosition(element);
    const size = getElementSize(element);
    
    return {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        right: pos.x + size.width,
        bottom: pos.y + size.height
    };
};

/**
 * Find element by ID or selector
 */
const findElement = (doc, selector) => {
    if (!selector) return null;
    
    // Try as ID first
    if (!selector.startsWith("#") && !selector.includes("[")) {
        const byId = doc.getElementById(selector);
        if (byId) return byId;
    }
    
    // Try as CSS selector
    try {
        return doc.querySelector(selector);
    } catch {
        return null;
    }
};

/**
 * List all visual elements in SVG
 */
const listElements = (doc, options = {}) => {
    const svg = doc.querySelector("svg");
    if (!svg) return [];
    
    const elements = [];
    const visualTags = ["rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text", "tspan", "g", "image"];
    const skipTags = ["defs", "marker", "linearGradient", "radialGradient", "filter", "clipPath", "mask", "pattern", "symbol"];
    
    const walk = (node, depth = 0) => {
        if (node.nodeType !== 1) return; // Element nodes only
        
        const tag = node.tagName?.toLowerCase();
        if (!tag || skipTags.includes(tag)) return;
        
        if (visualTags.includes(tag)) {
            const bounds = getBounds(node);
            const info = {
                tag,
                id: node.id || null,
                position: { x: Math.round(bounds.x), y: Math.round(bounds.y) },
                size: { width: Math.round(bounds.width), height: Math.round(bounds.height) },
                depth
            };
            
            if (tag === "text" || tag === "tspan") {
                info.text = (node.textContent || "").slice(0, 50);
            }
            
            elements.push(info);
        }
        
        // Recurse for groups
        if (options.recursive !== false) {
            for (const child of node.children) {
                walk(child, depth + 1);
            }
        }
    };
    
    walk(svg);
    return elements;
};

/**
 * Detect collisions between elements
 */
const detectCollisions = (doc, options = {}) => {
    const elements = listElements(doc, { recursive: true })
        .filter(el => el.size.width > 0 && el.size.height > 0);
    
    const collisions = [];
    const textTags = ["text", "tspan"];
    
    for (let i = 0; i < elements.length; i++) {
        for (let j = i + 1; j < elements.length; j++) {
            const a = elements[i];
            const b = elements[j];
            
            // Check intersection
            const ax2 = a.position.x + a.size.width;
            const ay2 = a.position.y + a.size.height;
            const bx2 = b.position.x + b.size.width;
            const by2 = b.position.y + b.size.height;
            
            if (a.position.x < bx2 && ax2 > b.position.x &&
                a.position.y < by2 && ay2 > b.position.y) {
                
                // Calculate overlap
                const overlapX = Math.min(ax2, bx2) - Math.max(a.position.x, b.position.x);
                const overlapY = Math.min(ay2, by2) - Math.max(a.position.y, b.position.y);
                const overlapArea = overlapX * overlapY;
                const smallerArea = Math.min(a.size.width * a.size.height, b.size.width * b.size.height);
                const overlapRatio = smallerArea > 0 ? overlapArea / smallerArea : 0;
                
                // Skip minor overlaps
                if (overlapRatio < (options.threshold || 0.2)) continue;
                
                // Determine severity
                const isText = textTags.includes(a.tag) && textTags.includes(b.tag);
                const severity = isText ? "high" : overlapRatio > 0.5 ? "medium" : "low";
                
                collisions.push({
                    element1: { id: a.id, tag: a.tag, text: a.text },
                    element2: { id: b.id, tag: b.tag, text: b.text },
                    overlap: { x: Math.round(overlapX), y: Math.round(overlapY), ratio: Math.round(overlapRatio * 100) + "%" },
                    severity,
                    fix: {
                        moveElement: a.id || b.id,
                        suggestedOffset: overlapX > overlapY 
                            ? { x: Math.ceil(overlapX + 5), y: 0 }
                            : { x: 0, y: Math.ceil(overlapY + 5) }
                    }
                });
            }
        }
    }
    
    return collisions;
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool Implementations
// ─────────────────────────────────────────────────────────────────────────────

const tools = {
    svg_create_new: {
        description: "Create a new blank SVG file",
        inputSchema: {
            type: "object",
            properties: {
                filePath: { type: "string", description: "Path where the file will be saved" },
                width: { type: "number", description: "Canvas width (default: 800)" },
                height: { type: "number", description: "Canvas height (default: 600)" }
            },
            required: ["filePath"]
        },
        handler: (params) => {
            const absPath = path.resolve(params.filePath);
            if (openFiles.has(absPath)) {
                return { error: "File already open. Close it first." };
            }
            
            const width = params.width || 800;
            const height = params.height || 600;
            const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"></svg>`;
            
            const dom = new JSDOM(content, { contentType: "image/svg+xml" });
            openFiles.set(absPath, { dom, filePath: absPath, modified: true });
            undoStacks.set(absPath, [content]);
            
            return { success: true, fileId: absPath, width, height };
        }
    },

    svg_open: {
        description: "Open an SVG file for editing. Must be called before other operations.",
        inputSchema: {
            type: "object",
            properties: {
                filePath: { type: "string", description: "Path to the SVG file" }
            },
            required: ["filePath"]
        },
        handler: (params) => {
            return openSvg(params.filePath);
        }
    },

    svg_list_elements: {
        description: "List all visual elements in the SVG with their positions and sizes. RECOMMENDED: Call with onlyStats:true first for large files, then filter by tag or use maxResults.",
        inputSchema: {
            type: "object",
            properties: {
                fileId: { type: "string", description: "File ID from svg_open" },
                tag: { type: "string", description: "Filter by tag name (e.g., 'text', 'rect')" },
                maxResults: { type: "number", description: "Maximum elements to return (default: all)" },
                onlyStats: { type: "boolean", description: "If true, returns only tag counts without element details" }
            },
            required: ["fileId"]
        },
        handler: (params) => {
            const doc = getSvgDoc(params.fileId);
            if (!doc) return { error: "File not open. Call svg_open first." };
            
            let elements = listElements(doc);
            
            // Calculate stats
            const tagCounts = {};
            for (const el of elements) {
                tagCounts[el.tag] = (tagCounts[el.tag] || 0) + 1;
            }
            
            // Fast path: only stats
            if (params.onlyStats) {
                return {
                    count: elements.length,
                    tagCounts,
                    hint: elements.length > 100 
                        ? `Large SVG (${elements.length} elements). Use tag filter or maxResults to limit output.`
                        : "Use tag filter or maxResults for focused queries."
                };
            }
            
            // Filter by tag
            if (params.tag) {
                elements = elements.filter(el => el.tag === params.tag.toLowerCase());
            }
            
            // Limit results
            const maxResults = params.maxResults;
            const truncated = maxResults && elements.length > maxResults;
            if (truncated) {
                elements = elements.slice(0, maxResults);
            }
            
            return { 
                count: elements.length, 
                truncated,
                tagCounts,
                elements,
                hint: truncated ? `Showing ${elements.length}. Use tag filter or increase maxResults.` : undefined
            };
        }
    },

    svg_get_element: {
        description: "Get details of a specific element by ID or CSS selector",
        inputSchema: {
            type: "object",
            properties: {
                fileId: { type: "string", description: "File ID from svg_open" },
                selector: { type: "string", description: "Element ID or CSS selector" }
            },
            required: ["fileId", "selector"]
        },
        handler: (params) => {
            const doc = getSvgDoc(params.fileId);
            if (!doc) return { error: "File not open" };
            
            const el = findElement(doc, params.selector);
            if (!el) return { error: `Element not found: ${params.selector}` };
            
            const bounds = getBounds(el);
            const attrs = {};
            for (const attr of el.attributes) {
                attrs[attr.name] = attr.value;
            }
            
            return {
                tag: el.tagName.toLowerCase(),
                id: el.id || null,
                position: { x: Math.round(bounds.x), y: Math.round(bounds.y) },
                size: { width: Math.round(bounds.width), height: Math.round(bounds.height) },
                attributes: attrs,
                text: el.textContent?.slice(0, 100) || null
            };
        }
    },

    svg_add_element: {
        description: "Add a new element to the SVG",
        inputSchema: {
            type: "object",
            properties: {
                fileId: { type: "string", description: "File ID from svg_open" },
                tag: { type: "string", description: "SVG tag name (rect, circle, text, etc.)" },
                attributes: { type: "object", description: "Element attributes (x, y, width, fill, etc.)" },
                text: { type: "string", description: "Text content (for text elements)" },
                parentId: { type: "string", description: "Optional: ID of parent group/element" }
            },
            required: ["fileId", "tag"]
        },
        handler: (params) => {
            const doc = getSvgDoc(params.fileId);
            if (!doc) return { error: "File not open" };
            
            saveUndoState(params.fileId);
            
            const el = doc.createElementNS("http://www.w3.org/2000/svg", params.tag);
            
            // Set attributes
            if (params.attributes) {
                for (const [key, value] of Object.entries(params.attributes)) {
                    el.setAttribute(key, String(value));
                }
            }
            
            // Set text
            if (params.text) {
                el.textContent = params.text;
            }
            
            // Generate ID if missing
            if (!el.id) {
                const existingIds = new Set(Array.from(doc.querySelectorAll("[id]")).map(e => e.id));
                let baseId = params.tag;
                let counter = 1;
                while (existingIds.has(`${baseId}-${counter}`)) counter++;
                el.id = `${baseId}-${counter}`;
            }
            
            // Find parent
            let parent = doc.querySelector("svg");
            if (params.parentId) {
                const found = findElement(doc, params.parentId);
                if (found) parent = found;
            }
            
            parent.appendChild(el);
            
            return { 
                success: true, 
                element: { 
                    id: el.id, 
                    tag: params.tag 
                } 
            };
        }
    },

    svg_detect_collisions: {
        description: "Detect overlapping elements that may cause visual problems. RECOMMENDED: Call with onlyStats:true first to see counts, then filter by severity:'high' or use maxResults to limit output size.",
        inputSchema: {
            type: "object",
            properties: {
                fileId: { type: "string", description: "File ID from svg_open" },
                threshold: { type: "number", description: "Minimum overlap ratio to report (0-1, default 0.2)" },
                severity: { type: "string", enum: ["high", "medium", "low"], description: "Filter to only show collisions of this severity" },
                maxResults: { type: "number", description: "Maximum collisions to return (default: all). Use to prevent large outputs." },
                onlyStats: { type: "boolean", description: "If true, returns only counts without collision details (fast, small response)" }
            },
            required: ["fileId"]
        },
        handler: (params) => {
            const doc = getSvgDoc(params.fileId);
            if (!doc) return { error: "File not open" };
            
            const allCollisions = detectCollisions(doc, { threshold: params.threshold });
            
            const stats = {
                total: allCollisions.length,
                high: allCollisions.filter(c => c.severity === "high").length,
                medium: allCollisions.filter(c => c.severity === "medium").length,
                low: allCollisions.filter(c => c.severity === "low").length
            };
            
            // Fast path: only stats requested
            if (params.onlyStats) {
                return {
                    ...stats,
                    hint: stats.high > 0 
                        ? `${stats.high} HIGH severity collisions detected. Use severity:'high' to see them.`
                        : stats.total > 0 
                        ? `${stats.total} collisions detected. Use maxResults or severity filter to limit output.`
                        : "No collisions detected."
                };
            }
            
            // Filter by severity if requested
            let collisions = allCollisions;
            if (params.severity) {
                collisions = collisions.filter(c => c.severity === params.severity);
            }
            
            // Limit results if requested
            const maxResults = params.maxResults;
            const truncated = maxResults && collisions.length > maxResults;
            if (truncated) {
                collisions = collisions.slice(0, maxResults);
            }
            
            return {
                ...stats,
                returned: collisions.length,
                truncated,
                collisions,
                hint: truncated 
                    ? `Showing ${collisions.length} of ${stats.total}. Increase maxResults or filter by severity for more.`
                    : undefined
            };
        }
    },

    svg_move_element: {
        description: "Move an element by a relative offset",
        inputSchema: {
            type: "object",
            properties: {
                fileId: { type: "string", description: "File ID from svg_open" },
                selector: { type: "string", description: "Element ID or CSS selector" },
                dx: { type: "number", description: "Horizontal offset (positive = right)" },
                dy: { type: "number", description: "Vertical offset (positive = down)" }
            },
            required: ["fileId", "selector"]
        },
        handler: (params) => {
            const doc = getSvgDoc(params.fileId);
            if (!doc) return { error: "File not open" };
            
            const el = findElement(doc, params.selector);
            if (!el) return { error: `Element not found: ${params.selector}` };
            
            saveUndoState(params.fileId);
            
            const dx = params.dx || 0;
            const dy = params.dy || 0;
            
            // Check if element has x/y attributes or uses transform
            if (el.hasAttribute("x") || el.hasAttribute("y")) {
                const x = parseFloat(el.getAttribute("x")) || 0;
                const y = parseFloat(el.getAttribute("y")) || 0;
                el.setAttribute("x", String(x + dx));
                el.setAttribute("y", String(y + dy));
            } else {
                // Use transform
                const transform = el.getAttribute("transform") || "";
                const trans = parseTransform(transform);
                const newTransform = `translate(${trans.x + dx}, ${trans.y + dy})`;
                
                // Replace or add translate
                if (transform.includes("translate")) {
                    el.setAttribute("transform", transform.replace(/translate\([^)]+\)/, newTransform));
                } else {
                    el.setAttribute("transform", (transform + " " + newTransform).trim());
                }
            }
            
            const newBounds = getBounds(el);
            return {
                success: true,
                moved: { dx, dy },
                newPosition: { x: Math.round(newBounds.x), y: Math.round(newBounds.y) }
            };
        }
    },

    svg_set_position: {
        description: "Set an element to an absolute position (x, y)",
        inputSchema: {
            type: "object",
            properties: {
                fileId: { type: "string", description: "File ID from svg_open" },
                selector: { type: "string", description: "Element ID or CSS selector" },
                x: { type: "number", description: "Absolute X coordinate" },
                y: { type: "number", description: "Absolute Y coordinate" }
            },
            required: ["fileId", "selector", "x", "y"]
        },
        handler: (params) => {
            const doc = getSvgDoc(params.fileId);
            if (!doc) return { error: "File not open" };
            
            const el = findElement(doc, params.selector);
            if (!el) return { error: `Element not found: ${params.selector}` };
            
            const currentPos = getAbsolutePosition(el);
            const dx = params.x - currentPos.x;
            const dy = params.y - currentPos.y;
            
            // Reuse move logic
            return tools.svg_move_element.handler({
                fileId: params.fileId,
                selector: params.selector,
                dx,
                dy
            });
        }
    },

    svg_set_attribute: {
        description: "Set an attribute on an element",
        inputSchema: {
            type: "object",
            properties: {
                fileId: { type: "string", description: "File ID from svg_open" },
                selector: { type: "string", description: "Element ID or CSS selector" },
                attribute: { type: "string", description: "Attribute name" },
                value: { type: "string", description: "Attribute value" }
            },
            required: ["fileId", "selector", "attribute", "value"]
        },
        handler: (params) => {
            const doc = getSvgDoc(params.fileId);
            if (!doc) return { error: "File not open" };
            
            const el = findElement(doc, params.selector);
            if (!el) return { error: `Element not found: ${params.selector}` };
            
            saveUndoState(params.fileId);
            
            const oldValue = el.getAttribute(params.attribute);
            el.setAttribute(params.attribute, params.value);
            
            return {
                success: true,
                attribute: params.attribute,
                oldValue,
                newValue: params.value
            };
        }
    },

    svg_align: {
        description: "Align multiple elements along an axis",
        inputSchema: {
            type: "object",
            properties: {
                fileId: { type: "string", description: "File ID from svg_open" },
                selectors: { type: "array", items: { type: "string" }, description: "List of element selectors" },
                alignment: { type: "string", enum: ["left", "center", "right", "top", "middle", "bottom"], description: "Alignment type" }
            },
            required: ["fileId", "selectors", "alignment"]
        },
        handler: (params) => {
            const doc = getSvgDoc(params.fileId);
            if (!doc) return { error: "File not open" };
            
            const elements = params.selectors.map(s => findElement(doc, s)).filter(e => e);
            if (elements.length < 2) return { error: "Need at least 2 elements to align" };
            
            saveUndoState(params.fileId);
            
            const boundsList = elements.map(el => ({ el, ...getBounds(el) }));
            
            let targetValue;
            switch (params.alignment) {
                case "left": targetValue = Math.min(...boundsList.map(b => b.x)); break;
                case "right": targetValue = Math.max(...boundsList.map(b => b.right)); break;
                case "top": targetValue = Math.min(...boundsList.map(b => b.y)); break;
                case "bottom": targetValue = Math.max(...boundsList.map(b => b.bottom)); break;
                case "center": // Horizontal center
                    const minX = Math.min(...boundsList.map(b => b.x));
                    const maxX = Math.max(...boundsList.map(b => b.right));
                    targetValue = minX + (maxX - minX) / 2;
                    break;
                case "middle": // Vertical middle
                    const minY = Math.min(...boundsList.map(b => b.y));
                    const maxY = Math.max(...boundsList.map(b => b.bottom));
                    targetValue = minY + (maxY - minY) / 2;
                    break;
            }
            
            const results = [];
            for (const item of boundsList) {
                let dx = 0, dy = 0;
                
                switch (params.alignment) {
                    case "left": dx = targetValue - item.x; break;
                    case "right": dx = targetValue - item.right; break;
                    case "top": dy = targetValue - item.y; break;
                    case "bottom": dy = targetValue - item.bottom; break;
                    case "center": dx = targetValue - (item.x + item.width / 2); break;
                    case "middle": dy = targetValue - (item.y + item.height / 2); break;
                }
                
                if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
                    // Direct move implementation to avoid selector issues
                    const el = item.el;
                    if (el.hasAttribute("x") || el.hasAttribute("y")) {
                        const x = parseFloat(el.getAttribute("x")) || 0;
                        const y = parseFloat(el.getAttribute("y")) || 0;
                        el.setAttribute("x", String(x + dx));
                        el.setAttribute("y", String(y + dy));
                    } else {
                        const transform = el.getAttribute("transform") || "";
                        const trans = parseTransform(transform);
                        const newTransform = `translate(${trans.x + dx}, ${trans.y + dy})`;
                        if (transform.includes("translate")) {
                            el.setAttribute("transform", transform.replace(/translate\([^)]+\)/, newTransform));
                        } else {
                            el.setAttribute("transform", (transform + " " + newTransform).trim());
                        }
                    }
                    results.push({ id: el.id, dx, dy });
                }
            }
            
            return { success: true, aligned: results.length, alignment: params.alignment };
        }
    },

    svg_fix_collision: {
        description: "Automatically fix a collision by moving one element",
        inputSchema: {
            type: "object",
            properties: {
                fileId: { type: "string", description: "File ID from svg_open" },
                collisionIndex: { type: "number", description: "Index of collision from svg_detect_collisions (0-based)" }
            },
            required: ["fileId", "collisionIndex"]
        },
        handler: (params) => {
            const doc = getSvgDoc(params.fileId);
            if (!doc) return { error: "File not open" };
            
            const collisions = detectCollisions(doc);
            const collision = collisions[params.collisionIndex];
            
            if (!collision) {
                return { error: `Collision index ${params.collisionIndex} not found. Total: ${collisions.length}` };
            }
            
            const selector = collision.fix.moveElement;
            if (!selector) {
                return { error: "No element ID available for auto-fix" };
            }
            
            // Use the move handler
            return tools.svg_move_element.handler({
                fileId: params.fileId,
                selector,
                dx: collision.fix.suggestedOffset.x,
                dy: collision.fix.suggestedOffset.y
            });
        }
    },

    svg_undo: {
        description: "Undo the last modification",
        inputSchema: {
            type: "object",
            properties: {
                fileId: { type: "string", description: "File ID from svg_open" }
            },
            required: ["fileId"]
        },
        handler: (params) => {
            const stack = undoStacks.get(params.fileId);
            if (!stack || stack.length <= 1) {
                return { error: "Nothing to undo" };
            }
            
            stack.pop(); // Remove current state
            const previousState = stack[stack.length - 1];
            
            const entry = openFiles.get(params.fileId);
            if (entry) {
                entry.dom = new JSDOM(previousState, { contentType: "image/svg+xml" });
            }
            
            return { success: true, remainingUndos: stack.length - 1 };
        }
    },

    svg_save: {
        description: "Save the modified SVG back to the file",
        inputSchema: {
            type: "object",
            properties: {
                fileId: { type: "string", description: "File ID from svg_open" },
                outputPath: { type: "string", description: "Optional: save to different path" }
            },
            required: ["fileId"]
        },
        handler: (params) => {
            const entry = openFiles.get(params.fileId);
            if (!entry) return { error: "File not open" };
            
            const outputPath = params.outputPath || entry.filePath;
            const content = entry.dom.serialize();
            
            fs.writeFileSync(outputPath, content, "utf8");
            entry.modified = false;
            
            return {
                success: true,
                path: outputPath,
                size: content.length
            };
        }
    },

    svg_close: {
        description: "Close an SVG file and free resources",
        inputSchema: {
            type: "object",
            properties: {
                fileId: { type: "string", description: "File ID from svg_open" },
                save: { type: "boolean", description: "Save before closing (default: false)" }
            },
            required: ["fileId"]
        },
        handler: (params) => {
            const entry = openFiles.get(params.fileId);
            if (!entry) return { error: "File not open" };
            
            if (params.save && entry.modified) {
                tools.svg_save.handler({ fileId: params.fileId });
            }
            
            openFiles.delete(params.fileId);
            undoStacks.delete(params.fileId);
            
            return { success: true, hadUnsavedChanges: entry.modified && !params.save };
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// MCP Protocol (stdio transport)
// ─────────────────────────────────────────────────────────────────────────────

const MCP_VERSION = "2024-11-05";

const createResponse = (id, result) => ({
    jsonrpc: "2.0",
    id,
    result
});

const createError = (id, code, message) => ({
    jsonrpc: "2.0",
    id,
    error: { code, message }
});

// Send JSON-RPC message with MCP stdio framing (Content-Length header)
const sendStdioMessage = (messageObj) => {
    const json = JSON.stringify(messageObj);
    // LSP-style framing: Content-Length and Content-Type headers followed by JSON body.
    const payload = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n${json}`;
    process.stdout.write(payload);
};

const handleRequest = (request) => {
    const { id, method, params } = request;

    switch (method) {
        case "initialize":
            return createResponse(id, {
                protocolVersion: MCP_VERSION,
                capabilities: { tools: {} },
                serverInfo: { name: "svg-editor", version: "1.0.0" }
            });

        case "notifications/initialized":
            return null;

        case "tools/list":
            return createResponse(id, {
                tools: Object.entries(tools).map(([name, tool]) => ({
                    name,
                    description: tool.description,
                    inputSchema: tool.inputSchema
                }))
            });

        case "tools/call": {
            const toolName = params?.name;
            const toolArgs = params?.arguments ?? {};
            const tool = tools[toolName];
            if (!tool) {
                return createError(id, -32602, `Unknown tool: ${toolName}`);
            }
            try {
                const result = tool.handler(toolArgs);
                return createResponse(id, {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
                });
            } catch (err) {
                return createError(id, -32603, err.message);
            }
        }

        default:
            return createError(id, -32601, `Method not found: ${method}`);
    }
};

const runStdioServer = () => {
    let buffer = "";
    process.stdin.setEncoding("utf8");

    const processBuffer = () => {
        while (true) {
            // Accept both \r\n\r\n and \n\n as header terminators (Copilot uses \n\n)
            let headerEnd = buffer.indexOf("\r\n\r\n");
            let headerTermLen = 4;
            if (headerEnd === -1) {
                headerEnd = buffer.indexOf("\n\n");
                headerTermLen = 2;
            }

            // Fallback: some clients (including occasional Copilot bursts) send raw JSON without headers.
            if (headerEnd === -1) {
                const trimmed = buffer.trimStart();
                if (trimmed.startsWith("{")) {
                    try {
                        const request = JSON.parse(trimmed);
                        buffer = "";
                        const response = handleRequest(request);
                        if (response) sendStdioMessage(response);
                        continue;
                    } catch {
                        // Not enough data yet; wait for more.
                        return;
                    }
                }
                return;
            }

            const header = buffer.slice(0, headerEnd);
            const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
            if (!contentLengthMatch) {
                sendStdioMessage(createError(null, -32700, "Missing Content-Length header"));
                buffer = buffer.slice(headerEnd + headerTermLen);
                continue;
            }

            const contentLength = Number(contentLengthMatch[1]);
            const messageEnd = headerEnd + headerTermLen + contentLength;
            if (buffer.length < messageEnd) return;

            const message = buffer.slice(headerEnd + headerTermLen, messageEnd);
            buffer = buffer.slice(messageEnd);

            let request;
            try {
                request = JSON.parse(message);
            } catch {
                sendStdioMessage(createError(null, -32700, "Parse error"));
                continue;
            }

            const response = handleRequest(request);
            if (response) {
                sendStdioMessage(response);
            }
        }
    };

    process.stdin.on("data", (chunk) => {
        buffer += chunk.toString();
        processBuffer();
    });

    process.stdin.on("end", () => process.exit(0));
};

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Server (optional)
// ─────────────────────────────────────────────────────────────────────────────

const runHttpServer = (port = 4398) => {
    const http = require("http");

    const sendJson = (res, statusCode, body) => {
        const json = JSON.stringify(body, null, 2);
        res.writeHead(statusCode, {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": Buffer.byteLength(json)
        });
        res.end(json);
    };

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);

        if (req.method === "GET" && url.pathname === "/") {
            sendJson(res, 200, {
                service: "svg-editor-mcp",
                mode: "http",
                tools: Object.keys(tools)
            });
            return;
        }

        if (req.method === "GET" && url.pathname === "/tools") {
            sendJson(res, 200, {
                tools: Object.entries(tools).map(([name, tool]) => ({
                    name,
                    description: tool.description,
                    inputSchema: tool.inputSchema
                }))
            });
            return;
        }

        if (req.method === "POST" && url.pathname === "/call") {
            let body = "";
            req.on("data", chunk => body += chunk);
            req.on("end", () => {
                try {
                    const { tool: toolName, args } = JSON.parse(body);
                    const tool = tools[toolName];
                    if (!tool) {
                        sendJson(res, 404, { error: `Unknown tool: ${toolName}` });
                        return;
                    }
                    const result = tool.handler(args || {});
                    sendJson(res, 200, result);
                } catch (err) {
                    sendJson(res, 500, { error: err.message });
                }
            });
            return;
        }

        sendJson(res, 404, { error: "Not found" });
    });

    server.listen(port, () => {
        console.log(`SVG Editor MCP server (HTTP) listening on http://localhost:${port}`);
    });

    return server;
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.includes("--help") || args.includes("-h")) {
        console.log(`
SVG Editor MCP Server

Usage:
  node mcp-server.js              Run as MCP server (stdio transport)
  node mcp-server.js --http       Run as HTTP server (default port 4398)
  node mcp-server.js --http 3000  Run as HTTP server on port 3000
  node mcp-server.js --help       Show this help

Tools available:
  svg_create_new        Create a new blank SVG file
  svg_open              Open an SVG file for editing
  svg_add_element       Add a new element to the SVG
  svg_list_elements     List all visual elements with positions
  svg_get_element       Get details of a specific element
  svg_detect_collisions Detect overlapping elements
  svg_move_element      Move an element by offset
  svg_set_position      Set an element to an absolute position
  svg_set_attribute     Set an attribute value
  svg_align             Align multiple elements
  svg_fix_collision     Auto-fix a detected collision
  svg_undo              Undo the last modification
  svg_save              Save modifications to file
  svg_close             Close file and free resources
`);
        process.exit(0);
    }

    if (args.includes("--http")) {
        const portIdx = args.indexOf("--http") + 1;
        const port = parseInt(args[portIdx], 10) || 4398;
        runHttpServer(port);
    } else {
        runStdioServer();
    }
}

module.exports = { tools, runHttpServer, runStdioServer };
