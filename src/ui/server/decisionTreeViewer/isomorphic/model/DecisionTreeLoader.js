"use strict";

/**
 * Decision Tree Loader
 * 
 * Loads decision trees from config/decision-trees/*.json and converts them
 * to the DecisionTree model format used by the viewer.
 * 
 * The config format uses a categories-based structure:
 * {
 *   "categories": {
 *     "in-depth": { "displayName": "...", "tree": { ...branches... } }
 *   }
 * }
 * 
 * The viewer model expects:
 * DecisionTree({ id, name, description, root: BranchNode/ResultNode })
 */

const fs = require("fs");
const path = require("path");
const {
  DecisionTree,
  BranchNode,
  ResultNode
} = require("./DecisionTree");

/**
 * Convert a config-format tree node to our model format.
 * @param {Object} node - Node from config JSON
 * @param {string} parentId - Parent node ID for generating child IDs
 * @returns {BranchNode|ResultNode}
 */
function convertNode(node, parentId = "root") {
  // Result node (terminal)
  if (node.result !== undefined) {
    const isMatch = node.result === "match" || node.result === true;
    return new ResultNode({
      id: node.id || `${parentId}-result`,
      label: isMatch ? "✓ Match" : "✗ No Match",
      description: node.reason || "",
      result: isMatch,
      reason: node.reason || (isMatch ? "matched" : "no-match"),
      metadata: {
        confidence: node.confidence || 1.0
      }
    });
  }

  // Branch node (decision point)
  const nodeId = node.id || `${parentId}-branch`;
  const condition = node.condition || {};
  
  // Create a human-readable label from the condition
  const label = conditionToLabel(condition);
  
  return new BranchNode({
    id: nodeId,
    label,
    description: conditionToDescription(condition),
    condition,
    yes: node.yes ? convertNode(node.yes, `${nodeId}-yes`) : null,
    no: node.no ? convertNode(node.no, `${nodeId}-no`) : null,
    metadata: {}
  });
}

/**
 * Convert a condition object to a human-readable label.
 */
function conditionToLabel(condition) {
  if (!condition) return "Check?";
  
  switch (condition.type) {
    case "url_matches":
      const patterns = condition.patterns || [];
      if (patterns.length === 1) {
        return `URL contains "${patterns[0]}"?`;
      } else if (patterns.length <= 3) {
        return `URL matches [${patterns.join(", ")}]?`;
      } else {
        return `URL matches ${patterns.length} patterns?`;
      }
      
    case "text_contains":
      return `${condition.field || "text"} contains pattern?`;
      
    case "compare":
      const op = {
        eq: "=", ne: "≠", gt: ">", gte: "≥", lt: "<", lte: "≤"
      }[condition.operator] || condition.operator;
      const val = typeof condition.value === "object" 
        ? `${condition.value.field}${condition.value.multiplier ? `×${condition.value.multiplier}` : ""}`
        : condition.value;
      return `${condition.field} ${op} ${val}?`;
      
    case "compound":
      return `${condition.operator} (${condition.conditions?.length || 0} conditions)?`;
      
    case "flag":
      return `Flag "${condition.flag}" is ${condition.expected ? "true" : "false"}?`;
      
    default:
      return `${condition.type || "Unknown"} check?`;
  }
}

/**
 * Convert a condition object to a longer description.
 */
function conditionToDescription(condition) {
  if (!condition) return "";
  
  switch (condition.type) {
    case "url_matches":
      const patterns = condition.patterns || [];
      return `Checks if the URL matches: ${patterns.join(", ")}`;
      
    case "text_contains":
      return `Checks if ${condition.field} contains any of: ${(condition.patterns || []).join(", ")}`;
      
    case "compare":
      return `Compares ${condition.field} ${condition.operator} ${JSON.stringify(condition.value)}`;
      
    case "compound":
      return `${condition.operator} of ${condition.conditions?.length || 0} sub-conditions`;
      
    default:
      return JSON.stringify(condition);
  }
}

/**
 * Load a single category from a page-categories style config.
 * @param {string} categoryKey - Category key (e.g., "in-depth")
 * @param {Object} categoryConfig - Category configuration
 * @returns {DecisionTree}
 */
function loadCategoryTree(categoryKey, categoryConfig) {
  return new DecisionTree({
    id: `category-${categoryKey}`,
    name: categoryConfig.displayName || categoryKey,
    description: categoryConfig.description || "",
    root: convertNode(categoryConfig.tree, categoryKey),
    metadata: {
      category: categoryKey,
      version: "1.0.0"
    }
  });
}

/**
 * Load all decision trees from the config directory.
 * @param {string} [configDir] - Path to config/decision-trees directory
 * @returns {DecisionTree[]}
 */
function loadAllTrees(configDir = null) {
  const dir = configDir || path.join(process.cwd(), "config", "decision-trees");
  const trees = [];
  
  if (!fs.existsSync(dir)) {
    console.warn(`Decision trees directory not found: ${dir}`);
    return trees;
  }
  
  const files = fs.readdirSync(dir).filter(f => 
    f.endsWith(".json") && !f.includes("schema")
  );
  
  for (const file of files) {
    try {
      const filePath = path.join(dir, file);
      const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
      
      // Handle categories-based format (like page-categories.json)
      if (content.categories) {
        for (const [key, cat] of Object.entries(content.categories)) {
          if (cat.tree) {
            trees.push(loadCategoryTree(key, cat));
          }
        }
      }
      // Handle single-tree format
      else if (content.root || content.tree) {
        trees.push(new DecisionTree({
          id: content.id || path.basename(file, ".json"),
          name: content.name || content.id || file,
          description: content.description || "",
          root: convertNode(content.root || content.tree, content.id || "root"),
          metadata: content.metadata || {}
        }));
      }
    } catch (err) {
      console.error(`Failed to load decision tree from ${file}:`, err.message);
    }
  }
  
  return trees;
}

/**
 * Load trees from a DecisionConfigSet.
 * @param {Object} configSet - DecisionConfigSet instance or plain object
 * @returns {DecisionTree[]}
 */
function loadFromConfigSet(configSet) {
  const trees = [];
  
  const decisionTrees = configSet.decisionTrees || {};
  
  for (const [name, treeConfig] of Object.entries(decisionTrees)) {
    // Handle categories-based format
    if (treeConfig.categories) {
      for (const [key, cat] of Object.entries(treeConfig.categories)) {
        if (cat.tree) {
          trees.push(loadCategoryTree(key, cat));
        }
      }
    }
    // Handle single-tree format
    else if (treeConfig.root || treeConfig.tree) {
      trees.push(new DecisionTree({
        id: treeConfig.id || name,
        name: treeConfig.name || name,
        description: treeConfig.description || "",
        root: convertNode(treeConfig.root || treeConfig.tree, treeConfig.id || "root"),
        metadata: treeConfig.metadata || {}
      }));
    }
  }
  
  return trees;
}

module.exports = {
  loadAllTrees,
  loadFromConfigSet,
  loadCategoryTree,
  convertNode,
  conditionToLabel,
  conditionToDescription
};
