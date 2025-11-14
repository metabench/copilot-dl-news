"use strict";

function normalizePath(pathname) {
  if (typeof pathname !== "string" || !pathname.trim()) return "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function normalizeLabel(label, fallback = "Back") {
  if (typeof label === "string" && label.trim()) {
    return label.trim();
  }
  return fallback;
}

function sanitizeBackHref(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  return trimmed.startsWith("/") ? trimmed : null;
}

function buildNavLinks(activeKey, views) {
  if (!Array.isArray(views)) return [];
  return views.map((view) => ({
    label: view.navLabel,
    href: view.path,
    active: view.key === activeKey
  }));
}

function buildBackLinkTarget(req, { defaultLabel = "Back" } = {}) {
  if (!req) return null;
  const basePath = normalizePath((req.baseUrl || "") + (req.path || ""));
  const params = new URLSearchParams();
  const query = req.query || {};
  Object.entries(query).forEach(([key, value]) => {
    if (key === "back" || key === "backLabel") return;
    if (value == null) return;
    const values = Array.isArray(value) ? value : [value];
    values.forEach((item) => {
      if (item == null || item === "") return;
      params.append(key, String(item));
    });
  });
  const queryString = params.toString();
  return {
    href: queryString ? `${basePath}?${queryString}` : basePath,
    label: normalizeLabel(defaultLabel)
  };
}

function deriveBackLink(req, fallback) {
  const query = (req && req.query) || {};
  const candidateHref = sanitizeBackHref(query.back);
  if (candidateHref) {
    return {
      href: candidateHref,
      label: normalizeLabel(query.backLabel, fallback && fallback.label)
    };
  }
  if (fallback && fallback.href) {
    return {
      href: fallback.href,
      label: normalizeLabel(fallback.label)
    };
  }
  return null;
}

function appendBackParams(href, backLink) {
  if (!href || !backLink || !backLink.href) return href;
  const params = new URLSearchParams();
  params.set("back", backLink.href);
  if (backLink.label) {
    params.set("backLabel", backLink.label);
  }
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${params.toString()}`;
}

function buildBreadcrumbs({ trail = [], backLink = null, current = null } = {}) {
  const crumbs = [];
  if (backLink && backLink.href) {
    crumbs.push({ label: normalizeLabel(backLink.label), href: backLink.href });
  } else if (Array.isArray(trail) && trail.length) {
    trail.filter(Boolean).forEach((item) => {
      if (!item) return;
      crumbs.push({
        label: normalizeLabel(item.label),
        href: item.href ? normalizePath(item.href) : undefined
      });
    });
  }
  if (current) {
    crumbs.push({ label: normalizeLabel(current.label, current.label), href: current.href });
  }
  return crumbs;
}

module.exports = {
  buildNavLinks,
  buildBackLinkTarget,
  deriveBackLink,
  appendBackParams,
  buildBreadcrumbs
};
