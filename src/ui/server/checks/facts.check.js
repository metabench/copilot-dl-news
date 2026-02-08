"use strict";

/**
 * Facts Server Check Script
 * 
 * Validates that the Facts Server renders correctly with the
 * Industrial Luxury Obsidian theme.
 */

const path = require("path");
const fs = require("fs");
const { createServer, renderFactsPage } = require("../factsServer");

function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" Facts Server Check - Industrial Luxury Obsidian Theme");
  console.log("═══════════════════════════════════════════════════════════");
  console.log();

  // Test 1: Render page with mock data
  console.log("1. Testing renderFactsPage with mock data...");
  
  const mockUrls = [
    { id: 1, url: "https://example.com/article/2024/01/test-article", host: "example.com", savedAt: "2024-01-15T10:30:00Z" },
    { id: 2, url: "https://news.site/breaking/story", host: "news.site", savedAt: "2024-01-15T09:15:00Z" },
    { id: 3, url: "https://blog.dev/posts/typescript-guide", host: "blog.dev", savedAt: "2024-01-14T18:45:00Z" }
  ];

  const mockPagination = {
    currentPage: 1,
    totalPages: 10,
    totalRows: 1000,
    pageSize: 100,
    startRow: 1,
    endRow: 3
  };

  try {
    const html = renderFactsPage({
      urls: mockUrls,
      pagination: mockPagination,
      title: "Facts Check",
      basePath: "/"
    });

    console.log("   ✓ Page rendered successfully");
    console.log(`   ✓ HTML length: ${html.length} characters`);

    // Validate key elements
    const checks = [
      { pattern: "luxury-obsidian", desc: "Body class" },
      { pattern: "--lux-gold:", desc: "CSS variables" },
      { pattern: "Fact Determination Layer", desc: "Title" },
      { pattern: "lux-hero", desc: "Hero section" },
      { pattern: "lux-panel", desc: "Panel component" },
      { pattern: "lux-table", desc: "Table component" },
      { pattern: "lux-stat", desc: "Stats cards" },
      { pattern: "example.com", desc: "Mock URL data" },
      { pattern: "lux-pager", desc: "Pagination" }
    ];

    let allPassed = true;
    checks.forEach(check => {
      if (html.includes(check.pattern)) {
        console.log(`   ✓ Found: ${check.desc}`);
      } else {
        console.log(`   ✗ Missing: ${check.desc}`);
        allPassed = false;
      }
    });

    // Save check output
      const outputDir = path.join(process.cwd(), "checks", "html-outputs");
      fs.mkdirSync(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, "facts.check.html");
    fs.writeFileSync(outputPath, html, "utf8");
    console.log(`   ✓ Saved check HTML to: ${path.relative(process.cwd(), outputPath)}`);
    console.log();

    if (allPassed) {
      console.log("═══════════════════════════════════════════════════════════");
      console.log(" ✓ All checks passed!");
      console.log("═══════════════════════════════════════════════════════════");
      process.exit(0);
    } else {
      console.log("═══════════════════════════════════════════════════════════");
      console.log(" ✗ Some checks failed");
      console.log("═══════════════════════════════════════════════════════════");
      process.exit(1);
    }

  } catch (err) {
    console.error("   ✗ Error rendering page:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
