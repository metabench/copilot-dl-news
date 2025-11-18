"use strict";

const fs = require("fs");
const path = require("path");
const jsgui = require("jsgui3-html");

const { openNewsDb } = require("../db/dbAccess");
const { findProjectRoot } = require("../utils/project-root");
const { selectInitialUrls, countUrls } = require("../db/sqlite/v1/queries/ui/urlListingNormalized");
const {
  UrlListingTableControl,
  buildColumns,
  buildDisplayRows,
  buildIndexCell,
  formatDateTime
} = require("./controls/UrlListingTable");
const { PagerButtonControl } = require("./controls/PagerButton");
const { SparklineControl } = require("./controls");
const { UrlFilterToggleControl } = require("./controls/UrlFilterToggle");
const { buildHomeCards } = require("./homeCards");
const { createHomeCardLoaders } = require("./homeCardData");

const StringControl = jsgui.String_Control;

const DOMAIN_WINDOW_SIZE = 4000;
const DOMAIN_LIMIT = 40;
const HOME_CARD_CRAWL_LIMIT = 12;
const HOME_CARD_ERROR_LIMIT = 50;

function parseArgs(argv) {
  const args = {};
  const normalized = Array.isArray(argv) ? argv.slice() : [];
  for (let i = 0; i < normalized.length; i += 1) {
    const token = normalized[i];
    if (!token) continue;
    switch (token) {
      case "--db":
      case "-d":
        args.db = normalized[++i];
        break;
      case "--limit":
      case "-l":
        args.limit = Number(normalized[++i]);
        break;
      case "--output":
      case "-o":
        args.output = normalized[++i];
        break;
      case "--title":
        args.title = normalized[++i];
        break;
      default:
        if (token.startsWith("--")) {
          const [key, value] = token.split("=");
          if (key === "--db" && value) args.db = value;
          if (key === "--limit" && value) args.limit = Number(value);
          if (key === "--output" && value) args.output = value;
          if (key === "--title" && value) args.title = value;
        }
        break;
    }
  }
  return args;
}

function resolveDbPath(cliPath) {
  const projectRoot = findProjectRoot(__dirname);
  if (cliPath) {
    return path.isAbsolute(cliPath) ? cliPath : path.resolve(process.cwd(), cliPath);
  }
  return path.join(projectRoot, "data", "news.db");
}

function buildUrlTotals(dbHandle) {
  if (!dbHandle) return null;
  try {
    const totalRows = countUrls(dbHandle);
    return {
      source: "live",
      totalRows,
      cache: null
    };
  } catch (_) {
    return null;
  }
}

function buildCliHomeCards(dbHandle, totals) {
  if (!dbHandle) {
    return buildHomeCards({ totals });
  }
  try {
    const loaders = createHomeCardLoaders({
      db: dbHandle,
      domainWindowSize: DOMAIN_WINDOW_SIZE,
      domainLimit: DOMAIN_LIMIT,
      crawlLimit: HOME_CARD_CRAWL_LIMIT,
      errorLimit: HOME_CARD_ERROR_LIMIT
    });
    return buildHomeCards({ totals, loaders });
  } catch (_) {
    return buildHomeCards({ totals });
  }
}
