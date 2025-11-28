"use strict";

/**
 * Facts Client - Client-side JavaScript for the Facts Server
 * 
 * This module provides client-side interactivity for the Facts page:
 * - Click handlers on URL rows to show facts popup
 * - Client-side URL fact computation (no server round-trip needed)
 * 
 * Built with esbuild as a browser bundle.
 */

// Import URL facts (pure JS, works in browser)
const { createAllUrlFacts } = require("../../facts/url");

/**
 * Initialize the URL facts popup functionality
 */
function initFactsPopup() {
  // Create fact instances once
  const urlFacts = createAllUrlFacts();

  // Find popup element
  const popupEl = document.querySelector("[data-control='UrlFactsPopup']");
  if (!popupEl) {
    console.warn("[FactsClient] No popup element found on page");
    return null;
  }

  const backdrop = popupEl.querySelector("[data-role='backdrop']");
  const closeBtn = popupEl.querySelector("[data-role='close']");
  const urlDisplay = popupEl.querySelector("[data-role='url-display']");
  const factsList = popupEl.querySelector("[data-role='facts-list']");

  /**
   * Show the popup with facts for a URL
   * @param {string} url - The URL to analyze
   */
  function show(url) {
    if (!url) return;

    // Display the URL
    urlDisplay.innerHTML = "";
    const urlText = document.createElement("code");
    urlText.className = "lux-facts-popup__url-text";
    urlText.textContent = url;
    urlDisplay.appendChild(urlText);

    // Compute all URL facts
    factsList.innerHTML = "";
    
    urlFacts.forEach(fact => {
      try {
        const result = fact.extract(url);
        const factItem = createFactItem(result);
        factsList.appendChild(factItem);
      } catch (err) {
        console.error(`[FactsClient] Error computing ${fact.name}:`, err);
        const errorItem = createErrorItem(fact.name, err.message);
        factsList.appendChild(errorItem);
      }
    });

    // Show popup
    popupEl.style.display = "flex";
    document.body.classList.add("lux-popup-open");
  }

  /**
   * Hide the popup
   */
  function hide() {
    popupEl.style.display = "none";
    document.body.classList.remove("lux-popup-open");
  }

  /**
   * Create a DOM element for a fact result
   * @param {Object} result - Fact result with name, value, evidence
   */
  function createFactItem(result) {
    const item = document.createElement("div");
    item.className = `lux-fact-item ${result.value ? "lux-fact-item--true" : "lux-fact-item--false"}`;

    // Indicator
    const indicator = document.createElement("span");
    indicator.className = "lux-fact-item__indicator";
    indicator.textContent = result.value ? "◆" : "◇";
    item.appendChild(indicator);

    // Content
    const content = document.createElement("div");
    content.className = "lux-fact-item__content";

    // Name
    const name = document.createElement("div");
    name.className = "lux-fact-item__name";
    name.textContent = result.name;
    content.appendChild(name);

    // Evidence
    if (result.evidence) {
      const evidence = document.createElement("div");
      evidence.className = "lux-fact-item__evidence";
      evidence.textContent = formatEvidence(result.evidence);
      content.appendChild(evidence);
    }

    item.appendChild(content);

    // Value badge
    const badge = document.createElement("span");
    badge.className = "lux-fact-item__badge";
    badge.textContent = result.value ? "TRUE" : "FALSE";
    item.appendChild(badge);

    return item;
  }

  /**
   * Create a DOM element for an error
   */
  function createErrorItem(factName, errorMessage) {
    const item = document.createElement("div");
    item.className = "lux-fact-item lux-fact-item--error";

    const indicator = document.createElement("span");
    indicator.className = "lux-fact-item__indicator";
    indicator.textContent = "⚠";
    item.appendChild(indicator);

    const content = document.createElement("div");
    content.className = "lux-fact-item__content";

    const name = document.createElement("div");
    name.className = "lux-fact-item__name";
    name.textContent = factName;
    content.appendChild(name);

    const error = document.createElement("div");
    error.className = "lux-fact-item__evidence lux-fact-item__evidence--error";
    error.textContent = `Error: ${errorMessage}`;
    content.appendChild(error);

    item.appendChild(content);

    return item;
  }

  /**
   * Format evidence object for display
   */
  function formatEvidence(evidence) {
    if (!evidence || typeof evidence !== "object") return "";
    
    const parts = [];
    for (const [key, value] of Object.entries(evidence)) {
      if (value === null || value === undefined) continue;
      if (key === "reason" && typeof value === "string" && value.includes("No ")) continue;
      parts.push(`${key}: ${value}`);
    }
    return parts.join(" · ");
  }

  // Event handlers
  if (backdrop) {
    backdrop.addEventListener("click", hide);
  }
  
  if (closeBtn) {
    closeBtn.addEventListener("click", hide);
  }
  
  // Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && popupEl.style.display !== "none") {
      hide();
    }
  });

  // Attach click handlers to URL links
  document.querySelectorAll(".lux-url-list .is-url a").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const url = link.getAttribute("title") || link.textContent;
      show(url);
    });
  });

  console.log("[FactsClient] Initialized with", urlFacts.length, "URL facts");
  return { show, hide };
}

/**
 * Bootstrap on DOMContentLoaded
 */
function bootstrap() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFactsPopup);
  } else {
    initFactsPopup();
  }
}

// Auto-bootstrap
bootstrap();

// Export for external use
if (typeof window !== "undefined") {
  window.FactsClient = {
    init: initFactsPopup
  };
}

module.exports = { initFactsPopup };
