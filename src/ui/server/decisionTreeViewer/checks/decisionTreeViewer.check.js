"use strict";

/**
 * Decision Tree Viewer Check Script
 * 
 * Validates:
 * 1. Data model correctness
 * 2. SSR rendering and control structure
 * 3. Connection point presence and attributes
 * 4. Parent-child relationship integrity
 * 
 * Outputs HTML file for visual inspection.
 */

const path = require("path");
const fs = require("fs");
const { app, renderPage, createContext } = require("../server");
const { createExampleTree } = require("../isomorphic/model/DecisionTree");
const { ConnectionPointType } = require("../isomorphic/controls/ConnectionPointControl");
const { DecisionTreeControl } = require("../isomorphic/controls/DecisionTreeControl");

const OUTPUT_PATH = path.join(__dirname, "..", "..", "..", "..", "..", "decision-tree-viewer.check.html");

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n📋 ${name}`);
}

/**
 * Extract all nodes from a tree recursively
 */
function extractNodes(node, nodes = [], parent = null, branch = null) {
  if (!node) return nodes;
  
  nodes.push({
    id: node.id,
    type: node.type,
    label: node.label,
    parentId: parent?.id || null,
    branch: branch
  });
  
  if (node.type === "branch") {
    if (node.yes) extractNodes(node.yes, nodes, node, "yes");
    if (node.no) extractNodes(node.no, nodes, node, "no");
  }
  
  return nodes;
}

/**
 * Parse HTML to find connection points (simple regex-based for checking)
 */
function findConnectionPoints(html) {
  const points = [];
  const regex = /data-jsgui-control="dt_connection_point"[^>]*data-node-id="([^"]+)"[^>]*data-point-type="([^"]+)"(?:[^>]*data-branch="([^"]+)")?/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    points.push({
      nodeId: match[1],
      pointType: match[2],
      branch: match[3] || null
    });
  }
  return points;
}

/**
 * Parse HTML to find all nodes with their attributes
 */
function findNodes(html) {
  const nodes = [];
  const regex = /data-jsgui-control="dt_(branch|result)_node"[^>]*data-node-id="([^"]+)"(?:[^>]*data-parent-id="([^"]+)")?(?:[^>]*data-branch="([^"]+)")?/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    nodes.push({
      type: match[1],
      nodeId: match[2],
      parentId: match[3] || null,
      branch: match[4] || null
    });
  }
  return nodes;
}

async function runChecks() {
  console.log("🌲 Decision Tree Viewer - Comprehensive Check Script");
  console.log("====================================================\n");
  
  // 1. Model checks
  section("Data Model");
  
  const tree = createExampleTree();
  check("Tree created successfully", !!tree);
  check("Tree has id", typeof tree.id === "string");
  check("Tree has name", typeof tree.name === "string" && tree.name.length > 0);
  check("Tree has root node", !!tree.root);
  check("Root is branch node", tree.root.type === "branch");
  check("Root has yes branch", !!tree.root.yes);
  check("Root has no branch", !!tree.root.no);
  check("Root has condition", !!tree.root.condition);
  check("Condition has type", tree.root.condition.type === "url_matches");
  
  // Extract all nodes from tree
  const treeNodes = extractNodes(tree.root);
  const branchNodes = treeNodes.filter(n => n.type === "branch");
  const resultNodes = treeNodes.filter(n => n.type === "result");
  
  check("Tree has branch nodes", branchNodes.length > 0);
  check("Tree has result nodes", resultNodes.length > 0);
  check("All result nodes have result property", resultNodes.every(n => {
    const originalNode = findNodeById(tree.root, n.id);
    return typeof originalNode?.result === "boolean";
  }));
  
  console.log(`     (${branchNodes.length} branch nodes, ${resultNodes.length} result nodes)`);
  
  // 2. Control rendering checks
  section("Control Rendering");
  
  const context = createContext();
  const trees = [tree];
  const html = renderPage(context, trees);
  
  check("HTML rendered", typeof html === "string" && html.length > 0);
  check("HTML length reasonable", html.length > 1000);
  check("Contains DOCTYPE", html.includes("<!DOCTYPE html>"));
  check("Contains viewport meta", html.includes("viewport"));
  
  // CSS and structure
  check("Links decision-tree.css", html.includes("decision-tree.css"));
  check("Contains dt-viewer class", html.includes("dt-viewer"));
  check("Contains dt-header class", html.includes("dt-header"));
  check("Contains dt-panel class", html.includes("dt-panel"));
  check("Contains dt-canvas class", html.includes("dt-canvas"));
  check("Contains dt-tree class", html.includes("dt-tree"));
  check("Contains dt-level class", html.includes("dt-level"));
  check("Contains dt-node class", html.includes("dt-node"));
  
  // Node types
  check("Contains branch nodes", html.includes("dt-node--branch"));
  check("Contains result nodes", html.includes("dt-node--result"));
  
  // Tree list
  check("Contains tree list", html.includes("dt-tree-list"));
  check("Contains tree list item", html.includes("dt-tree-list-item"));
  
  // Industrial details
  check("Contains rivets", html.includes("dt-rivet"));
  
  // Data attributes
  check("Contains node-id data attribute", html.includes("data-node-id"));
  check("Contains node-type data attribute", html.includes("data-node-type"));
  check("Contains jsgui-control attribute", html.includes("data-jsgui-control"));
  
  // Client script
  check("Contains client bundle reference", html.includes("decision-tree-client.js"));

  // 2b. Dynamic rerender via tree setter (text fixture)
  const altTree = createExampleTree();
  altTree.id = "alt-tree";
  altTree.name = "Alternate Tree";
  altTree.root.label = "Alt Root";

  const control = new DecisionTreeControl({ context: createContext(), tree });
  const firstHtml = control.all_html_render();
  control.tree = altTree;
  const secondHtml = control.all_html_render();

  check(
    "Tree setter re-renders new tree",
    secondHtml.includes("data-tree-id=\"alt-tree\"")
  );
  check("Tree setter output contains connection points", secondHtml.includes("dt_connection_point"));

  // 2c. Multi-tree render (tree list) fixture
  const treeB = createExampleTree();
  treeB.id = "alt-tree-b";
  treeB.name = "Second Tree";
  const multiHtml = renderPage(createContext(), [tree, treeB]);
  const listItemMatches = multiHtml.match(/data-jsgui-control="dt_tree_list_item"/g) || [];
  check("Tree list renders both trees", multiHtml.includes(tree.name) && multiHtml.includes(treeB.name));
  check("Tree list item count >= 2", listItemMatches.length >= 2);
  
  // 3. Connection Point Verification
  section("Connection Points (Robust System)");
  
  const connectionPoints = findConnectionPoints(html);
  const htmlNodes = findNodes(html);
  
  check("Connection points rendered", connectionPoints.length > 0);
  console.log(`     (found ${connectionPoints.length} connection points)`);
  
  // Verify each branch node has correct connection points
  const htmlBranchNodes = htmlNodes.filter(n => n.type === "branch");
  const htmlResultNodes = htmlNodes.filter(n => n.type === "result");
  
  check("Branch nodes rendered", htmlBranchNodes.length > 0);
  check("Result nodes rendered", htmlResultNodes.length > 0);
  
  // Check each branch node has 3 connection points (input, yes-output, no-output)
  let branchPointsValid = true;
  htmlBranchNodes.forEach(node => {
    const nodePoints = connectionPoints.filter(p => p.nodeId === node.nodeId);
    const hasInput = nodePoints.some(p => p.pointType === "input-top");
    const hasYesOutput = nodePoints.some(p => p.pointType === "output-yes" && p.branch === "yes");
    const hasNoOutput = nodePoints.some(p => p.pointType === "output-no" && p.branch === "no");
    
    if (!hasInput || !hasYesOutput || !hasNoOutput) {
      console.log(`     ⚠️ Branch node ${node.nodeId} missing points: input=${hasInput}, yes=${hasYesOutput}, no=${hasNoOutput}`);
      branchPointsValid = false;
    }
  });
  check("Branch nodes have all connection points", branchPointsValid);
  
  // Check each result node has input connection point
  let resultPointsValid = true;
  htmlResultNodes.forEach(node => {
    const nodePoints = connectionPoints.filter(p => p.nodeId === node.nodeId);
    const hasInput = nodePoints.some(p => p.pointType === "input-top");
    
    if (!hasInput) {
      console.log(`     ⚠️ Result node ${node.nodeId} missing input point`);
      resultPointsValid = false;
    }
  });
  check("Result nodes have input connection points", resultPointsValid);
  
  // 4. Parent-Child Relationship Verification
  section("Parent-Child Relationships");
  
  // Verify each non-root node has parent-id and branch attributes
  const nonRootNodes = htmlNodes.filter(n => n.parentId);
  check("Non-root nodes have parent-id", nonRootNodes.length > 0);
  
  // Verify parent-child consistency
  let relationshipsValid = true;
  nonRootNodes.forEach(node => {
    // Find parent node
    const parentNode = htmlNodes.find(n => n.nodeId === node.parentId);
    if (!parentNode) {
      console.log(`     ⚠️ Node ${node.nodeId} references missing parent ${node.parentId}`);
      relationshipsValid = false;
      return;
    }
    
    // Verify branch attribute
    if (!node.branch || (node.branch !== "yes" && node.branch !== "no")) {
      console.log(`     ⚠️ Node ${node.nodeId} has invalid branch: ${node.branch}`);
      relationshipsValid = false;
    }
    
    // Verify parent has corresponding output point
    const outputType = node.branch === "yes" ? "output-yes" : "output-no";
    const parentOutputPoint = connectionPoints.find(p => 
      p.nodeId === node.parentId && 
      p.pointType === outputType && 
      p.branch === node.branch
    );
    
    if (!parentOutputPoint) {
      console.log(`     ⚠️ Parent ${node.parentId} missing ${outputType} point for child ${node.nodeId}`);
      relationshipsValid = false;
    }
  });
  check("Parent-child relationships valid", relationshipsValid);
  
  // Verify connection can be traced
  let connectionTraceValid = true;
  nonRootNodes.forEach(node => {
    // Find child's input point
    const childInputPoint = connectionPoints.find(p => 
      p.nodeId === node.nodeId && 
      p.pointType === "input-top"
    );
    
    if (!childInputPoint) {
      console.log(`     ⚠️ Child ${node.nodeId} missing input point for connection`);
      connectionTraceValid = false;
    }
  });
  check("All connections can be traced", connectionTraceValid);
  
  // 5. Control hierarchy checks
  section("Control Hierarchy");
  
  const viewerMatch = html.match(/data-jsgui-control="dt_viewer"/g);
  check("Has viewer control", viewerMatch && viewerMatch.length === 1);
  
  const treeListMatch = html.match(/data-jsgui-control="dt_tree_list"/g);
  check("Has tree list control", treeListMatch && treeListMatch.length === 1);
  
  const treeMatch = html.match(/data-jsgui-control="dt_tree"/g);
  check("Has tree control", treeMatch && treeMatch.length === 1);
  
  const nodeMatches = html.match(/data-jsgui-control="dt_(branch|result)_node"/g) || [];
  check("Has node controls", nodeMatches.length > 0);
  console.log(`     (found ${nodeMatches.length} nodes)`);
  
  const connectionPointMatches = html.match(/data-jsgui-control="dt_connection_point"/g) || [];
  check("Has connection point controls", connectionPointMatches.length > 0);
  console.log(`     (found ${connectionPointMatches.length} connection points)`);
  
  // 6. Connection integrity summary
  section("Connection Integrity Summary");
  
  const expectedConnections = nonRootNodes.length;
  const outputPoints = connectionPoints.filter(p => p.pointType.startsWith("output-"));
  const inputPoints = connectionPoints.filter(p => p.pointType === "input-top");
  
  console.log(`     Expected connections: ${expectedConnections}`);
  console.log(`     Output points: ${outputPoints.length}`);
  console.log(`     Input points: ${inputPoints.length}`);
  
  check("Output points >= expected connections", outputPoints.length >= expectedConnections);
  check("Input points >= expected connections", inputPoints.length >= expectedConnections);
  
  // 7. Write output file
  section("Output");
  
  try {
    fs.writeFileSync(OUTPUT_PATH, html, "utf8");
    check("HTML file written", true);
    console.log(`     Output: ${OUTPUT_PATH}`);
  } catch (err) {
    check("HTML file written", false);
    console.log(`     Error: ${err.message}`);
  }
  
  // Summary
  console.log("\n====================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log("\n❌ Some checks failed!");
    process.exit(1);
  } else {
    console.log("\n✅ All checks passed!");
    process.exit(0);
  }
}

/**
 * Find a node by ID in the tree
 */
function findNodeById(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  
  if (node.type === "branch") {
    const inYes = findNodeById(node.yes, id);
    if (inYes) return inYes;
    return findNodeById(node.no, id);
  }
  
  return null;
}

runChecks().catch(err => {
  console.error("Check script error:", err);
  process.exit(1);
});
