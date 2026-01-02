"use strict";

const {
  getFreePort,
  crawlPages,
  spawnGuardianFixture,
  waitForHttpOk,
  stopChild,
  sleep
} = require("../helpers/guardianFixtureCrawl");

test(
  "guardian-like fixture crawl reaches 100 pages",
  async () => {
    const pages = 100;
    const port = await getFreePort();

    const { child, getLogs } = spawnGuardianFixture({ port, pages });

    try {
      const baseUrl = `http://127.0.0.1:${port}`;
      const ready = await waitForHttpOk(`${baseUrl}/`);

      if (!ready) {
        const { stderr } = getLogs();
        throw new Error(
          `guardian fixture did not become ready at ${baseUrl} (stderr: ${String(stderr || "").slice(-800)})`
        );
      }

      const result = await crawlPages({
        startUrl: `${baseUrl}/page/1`,
        maxPages: pages,
        concurrency: 15
      });

      expect(result.visitedCount).toBe(pages);
    } finally {
      stopChild(child);
      await sleep(50);
      if (child && !child.killed) {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    }
  },
  60000
);
