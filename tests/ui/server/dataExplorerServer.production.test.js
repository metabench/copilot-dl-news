"use strict";

// Mock jsdom to avoid parse5 ESM-only import issue in Jest
jest.mock('jsdom', () => ({
  JSDOM: jest.fn().mockImplementation(() => ({
    window: { document: { querySelector: jest.fn().mockReturnValue(null) } }
  }))
}));

const fs = require("fs");
const path = require("path");
const request = require("supertest");
const Database = require("better-sqlite3");

const { createDataExplorerServer } = require("../../../src/ui/server/dataExplorerServer");

const DB_PATH = path.resolve(__dirname, "../../../data/news.db");
const DB_EXISTS = fs.existsSync(DB_PATH);
const describeIfDb = DB_EXISTS ? describe : describe.skip;

describeIfDb("dataExplorerServer production snapshot coverage", () => {
  let server;

  beforeAll(() => {
    server = createDataExplorerServer({ dbPath: DB_PATH, pageSize: 40 });
  });

  afterAll(() => {
    if (server && typeof server.close === "function") {
      server.close();
    }
  });

  const routes = [
    { path: "/urls", title: "Crawler URL Snapshot" },
    { path: "/domains", title: "Recent Domain Activity" },
    { path: "/crawls", title: "Recent Crawl Jobs" },
    { path: "/errors", title: "Recent Crawl Errors" },
    { path: "/decisions", title: "Crawler Decisions" }
  ];

  routes.forEach(({ path: route, title }) => {
    test(`renders ${route} using production data snapshot`, async () => {
      const response = await request(server.app).get(route);
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/html/);
      expect(response.text).toContain(title);
      expect(response.text).not.toContain("Internal server error");
    });
  });

  test("host drilldown responds for known host from snapshot", async () => {
    const db = new Database(DB_PATH, { readonly: true });
    const hostRow = db.prepare("SELECT LOWER(host) AS host FROM urls WHERE host IS NOT NULL AND TRIM(host) <> '' LIMIT 1").get();
    db.close();
    expect(hostRow && hostRow.host).toBeTruthy();
    const host = hostRow.host;
    const detailResponse = await request(server.app).get(`/domains/${encodeURIComponent(host)}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.text).toContain(`Domain: ${host}`);
  }, 30000);
});
