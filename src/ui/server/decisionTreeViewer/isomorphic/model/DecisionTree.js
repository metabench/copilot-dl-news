"use strict";

/**
 * Decision Tree Data Model
 * 
 * A clean, flexible data structure for decision trees that:
 * - Separates structure from presentation
 * - Supports both viewing and editing
 * - Enables efficient traversal and evaluation
 * - Serializes cleanly to JSON
 * 
 * @example
 * const tree = new DecisionTree({
 *   id: "article-classifier",
 *   name: "Article Classifier",
 *   root: new BranchNode({
 *     id: "check-url",
 *     label: "URL contains /article/?",
 *     condition: { type: "url_matches", patterns: ["article"] },
 *     yes: new ResultNode({ id: "is-article", result: "match", label: "Is Article" }),
 *     no: new BranchNode({ ... })
 *   })
 * });
 */

// ─────────────────────────────────────────────────────────────────────────────
// Node Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base class for all decision tree nodes.
 */
class DecisionNode {
  constructor({ id, label, description, metadata = {} }) {
    this.id = id;
    this.label = label || id;
    this.description = description || "";
    this.metadata = metadata;
  }

  /**
   * Node type discriminator.
   * @returns {"branch"|"result"}
   */
  get type() {
    throw new Error("Subclass must implement type getter");
  }

  /**
   * Serialize to plain object.
   */
  toJSON() {
    return {
      type: this.type,
      id: this.id,
      label: this.label,
      description: this.description,
      metadata: this.metadata
    };
  }

  /**
   * Deserialize from plain object.
   */
  static fromJSON(obj) {
    if (!obj) return null;
    if (obj.type === "branch") return BranchNode.fromJSON(obj);
    if (obj.type === "result") return ResultNode.fromJSON(obj);
    throw new Error(`Unknown node type: ${obj.type}`);
  }
}

/**
 * Branch node - asks a yes/no question.
 * 
 * Visual representation: Diamond shape
 * 
 * @property {Condition} condition - The condition to evaluate
 * @property {DecisionNode} yes - Path when condition is true
 * @property {DecisionNode} no - Path when condition is false
 */
class BranchNode extends DecisionNode {
  constructor({ id, label, description, condition, yes, no, metadata = {} }) {
    super({ id, label, description, metadata });
    this.condition = condition;
    this.yes = yes;
    this.no = no;
  }

  get type() {
    return "branch";
  }

  /**
   * Get all descendant nodes.
   */
  *descendants() {
    if (this.yes) {
      yield this.yes;
      if (this.yes instanceof BranchNode) yield* this.yes.descendants();
    }
    if (this.no) {
      yield this.no;
      if (this.no instanceof BranchNode) yield* this.no.descendants();
    }
  }

  toJSON() {
    return {
      ...super.toJSON(),
      condition: this.condition,
      yes: this.yes?.toJSON() || null,
      no: this.no?.toJSON() || null
    };
  }

  static fromJSON(obj) {
    return new BranchNode({
      id: obj.id,
      label: obj.label,
      description: obj.description,
      condition: obj.condition,
      yes: DecisionNode.fromJSON(obj.yes),
      no: DecisionNode.fromJSON(obj.no),
      metadata: obj.metadata
    });
  }
}

/**
 * Result node - terminal node with a boolean outcome.
 * 
 * Visual representation: Rounded rectangle (green for true, red for false)
 * 
 * @property {boolean} result - The boolean result (true = match, false = no match)
 * @property {string} reason - Compact reason code for DB storage
 */
class ResultNode extends DecisionNode {
  constructor({ id, label, description, result, reason, metadata = {} }) {
    super({ id, label, description, metadata });
    this.result = Boolean(result);
    this.reason = reason || id;
  }

  get type() {
    return "result";
  }

