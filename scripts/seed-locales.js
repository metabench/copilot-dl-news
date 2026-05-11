#!/usr/bin/env node
"use strict";

const { openNewsCrawlerDb } = require("../src/db/openNewsCrawlerDb");
const { upsertDomainLocaleRows } = require("news-crawler-db");

const domains = [
  { host: "www.eltiempo.com", country: "CO" },
  { host: "www.eluniversal.com", country: "VE" },
  { host: "www.semana.com", country: "CO" }
];

async function main() {
  const db = openNewsCrawlerDb("data/news.db");
  try {
    upsertDomainLocaleRows(db, domains);
    for (const domain of domains) {
      console.log(`Seeded locale for ${domain.host}`);
    }
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Failed to seed locales:", error.message);
    process.exit(1);
  });
}
