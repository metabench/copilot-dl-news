"use strict";

const { formatCount, formatDateTime } = require("./controls/UrlListingTable");

const STATUS_TONES = {
  completed: "success",
  success: "success",
  running: "info",
  queued: "info",
  pending: "info",
  stalled: "warn",
  aborted: "warn",
  cancelled: "warn",
  failed: "danger",
  error: "danger"
};

function formatStatValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return "—";
  if (numeric >= 1000) {
    return formatCount(numeric);
  }
  return `${numeric}`;
}

function formatOptionalDate(value) {
  if (!value) return null;
  const formatted = formatDateTime(value, true);
  return formatted && formatted !== "—" ? formatted : null;
}

function resolveDataSnapshot(explicitValue, loader, fallback) {
  if (explicitValue !== undefined) {
    return { value: explicitValue, ok: true };
  }
  if (typeof loader === "function") {
    try {
      return { value: loader(), ok: true };
    } catch (_) {
      return { value: fallback, ok: false };
    }
  }
  return { value: fallback, ok: false };
}

function buildBadge({ label, tone = "muted", title }) {
  if (!label) return null;
  return { label, tone, title: title || null };
}

function buildUrlCard(totals) {
  const totalRows = totals && Number.isFinite(Number(totals.totalRows)) ? Number(totals.totalRows) : null;
  const statValue = totalRows != null ? formatCount(totalRows) : "—";
  const hints = [];
  let badge = null;
  if (totals && totals.source) {
    const freshness = totals.cache ? formatOptionalDate(totals.cache.generatedAt) : null;
    const sourceLabel = totals.source === "cache" ? "Cache" : String(totals.source).charAt(0).toUpperCase() + String(totals.source).slice(1);
    hints.push(freshness ? `${sourceLabel} metric as of ${freshness}` : `${sourceLabel} metric`);
    if (totals.cache && totals.cache.statKey) {
      hints.push(`Stat key: ${totals.cache.statKey}`);
    }
    if (totals.cache && totals.cache.stale) {
      hints.push("Cache marked stale; live recompute pending");
    }
    badge = totals.cache && totals.cache.stale
      ? buildBadge({ label: "Cache Stale", tone: "warn", title: hints.join(" • ") })
      : buildBadge({ label: sourceLabel, tone: totals.source === "cache" ? "info" : "success", title: hints.join(" • ") });
  } else {
    hints.push("Live totals derived directly from SQLite");
  }
  return {
    key: "urls",
    title: "URLs",
    description: "Browse the freshest crawl snapshot.",
    statLabel: "Tracked URLs",
    statValue,
    statHref: "/urls",
    statTooltip: hints[0],
    hints,
    badge,
    action: { label: "Open URLs", href: "/urls", title: "Open the URLs table" }
  };
}

function buildDomainCard(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.hosts)) return null;
  const hostCount = snapshot.hosts.length;
  const cacheFreshness = snapshot.cache ? formatOptionalDate(snapshot.cache.generatedAt) : null;
  const windowSize = Number.isFinite(Number(snapshot.windowSize)) ? formatCount(Number(snapshot.windowSize)) : null;
  const description = cacheFreshness
    ? `Cache ${snapshot.cache.stale ? "stale" : "updated"} ${cacheFreshness}.`
    : windowSize
      ? `Top hosts across ${windowSize} saved articles.`
      : "Top hosts across recent articles.";
  const hints = [];
  const topHost = snapshot.hosts.find((entry) => entry && entry.host);
  if (topHost && topHost.host) {
    hints.push({
      text: `Top host: ${topHost.host}`,
      href: `/domains/${encodeURIComponent(topHost.host)}`,
      title: `Inspect ${topHost.host}`
    });
  }
  if (snapshot.cache) {
    hints.push(cacheFreshness ? `Cache generated ${cacheFreshness}` : "Cached metric available");
    if (snapshot.cache.statKey) {
      hints.push(`Stat key: ${snapshot.cache.statKey}`);
    }
  }
  const badge = snapshot.cache
    ? buildBadge({ label: snapshot.cache.stale ? "Cache Stale" : "Cached", tone: snapshot.cache.stale ? "warn" : "info", title: description })
    : buildBadge({ label: "Live", tone: "success", title: "Derived from live domain activity" });
  return {
    key: "domains",
    title: "Domains",
    description,
    statLabel: "Hosts ranked",
    statValue: formatStatValue(hostCount),
    statHref: "/domains",
    statTooltip: description,
    hints,
    badge,
    action: { label: "View domains", href: "/domains", title: "Open the domains dashboard" }
  };
}

