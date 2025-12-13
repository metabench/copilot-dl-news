const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

describe("svg-collisions (strict) — z-server UX/IPC map", () => {
  test("docs/sessions/2025-12-13-z-server-ux-map/z-server-ux-ipc-map.svg has zero collisions", () => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const toolPath = path.join(repoRoot, "tools", "dev", "svg-collisions.js");
    const svgPath = path.join(
      repoRoot,
      "docs",
      "sessions",
      "2025-12-13-z-server-ux-map",
      "z-server-ux-ipc-map.svg"
    );

    expect(fs.existsSync(toolPath)).toBe(true);
    expect(fs.existsSync(svgPath)).toBe(true);

    const result = spawnSync(
      process.execPath,
      [toolPath, svgPath, "--strict", "--json"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024
      }
    );

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(
        [
          `svg-collisions exited with code ${result.status}`,
          "--- stderr ---",
          result.stderr || "(empty)",
          "--- stdout ---",
          result.stdout || "(empty)"
        ].join("\n")
      );
    }

    let payload;
    try {
      payload = JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(
        [
          "svg-collisions did not output valid JSON",
          String(error),
          "--- stdout ---",
          result.stdout || "(empty)",
          "--- stderr ---",
          result.stderr || "(empty)"
        ].join("\n")
      );
    }

    expect(payload.summary.total).toBe(0);
  });
});
