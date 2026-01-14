"use strict";

const ArticleSignalsService = require("../../../src/core/crawler/ArticleSignalsService");

describe("ArticleSignalsService (config-driven patterns)", () => {
  test("uses defaults when no config provided", () => {
    const svc = new ArticleSignalsService({ baseUrl: "https://example.com" });

    expect(svc.looksLikeArticle("https://example.com/login")).toBe(false);
    expect(svc.looksLikeArticle("https://example.com/news/story-123")).toBe(true);
    expect(svc.looksLikeArticle("https://example.com/2025/12/15/story")).toBe(true);
  });

  test("respects decisionConfigSet.articleSignals overrides", () => {
    const svc = new ArticleSignalsService({
      decisionConfigSet: {
        articleSignals: {
          skipPatterns: ["/news"],
          articlePatterns: ["/feature"],
          datePathRegex: "\\/\\d{4}-\\d{2}-\\d{2}\\/"
        }
      }
    });

    expect(svc.looksLikeArticle("https://example.com/news/story-123")).toBe(false);
    expect(svc.looksLikeArticle("https://example.com/feature/story-123")).toBe(true);
    expect(svc.looksLikeArticle("https://example.com/2025-12-15/story")).toBe(true);
  });

  test("falls back to default date regex on invalid datePathRegex", () => {
    const svc = new ArticleSignalsService({
      decisionConfigSet: {
        articleSignals: {
          datePathRegex: "["
        }
      }
    });

    expect(svc.looksLikeArticle("https://example.com/2025/12/15/story")).toBe(true);
  });
});

