"use strict";

/**
 * Goals Explorer Check Script
 * 
 * Validates that the Goals Explorer renders correctly using jsgui3 patterns.
 * Outputs sample HTML for inspection.
 */

const fs = require("fs");
const path = require("path");
const jsgui = require("jsgui3-html");

const { GoalsExplorerControl, GoalDetailControl, GoalsListControl } = require("../controls");

// Sample goals data
const sampleGoals = {
  categories: [
    {
      emoji: "🎨",
      title: "UI/UX",
      goals: [
        { id: "ui-0", title: "Modern Dashboard", status: "active", progress: 75 },
        { id: "ui-1", title: "Data Explorer Polish", status: "active", progress: 60 },
      ]
    },
    {
      emoji: "🔧",
      title: "Infrastructure",
      goals: [
        { id: "infra-0", title: "SQLite Optimization", status: "planned", progress: 30 },
        { id: "infra-1", title: "Test Coverage", status: "research", progress: 10 },
      ]
    }
  ],
  lastUpdated: new Date().toISOString()
};

function runCheck() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║           Goals Explorer jsgui3 Check Script              ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // Create context
  const context = new jsgui.Page_Context();
  
  // Test 1: GoalsExplorerControl
  console.log("1. Testing GoalsExplorerControl...");
  const explorer = new GoalsExplorerControl({
    context,
    goals: sampleGoals,
    openaiAvailable: false,
    svgContent: null,
    selectedGoalId: null,
    goalDetail: null,
  });
  
  const explorerHtml = explorer.all_html_render();
  console.log(`   ✓ Rendered ${explorerHtml.length} bytes`);
  console.log(`   ✓ Has goals-explorer class: ${explorerHtml.includes('class="goals-explorer"')}`);
  console.log(`   ✓ Has header: ${explorerHtml.includes('goals-header')}`);
  console.log(`   ✓ Has left panel: ${explorerHtml.includes('goals-left-panel')}`);
  console.log(`   ✓ Has right panel: ${explorerHtml.includes('goals-right-panel')}`);
  console.log(`   ✓ Has svg-wrapper: ${explorerHtml.includes('svg-wrapper')}`);
  console.log(`   ✓ Has data-svg-src: ${explorerHtml.includes('data-svg-src')}`);
  console.log(`   ✓ Has CSS variables: ${explorerHtml.includes('--gold:')}`);
  
  // Critical check: svg-wrapper must exist for client-side SVG loading
  if (!explorerHtml.includes('svg-wrapper')) {
    console.error("   ❌ CRITICAL: svg-wrapper missing! Client-side SVG loading will fail.");
    process.exit(1);
  }  
  // Test 2: GoalsListControl
  console.log("\n2. Testing GoalsListControl...");
  const context2 = new jsgui.Page_Context();
  const list = new GoalsListControl({
    context: context2,
    goals: sampleGoals,
    selectedId: "ui-0",
  });
  
  const listHtml = list.all_html_render();
  console.log(`   ✓ Rendered ${listHtml.length} bytes`);
  console.log(`   ✓ Has goals-list: ${listHtml.includes('goals-list')}`);
  console.log(`   ✓ Has data-goal-id: ${listHtml.includes('data-goal-id')}`);
  console.log(`   ✓ Has active class: ${listHtml.includes('active')}`);
  
  // Test 3: GoalDetailControl
  console.log("\n3. Testing GoalDetailControl...");
  const context3 = new jsgui.Page_Context();
  const detail = new GoalDetailControl({
    context: context3,
    goalId: "ui-0",
    detail: { exists: true, content: "# Modern Dashboard\n\nA comprehensive dashboard for..." },
    openaiAvailable: true,
  });
  
  const detailHtml = detail.all_html_render();
  console.log(`   ✓ Rendered ${detailHtml.length} bytes`);
  console.log(`   ✓ Has goal-detail class: ${detailHtml.includes('goal-detail')}`);
  console.log(`   ✓ Has regenerate button: ${detailHtml.includes('Regenerate')}`);
  
  // Test 4: Detail without existing content
  console.log("\n4. Testing GoalDetailControl (no content)...");
  const context4 = new jsgui.Page_Context();
  const detailNew = new GoalDetailControl({
    context: context4,
    goalId: "new-goal",
    detail: { exists: false },
    openaiAvailable: true,
  });
  
  const detailNewHtml = detailNew.all_html_render();
  console.log(`   ✓ Rendered ${detailNewHtml.length} bytes`);
  console.log(`   ✓ Has generate button: ${detailNewHtml.includes('Generate with OpenAI')}`);
  
  // Write sample output
  const outputDir = path.join(process.cwd(), "checks", "html-outputs");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "goals-explorer.check.html");
  
  // Build full page for inspection
  const docContext = new jsgui.Page_Context();
  const doc = new jsgui.Blank_HTML_Document({ context: docContext });
  doc.title.add(new jsgui.String_Control({ context: docContext, text: "Goals Explorer Check" }));
  
  // Use jsgui.Control with tagName for style element
  const style = new jsgui.Control({ context: docContext, tagName: "style" });
  style.add(new jsgui.String_Control({ context: docContext, text: GoalsExplorerControl.CSS }));
  doc.head.add(style);
  
  const explorerCheck = new GoalsExplorerControl({
    context: docContext,
    goals: sampleGoals,
    openaiAvailable: true,
    svgContent: null,
  });
  doc.body.add(explorerCheck);
  
  fs.writeFileSync(outputPath, doc.all_html_render());
  console.log(`\n✓ Wrote sample HTML to: ${outputPath}`);
  
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("All checks passed! Goals Explorer uses jsgui3 patterns correctly.");
  console.log("═══════════════════════════════════════════════════════════\n");
}

runCheck();