  /**
   * Is this a positive match?
   */
  get isMatch() {
    return this.result === true;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      result: this.result,
      reason: this.reason
    };
  }

  static fromJSON(obj) {
    return new ResultNode({
      id: obj.id,
      label: obj.label,
      description: obj.description,
      result: obj.result,
      reason: obj.reason,
      metadata: obj.metadata
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Condition Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Condition type definitions.
 * Each condition evaluates to a boolean.
 */
const ConditionTypes = {
  URL_MATCHES: "url_matches",
  TEXT_CONTAINS: "text_contains", 
  COMPARE: "compare",
  COMPOUND: "compound",
  FLAG: "flag"
};

/**
 * Create a URL pattern matching condition.
 * @param {string[]} patterns - Patterns to match
 * @param {"segment"|"contains"|"regex"} matchType - How to match
 */
function urlMatches(patterns, matchType = "segment") {
  return { type: ConditionTypes.URL_MATCHES, patterns, matchType };
}

/**
 * Create a text field contains condition.
 * @param {string} field - Field name (e.g., "title", "description")
 * @param {string[]} patterns - Patterns to match
 */
function textContains(field, patterns) {
  return { type: ConditionTypes.TEXT_CONTAINS, field, patterns };
}

/**
 * Create a numeric/value comparison condition.
 * @param {string} field - Field to compare
 * @param {"eq"|"ne"|"gt"|"gte"|"lt"|"lte"} operator - Comparison operator
 * @param {number|string|{field:string}} value - Value or field reference
 */
function compare(field, operator, value) {
  return { type: ConditionTypes.COMPARE, field, operator, value };
}

/**
 * Create a compound AND/OR condition.
 * @param {"AND"|"OR"} operator - Logical operator
 * @param {object[]} conditions - Conditions to combine
 */
function compound(operator, conditions) {
  return { type: ConditionTypes.COMPOUND, operator, conditions };
}

/**
 * Create a boolean flag check condition.
 * @param {string} flag - Flag name
 * @param {boolean} expected - Expected value
 */
function flag(flag, expected = true) {
  return { type: ConditionTypes.FLAG, flag, expected };
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision Tree
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete decision tree structure.
 */
class DecisionTree {
  constructor({ id, name, description, root, metadata = {} }) {
    this.id = id;
    this.name = name;
    this.description = description || "";
    this.root = root;
    this.metadata = {
      version: "1.0.0",
      created: new Date().toISOString().slice(0, 10),
      ...metadata
    };
  }

  /**
   * Get all nodes in the tree (breadth-first).
   */
  *nodes() {
    if (!this.root) return;
    const queue = [this.root];
    while (queue.length > 0) {
      const node = queue.shift();
      yield node;
      if (node instanceof BranchNode) {
        if (node.yes) queue.push(node.yes);
        if (node.no) queue.push(node.no);
      }
    }
  }

  /**
   * Get node by ID.
   */
  getNode(id) {
    for (const node of this.nodes()) {
      if (node.id === id) return node;
    }
    return null;
  }

  /**
   * Count total nodes.
   */
  get nodeCount() {
    let count = 0;
    for (const _ of this.nodes()) count++;
    return count;
  }

  /**
   * Get tree depth (longest path).
   */
  get depth() {
    function getDepth(node) {
      if (!node) return 0;
      if (node instanceof ResultNode) return 1;
      return 1 + Math.max(getDepth(node.yes), getDepth(node.no));
    }
    return getDepth(this.root);
  }

  /**
   * Get all result nodes.
   */
  get results() {
    return Array.from(this.nodes()).filter(n => n instanceof ResultNode);
  }

  /**
   * Get all branch nodes.
   */
  get branches() {
    return Array.from(this.nodes()).filter(n => n instanceof BranchNode);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      metadata: this.metadata,
      root: this.root?.toJSON() || null
    };
  }

  static fromJSON(obj) {
    return new DecisionTree({
      id: obj.id,
      name: obj.name,
      description: obj.description,
      root: DecisionNode.fromJSON(obj.root),
      metadata: obj.metadata
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Example Tree Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an example decision tree for demos.
 */
function createExampleTree() {
  return new DecisionTree({
    id: "article-classifier",
    name: "Article Page Classifier",
    description: "Determines if a URL points to an article page",
    root: new BranchNode({
      id: "check-article-path",
      label: "URL contains /article/?",
      condition: urlMatches(["article", "story", "post"]),
      yes: new BranchNode({
        id: "check-word-count",
        label: "Word count > 300?",
        condition: compare("word_count", "gt", 300),
        yes: new ResultNode({
          id: "full-article",
          label: "Full Article",
          result: true,
          reason: "article-path-sufficient-words"
        }),
        no: new ResultNode({
          id: "short-article",
          label: "Short Article",
          result: true,
          reason: "article-path-few-words"
        })
      }),
      no: new BranchNode({
        id: "check-news-path",
        label: "URL contains /news/?",
        condition: urlMatches(["news", "breaking"]),
        yes: new BranchNode({
          id: "check-date-pattern",
          label: "Has date in URL?",
          condition: urlMatches(["/\\d{4}/\\d{2}/"], "regex"),
          yes: new ResultNode({
            id: "dated-news",
            label: "Dated News Article",
            result: true,
            reason: "news-with-date"
          }),
          no: new ResultNode({
            id: "news-section",
            label: "News Section Page",
            result: false,
            reason: "news-no-date-likely-hub"
          })
        }),
        no: new BranchNode({
          id: "check-blog-path",
          label: "URL contains /blog/?",
          condition: urlMatches(["blog", "posts"]),
          yes: new ResultNode({
            id: "blog-post",
            label: "Blog Post",
            result: true,
            reason: "blog-path"
          }),
          no: new ResultNode({
            id: "not-article",
            label: "Not an Article",
            result: false,
            reason: "no-article-indicators"
          })
        })
      })
    }),
    metadata: {
      author: "system",
      version: "1.0.0"
    }
  });
}

module.exports = {
  // Classes
  DecisionTree,
  DecisionNode,
  BranchNode,
  ResultNode,
  
  // Condition builders
  ConditionTypes,
  urlMatches,
  textContains,
  compare,
  compound,
  flag,
  
  // Utilities
  createExampleTree
};
