const { buildHomeCards } = require("../../src/ui/homeCards");

describe("buildHomeCards", () => {
  const sampleTime = new Date("2025-11-15T12:00:00Z");

  it("builds cards with badges, hints, and deeplinks when data is available", () => {
    const cards = buildHomeCards({
      totals: {
        totalRows: 2450,
        source: "cache",
        cache: {
          generatedAt: sampleTime,
          statKey: "urls.total_count",
          stale: true
        }
      },
      domainSnapshot: {
        hosts: [
          { host: "news.example.com" },
          { host: "another.example.org" }
        ],
        cache: {
          generatedAt: sampleTime,
          statKey: "domains.top_hosts_window",
          stale: false
        },
        windowSize: 4000
      },
      crawls: [
        {
          status: "Completed",
          startedAt: new Date("2025-11-15T09:00:00Z"),
          endedAt: new Date("2025-11-15T10:30:00Z")
        }
      ],
      errors: [
        {
          url: "https://news.example.com/broken-story",
          kind: "FETCH_FAILED",
          at: sampleTime
        }
      ]
    });

    expect(cards).toHaveLength(4);
    const urlsCard = cards.find((card) => card.key === "urls");
    expect(urlsCard.badge.tone).toBe("warn");
    expect(urlsCard.hints[0]).toMatch(/metric/);
    expect(urlsCard.statHref).toBe("/urls");

    const domainCard = cards.find((card) => card.key === "domains");
    expect(domainCard.hints[0].href).toContain("/domains/news.example.com");
    expect(domainCard.badge.tone).toBe("info");

    const crawlCard = cards.find((card) => card.key === "crawls");
    expect(crawlCard.badge.tone).toBe("success");
    expect(crawlCard.statHref).toBe("/crawls");
    expect(crawlCard.hints).toContainEqual(expect.stringMatching(/Latest status/));

    const errorsCard = cards.find((card) => card.key === "errors");
    expect(errorsCard.badge.tone).toBe("danger");
    expect(errorsCard.hints[0].href).toBe("https://news.example.com/broken-story");
  });

  it("falls back to the URLs card when loaders fail", () => {
    const cards = buildHomeCards({
      totals: { totalRows: 0 },
      loaders: {
        domainSnapshot: () => {
          throw new Error("domain cache offline");
        },
        crawls: () => {
          throw new Error("crawl query failed");
        },
        errors: () => {
          throw new Error("error query failed");
        }
      }
    });

    expect(cards).toHaveLength(1);
    expect(cards[0].key).toBe("urls");
  });
});
