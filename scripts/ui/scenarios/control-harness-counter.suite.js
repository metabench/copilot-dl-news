"use strict";

const fs = require("fs");
const path = require("path");

const { createControlHarnessServer } = require("../../../src/ui/server/controlHarness/server");

function ensureBuiltClientBundle() {
  const bundlePath = path.join(
    process.cwd(),
    "src",
    "ui",
    "server",
    "controlHarness",
    "public",
    "control-harness-client.js"
  );

  if (fs.existsSync(bundlePath)) return;

  const { spawnSync } = require("child_process");

  const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "build-control-harness-client.js")], {
    stdio: "inherit",
    cwd: process.cwd()
  });

  if (result.status !== 0 || !fs.existsSync(bundlePath)) {
    throw new Error("Failed to build control harness client bundle");
  }
}

async function startServer() {
  ensureBuiltClientBundle();

  const { app, close } = createControlHarnessServer();

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    async shutdown() {
      await new Promise((resolve) => server.close(resolve));
      close();
    }
  };
}

async function waitForHydration(page, timeoutMs = 15000) {
  await page.waitForFunction(
    () => {
      const registry = window.__COPILOT_REGISTERED_CONTROLS__;
      return (
        window.__COPILOT_CONTROL_HARNESS_INITIALIZED__ === true &&
        window.__COPILOT_CONTROL_HARNESS_READY__ === true &&
        Array.isArray(registry) &&
        registry.includes("counter_demo")
      );
    },
    { timeout: timeoutMs }
  );
}

module.exports = {
  startServer,
  scenarios: [
    {
      id: "001",
      name: "Counter control hydrates",
      url: "/",
      waitUntil: "load",
      waitForSelector: ".counter-demo__btn",
      async assert({ page }) {
        await waitForHydration(page);
        const text = await page.$eval(".counter-demo__value", (el) => el.textContent.trim());
        if (text !== "0") throw new Error(`Expected counter value 0, got ${text}`);
      }
    },
    {
      id: "002",
      name: "Click increments count",
      url: "/",
      waitUntil: "load",
      waitForSelector: ".counter-demo__btn",
      async run({ page }) {
        await waitForHydration(page);
        await page.click(".counter-demo__btn");
      },
      async assert({ page }) {
        await page.waitForFunction(() => document.querySelector(".counter-demo__value")?.textContent?.trim() === "1", {
          timeout: 5000
        });
      }
    },
    {
      id: "003",
      name: "Reset restores zero",
      url: "/",
      waitUntil: "load",
      waitForSelector: ".counter-demo__btn",
      async run({ page }) {
        await waitForHydration(page);
        await page.click(".counter-demo__btn");
        await page.click(".counter-demo__btn");
        await page.waitForFunction(() => document.querySelector(".counter-demo__value")?.textContent?.trim() === "2", {
          timeout: 5000
        });
        await page.click(".counter-demo__reset");
      },
      async assert({ page }) {
        await page.waitForFunction(
          () => {
            const value = document.querySelector(".counter-demo__value")?.textContent?.trim();
            const countAttr = document.querySelector(".counter-demo")?.getAttribute("data-count");
            return value === "0" && countAttr === "0";
          },
          { timeout: 5000 }
        );
      }
    }
  ]
};
