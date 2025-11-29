"use strict";

/**
 * File Tree Builder (Shared Utility)
 * 
 * Scans a directory and builds a hierarchical tree structure
 * of files. Used by documentation viewers, design studios, etc.
 * 
 * Originally extracted from docsViewer/utils/docTree.js
 */

const fs = require("fs");
const path = require("path");

/**
 * Default file extensions to include
 */
const DEFAULT_EXTENSIONS = new Set([".md", ".svg"]);

/**
 * Directories to exclude from scanning
 */
const DEFAULT_EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".vscode",
  "tmp",
  "cache",
  ".ai-cache"
]);

/**
 * Build a file tree from a directory
 * @param {string} dirPath - Path to directory
 * @param {Object} options - Configuration options
 * @param {Set<string>|Array<string>} options.extensions - File extensions to include (default: .md, .svg)
 * @param {Set<string>|Array<string>} options.excludeDirs - Directories to exclude
 * @param {boolean} options.includeHidden - Whether to include hidden files/folders (default: false)
 * @returns {Array} Tree structure of files
 */
function buildFileTree(dirPath, options = {}) {
  const absolutePath = path.resolve(dirPath);
  
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  // Convert arrays to Sets if needed
  let extensions = options.extensions || DEFAULT_EXTENSIONS;
  let excludeDirs = options.excludeDirs || DEFAULT_EXCLUDE_DIRS;
  
  if (Array.isArray(extensions)) {
    extensions = new Set(extensions);
  }
  if (Array.isArray(excludeDirs)) {
    excludeDirs = new Set(excludeDirs);
  }
  
  const includeHidden = options.includeHidden || false;

  return scanDirectory(absolutePath, absolutePath, extensions, excludeDirs, includeHidden);
}

/**
 * Recursively scan a directory for files
 * @param {string} currentPath - Current directory being scanned
 * @param {string} rootPath - Root directory
 * @param {Set<string>} extensions - Extensions to include
 * @param {Set<string>} excludeDirs - Directories to exclude
 * @param {boolean} includeHidden - Whether to include hidden files/folders
 * @returns {Array} Array of tree nodes
 */
function scanDirectory(currentPath, rootPath, extensions, excludeDirs, includeHidden = false) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  const nodes = [];

  // Separate folders and files
  const folders = [];
  const files = [];

  for (const entry of entries) {
    // Skip hidden files/folders unless explicitly included
    if (!includeHidden && entry.name.startsWith(".")) {
      continue;
    }

    if (entry.isDirectory()) {
      // Skip excluded directories
      if (excludeDirs.has(entry.name)) {
        continue;
      }
      folders.push(entry);
    } else if (entry.isFile()) {
      // Only include files with valid extensions
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.has(ext)) {
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
    const children = scanDirectory(folderPath, rootPath, extensions, excludeDirs, includeHidden);
    
    // Only include folders that have content
    if (children.length > 0) {
      // Get folder mtime (latest file within)
      const folderMtime = getLatestMtime(children);
      nodes.push({
        type: "folder",
        name: folder.name,
        path: path.relative(rootPath, folderPath),
        mtime: folderMtime,
        children
      });
    }
  }

  // Then process files
  for (const file of files) {
    const filePath = path.join(currentPath, file.name);
    const relativePath = path.relative(rootPath, filePath);
    
    // Get file modification time
    let mtime = null;
    try {
      const stats = fs.statSync(filePath);
      mtime = stats.mtime.toISOString();
    } catch (e) {
      // Ignore stat errors
    }
    
    nodes.push({
      type: "file",
      name: file.name,
      path: relativePath.replace(/\\/g, "/"), // Normalize path separators
      extension: path.extname(file.name).toLowerCase(),
      mtime
    });
  }

  return nodes;
}

/**
 * Get the latest mtime from a list of nodes (for folder mtime calculation)
 * @param {Array} nodes - Array of tree nodes
 * @returns {string|null} ISO date string of latest mtime
 */
function getLatestMtime(nodes) {
  let latest = null;
  for (const node of nodes) {
    if (node.mtime) {
      if (!latest || node.mtime > latest) {
        latest = node.mtime;
      }
    }
    if (node.children) {
      const childLatest = getLatestMtime(node.children);
      if (childLatest && (!latest || childLatest > latest)) {
        latest = childLatest;
      }
    }
  }
  return latest;
}

/**
 * Find a node in the tree by path
 * @param {Array} tree - File tree
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
 * @param {Array} tree - File tree
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
 * @param {Array} tree - File tree
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

/**
 * Sort tree nodes by a given field
 * @param {Array} tree - File tree
 * @param {string} sortBy - Field to sort by ('name' or 'mtime')
 * @param {string} sortOrder - Sort order ('asc' or 'desc')
 * @returns {Array} Sorted tree (mutates original)
 */
function sortTree(tree, sortBy = 'name', sortOrder = 'asc') {
  const comparator = (a, b) => {
    // Folders always come before files when sorting by name
    if (sortBy === 'name') {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
    }
    
    let valA, valB;
    
    if (sortBy === 'mtime') {
      valA = a.mtime || '';
      valB = b.mtime || '';
    } else {
      valA = (a.name || '').toLowerCase();
      valB = (b.name || '').toLowerCase();
    }
    
    let result;
    if (valA < valB) result = -1;
    else if (valA > valB) result = 1;
    else result = 0;
    
    return sortOrder === 'desc' ? -result : result;
  };
  
  tree.sort(comparator);
  
  // Recursively sort children
  for (const node of tree) {
    if (node.children && node.children.length > 0) {
      sortTree(node.children, sortBy, sortOrder);
    }
  }
  
  return tree;
}

module.exports = {
  buildFileTree,
  findNodeByPath,
  getAllFilePaths,
  countFiles,
  sortTree,
  DEFAULT_EXTENSIONS,
  DEFAULT_EXCLUDE_DIRS
};
