"use strict";

/**
 * Documentation Tree Builder
 * 
 * Scans a directory and builds a hierarchical tree structure
 * of all markdown documentation files.
 */

const fs = require("fs");
const path = require("path");

/**
 * File extensions to include in the documentation tree
 */
const INCLUDE_EXTENSIONS = new Set([".md", ".svg"]);

/**
 * Directories to exclude from scanning
 */
const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".vscode",
  "tmp",
  "cache",
  ".ai-cache"
]);

/**
 * Build a documentation tree from a directory
 * @param {string} dirPath - Path to documentation directory
 * @returns {Array} Tree structure of docs
 */
function buildDocTree(dirPath) {
  const absolutePath = path.resolve(dirPath);
  
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  return scanDirectory(absolutePath, absolutePath);
}

/**
 * Recursively scan a directory for documentation files
 * @param {string} currentPath - Current directory being scanned
 * @param {string} rootPath - Root documentation directory
 * @returns {Array} Array of tree nodes
 */
function scanDirectory(currentPath, rootPath) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  const nodes = [];

  // Separate folders and files
  const folders = [];
  const files = [];

  for (const entry of entries) {
    // Skip hidden files/folders
    if (entry.name.startsWith(".")) {
      continue;
    }

    if (entry.isDirectory()) {
      // Skip excluded directories
      if (EXCLUDE_DIRS.has(entry.name)) {
        continue;
      }
      folders.push(entry);
    } else if (entry.isFile()) {
      // Only include files with valid extensions
      const ext = path.extname(entry.name).toLowerCase();
      if (INCLUDE_EXTENSIONS.has(ext)) {
        files.push(entry);
      }
    }
  }

  // Sort folders and files alphabetically
  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  // Process folders first
  for (const folder of folders) {
    const folderPath = path.join(currentPath, folder.name);
    const children = scanDirectory(folderPath, rootPath);
    
    // Only include folders that have content
    if (children.length > 0) {
      nodes.push({
        type: "folder",
        name: folder.name,
        path: path.relative(rootPath, folderPath),
        children
      });
    }
  }

  // Then process files
  for (const file of files) {
    const filePath = path.join(currentPath, file.name);
    const relativePath = path.relative(rootPath, filePath);
    
    nodes.push({
      type: "file",
      name: file.name,
      path: relativePath.replace(/\\/g, "/"), // Normalize path separators
      extension: path.extname(file.name).toLowerCase()
    });
  }

  return nodes;
}

/**
 * Find a node in the tree by path
 * @param {Array} tree - Documentation tree
 * @param {string} targetPath - Path to find
 * @returns {Object|null} The found node or null
 */
function findNodeByPath(tree, targetPath) {
  for (const node of tree) {
    if (node.path === targetPath) {
      return node;
    }
    if (node.children) {
      const found = findNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Get all file paths from the tree (flattened)
 * @param {Array} tree - Documentation tree
 * @returns {Array<string>} Array of file paths
 */
function getAllFilePaths(tree) {
  const paths = [];
  
  function walk(nodes) {
    for (const node of nodes) {
      if (node.type === "file") {
        paths.push(node.path);
      }
      if (node.children) {
        walk(node.children);
      }
    }
  }
  
  walk(tree);
  return paths;
}

/**
 * Count total files in the tree
 * @param {Array} tree - Documentation tree
 * @returns {number} Total file count
 */
function countFiles(tree) {
  let count = 0;
  
  function walk(nodes) {
    for (const node of nodes) {
      if (node.type === "file") {
        count++;
      }
      if (node.children) {
        walk(node.children);
      }
    }
  }
  
  walk(tree);
  return count;
}

module.exports = {
  buildDocTree,
  findNodeByPath,
  getAllFilePaths,
  countFiles,
  INCLUDE_EXTENSIONS,
  EXCLUDE_DIRS
};