function buildCrawlCard(crawlsRaw) {
  if (!Array.isArray(crawlsRaw)) return null;
  const crawls = crawlsRaw.filter(Boolean);
  const latest = crawls.length ? crawls[0] : null;
  const lastRun = latest ? formatOptionalDate(latest.endedAt || latest.startedAt) : null;
  const hints = [];
  if (latest && latest.status) {
    hints.push(`Latest status: ${latest.status}`);
  }
  if (lastRun) {
    hints.push(`Last activity: ${lastRun}`);
  }
  const description = hints.length ? hints.join(" · ") : "Monitor crawl job throughput.";
  const badgeTone = latest && latest.status
    ? STATUS_TONES[String(latest.status).toLowerCase()] || "info"
    : crawls.length > 0
      ? "info"
      : "muted";
  const badgeLabel = latest && latest.status
    ? String(latest.status)
    : crawls.length > 0
      ? "Activity"
      : "Idle";
  const badge = buildBadge({ label: badgeLabel, tone: badgeTone, title: hints.join(" • ") || null });
  return {
    key: "crawls",
    title: "Crawl Jobs",
    description,
    statLabel: "Jobs indexed",
    statValue: formatStatValue(crawls.length),
    statHref: "/crawls",
    statTooltip: "Open recent crawl jobs",
    hints,
    badge,
    action: { label: "View crawls", href: "/crawls", title: "Open crawl jobs view" }
  };
}

function buildErrorsCard(errorsRaw) {
  if (!Array.isArray(errorsRaw)) return null;
  const errors = errorsRaw.filter(Boolean);
  const latestError = errors.length ? errors[0] : null;
  const lastSeen = latestError ? formatOptionalDate(latestError.at) : null;
  const kind = latestError && (latestError.kind || latestError.code) ? (latestError.kind || latestError.code) : null;
  const hints = [];
  if (latestError && latestError.url) {
    hints.push({ text: "Jump to latest failing URL", href: latestError.url, title: latestError.url });
  }
  if (kind) {
    hints.push(`Most recent code: ${kind}`);
  }
  if (lastSeen) {
    hints.push(`Observed ${lastSeen}`);
  }
  const description = latestError
    ? [kind ? `Latest ${kind}` : "Latest error", lastSeen].filter(Boolean).join(" · ")
    : "Track the newest crawl issues.";
  const badge = errors.length
    ? buildBadge({ label: "Attention", tone: "danger", title: description })
    : buildBadge({ label: "Clear", tone: "success", title: "No crawl errors captured" });
  return {
    key: "errors",
    title: "Errors",
    description,
    statLabel: "Entries logged",
    statValue: formatStatValue(errors.length),
    statHref: "/errors",
    statTooltip: "Open the crawl errors feed",
    hints,
    badge,
    action: { label: "View errors", href: "/errors", title: "Open crawl errors view" }
  };
}

function buildHomeCards({ totals, domainSnapshot, crawls, errors, loaders = {} } = {}) {
  const cards = [];
  cards.push(buildUrlCard(totals));

  const { value: snapshot, ok: domainOk } = resolveDataSnapshot(domainSnapshot, loaders.domainSnapshot, null);
  if (domainOk && snapshot) {
    const domainCard = buildDomainCard(snapshot);
    if (domainCard) cards.push(domainCard);
  }

  const { value: crawlData, ok: crawlsOk } = resolveDataSnapshot(
    Array.isArray(crawls) ? crawls : undefined,
    loaders.crawls,
    []
  );
  if (crawlsOk) {
    const crawlCard = buildCrawlCard(Array.isArray(crawlData) ? crawlData : []);
    if (crawlCard) cards.push(crawlCard);
  }

  const { value: errorData, ok: errorsOk } = resolveDataSnapshot(
    Array.isArray(errors) ? errors : undefined,
    loaders.errors,
    []
  );
  if (errorsOk) {
    const errorCard = buildErrorsCard(Array.isArray(errorData) ? errorData : []);
    if (errorCard) cards.push(errorCard);
  }

  return cards.filter(Boolean);
}

module.exports = {
  buildHomeCards
};
