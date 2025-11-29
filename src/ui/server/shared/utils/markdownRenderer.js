"use strict";

/**
 * Markdown Renderer Utility (Shared)
 * 
 * Renders markdown content to HTML using markdown-it.
 * Includes support for syntax highlighting, tables, and GitHub-flavored markdown.
 * 
 * Originally extracted from docsViewer/utils/markdownRenderer.js
 */

let md = null;

/**
 * Get or create markdown-it instance
 * @returns {Object} markdown-it instance
 */
function getMarkdownIt() {
  if (!md) {
    try {
      const MarkdownIt = require("markdown-it");
      md = new MarkdownIt({
        html: true,        // Allow HTML in source
        linkify: true,     // Auto-convert URLs to links
        typographer: true, // Smart quotes and dashes
        breaks: false      // Don't convert \n to <br>
      });
    } catch (e) {
      // Fall back to simple parser if markdown-it not available
      md = null;
    }
  }
  return md;
}

/**
 * Render markdown to HTML
 * @param {string} markdown - Raw markdown content
 * @returns {{ title: string, html: string }}
 */
function renderMarkdown(markdown) {
  if (!markdown) {
    return { title: "", html: "" };
  }

  // Extract title from first heading
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Convert markdown to HTML
  const html = markdownToHtml(markdown);

  return { title, html };
}

/**
 * Simple markdown to HTML converter
 * Uses markdown-it if available, otherwise falls back to simple regex-based parsing
 */
function markdownToHtml(mdContent) {
  const markdownIt = getMarkdownIt();
  
  if (markdownIt) {
    // Use markdown-it for high-quality rendering
    return markdownIt.render(mdContent);
  }
  
  // Fallback: simple regex-based parser
  return simpleMdToHtml(mdContent);
}

/**
 * Simple fallback markdown to HTML converter
 * Handles common markdown elements without external dependencies
 */
function simpleMdToHtml(md) {
  let html = escapeHtml(md);

  // Code blocks (fenced)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const langClass = lang ? ` class="language-${lang}"` : "";
    return `<pre><code${langClass}>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  // Horizontal rules
  html = html.replace(/^[-*_]{3,}$/gm, "<hr>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/_(.+?)_/g, "<em>$1</em>");

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, "<blockquote>$1</blockquote>");
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, "\n");

  // Unordered lists
  html = html.replace(/^[\*\-]\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");

  // Tables
  html = convertTables(html);

  // Paragraphs - wrap text blocks that aren't already wrapped
  html = html.replace(/^([^<\n].+)$/gm, (match, content) => {
    // Don't wrap if it starts with a tag or is empty
    if (content.match(/^</) || content.trim() === "") {
      return match;
    }
    return `<p>${content}</p>`;
  });

  // Clean up multiple newlines
  html = html.replace(/\n{3,}/g, "\n\n");
  
  // Convert remaining newlines within content
  html = html.replace(/\n/g, "\n");

  return html;
}

/**
 * Convert markdown tables to HTML
 */
function convertTables(html) {
  const lines = html.split("\n");
  const result = [];
  let inTable = false;
  let tableRows = [];

  for (const line of lines) {
    // Check if this is a table row (contains |)
    if (line.includes("|") && line.trim().startsWith("|")) {
      // Skip separator row (contains dashes)
      if (line.match(/^\|[\s\-:|]+\|$/)) {
        continue;
      }
      
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      
      // Parse cells
      const cells = line
        .split("|")
        .filter((cell, i, arr) => i > 0 && i < arr.length - 1)
        .map(cell => cell.trim());
      
      tableRows.push(cells);
    } else {
      // End of table
      if (inTable) {
        result.push(buildTableHtml(tableRows));
        inTable = false;
        tableRows = [];
      }
      result.push(line);
    }
  }

  // Handle table at end of content
  if (inTable && tableRows.length > 0) {
    result.push(buildTableHtml(tableRows));
  }

  return result.join("\n");
}

/**
 * Build HTML table from parsed rows
 */
function buildTableHtml(rows) {
  if (rows.length === 0) return "";

  const headerRow = rows[0];
  const bodyRows = rows.slice(1);

  let html = '<table class="content-table">';
  
  // Header
  html += "<thead><tr>";
  for (const cell of headerRow) {
    html += `<th>${cell}</th>`;
  }
  html += "</tr></thead>";

  // Body
  if (bodyRows.length > 0) {
    html += "<tbody>";
    for (const row of bodyRows) {
      html += "<tr>";
      for (const cell of row) {
        html += `<td>${cell}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody>";
  }

  html += "</table>";
  return html;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = { renderMarkdown, markdownToHtml };
