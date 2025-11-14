#!/usr/bin/env node
const puppeteer = require("puppeteer");
const { createDataExplorerServer } = require("../../src/ui/server/dataExplorerServer");

async function run() {
  const host = "127.0.0.1";
  const port = 4600;
  const { app, close } = createDataExplorerServer();
  const server = app.listen(port, host, () => {
    console.log(`Crawler data explorer listening on http://${host}:${port}/urls`);
  });

  let browser;
  try {
    browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    page.on("console", (msg) => {
      console.log(`[page console:${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err) => {
      console.error(`[pageerror] ${err && err.stack ? err.stack : err}`);
    });
    page.on("requestfailed", (request) => {
      const failure = request.failure();
      console.error(`[requestfailed] ${request.url()} :: ${failure ? failure.errorText : "unknown"}`);
    });
    page.on("response", (response) => {
      const status = response.status();
      if (status >= 400) {
        console.error(`[response ${status}] ${response.url()}`);
      }
    });
    await page.goto(`http://${host}:${port}/urls`, { waitUntil: "networkidle2" });
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error("Failed to capture console from page:", error);
  } finally {
    if (browser) await browser.close();
    server.close(() => {
      close();
      console.log("Crawler data explorer shut down.");
    });
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
