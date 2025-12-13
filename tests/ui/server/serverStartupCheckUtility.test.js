"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

describe("serverStartupCheck utility (--check contract)", () => {
  test("handleStartupCheck starts and exits cleanly", () => {
    const runnerPath = path.resolve(__dirname, "..", "..", "fixtures", "servers", "serverStartupCheckRunner.js");

    const result = spawnSync(process.execPath, [runnerPath], {
      encoding: "utf-8",
      env: {
        ...process.env,
        SERVER_NAME: "fixture-minimal"
      }
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  });
});
