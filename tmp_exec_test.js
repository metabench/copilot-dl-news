const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const recipeFile = path.join(__dirname, "tests/fixtures/smoke-tests/recipes/variable-test.json");
console.log("exists", fs.existsSync(recipeFile));
try {
  const out = execSync(`node tools/dev/js-edit.js --recipe "${recipeFile}" --param message="custom message" --json 2>&1`, {
    encoding: "utf-8",
    cwd: __dirname,
    windowsHide: true
  });
  console.log("output:", out);
} catch (error) {
  console.error("error stdout:", error.stdout ? error.stdout.toString() : "");
  console.error("error stderr:", error.stderr ? error.stderr.toString() : "");
  console.error("error message:", error.message);
}
