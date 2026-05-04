"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { buildPrunePlan } = require("../src/tools/largeArtifactsPruner");

const repoRoot = path.resolve(__dirname, "..");
const fixtureRoot = path.join(repoRoot, "tmp", "large-artifacts-pruner-check");

function writeFile(relPath, content = "x") {
  const fullPath = path.join(fixtureRoot, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
}

function relSet(files) {
  return new Set(files.map((file) => file.rel));
}

async function run() {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });

  try {
    writeFile("screenshots/ui-run/old.png", "screenshot");
    writeFile("docs/sessions/2026-05-04-demo/screenshots/keep.png", "doc screenshot");
    writeFile("migration-temp/export.json", "temp");
    writeFile("data/news.db", "db");
    writeFile("data/news.db-wal", "wal");

    const defaultPlan = await buildPrunePlan({ repoRoot: fixtureRoot });
    const defaultDeletes = relSet(defaultPlan.deletions);

    assert(defaultDeletes.has("screenshots/ui-run/old.png"), "root screenshot output should be prunable by default");
    assert(defaultDeletes.has("migration-temp/export.json"), "migration-temp should remain prunable");
    assert(!defaultDeletes.has("docs/sessions/2026-05-04-demo/screenshots/keep.png"), "docs screenshots should not be swept by default");
    assert(!defaultDeletes.has("data/news.db"), "production DB keep list should be preserved");
    assert(!defaultDeletes.has("data/news.db-wal"), "production DB sidecar keep list should be preserved");

    const protectedPlan = await buildPrunePlan({
      repoRoot: fixtureRoot,
      exportDirs: [],
      deleteDirs: ["docs/sessions", "wip/labs", "src/deprecated-ui"]
    });

    assert.strictEqual(protectedPlan.deletions.length, 0, "protected source/docs roots should not be deletion candidates");
    assert.strictEqual(protectedPlan.skippedRoots.length, 3, "protected roots should be reported as skipped");

    const allowedPlan = await buildPrunePlan({
      repoRoot: fixtureRoot,
      exportDirs: [],
      deleteDirs: ["docs/sessions"],
      allowProtectedRoots: true
    });

    assert(relSet(allowedPlan.deletions).has("docs/sessions/2026-05-04-demo/screenshots/keep.png"), "explicit protected override should be possible for deliberate maintenance");

    console.log("large-artifacts-pruner.check: ok");
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});