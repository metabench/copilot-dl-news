"use strict";

/**
 * UrlFactsPopup - Client-side popup showing URL fact results
 * 
 * Displays a modal popup with all URL facts computed for a given URL.
 * Uses gemstone colors from the Luxury Obsidian theme to indicate
 * true/false values.
 * 
 * This control is designed for client-side activation only.
 * Server-side it renders a hidden container that gets populated
 * by client-side JavaScript.
 */

const jsgui = require("jsgui3-html");
const StringControl = jsgui.String_Control;

/**
 * UrlFactsPopup - Modal popup control for displaying URL facts
 */
class UrlFactsPopup extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {Object} [spec.context] - jsgui context
   */
  constructor(spec = {}) {
    const context = spec.context || new jsgui.Page_Context();
    super({ context, tagName: "div" });

    this.add_class("lux-facts-popup");
    this.dom.attributes.style = "display: none;";
    this.dom.attributes["data-control"] = "UrlFactsPopup";

    // Overlay backdrop
    const backdrop = new jsgui.div({ context, class: "lux-facts-popup__backdrop" });
    backdrop.dom.attributes["data-role"] = "backdrop";
    this.add(backdrop);

    // Modal container
    const modal = new jsgui.div({ context, class: "lux-facts-popup__modal" });
    modal.dom.attributes["data-role"] = "modal";

    // Header
    const header = new jsgui.div({ context, class: "lux-facts-popup__header" });
    
    const title = new jsgui.Control({ context, tagName: "h3", class: "lux-facts-popup__title" });
    title.add(new StringControl({ context, text: "URL Facts Analysis" }));
    header.add(title);

    const closeBtn = new jsgui.Control({ context, tagName: "button", class: "lux-facts-popup__close" });
    closeBtn.dom.attributes["data-role"] = "close";
    closeBtn.dom.attributes.type = "button";
    closeBtn.dom.attributes.title = "Close";
    closeBtn.add(new StringControl({ context, text: "✕" }));
    header.add(closeBtn);

    modal.add(header);

    // URL display
    const urlDisplay = new jsgui.div({ context, class: "lux-facts-popup__url" });
    urlDisplay.dom.attributes["data-role"] = "url-display";
    modal.add(urlDisplay);

    // Facts list container (populated client-side)
    const factsList = new jsgui.div({ context, class: "lux-facts-popup__facts" });
    factsList.dom.attributes["data-role"] = "facts-list";
    modal.add(factsList);

    // Footer
    const footer = new jsgui.div({ context, class: "lux-facts-popup__footer" });
    const footerText = new jsgui.span({ context });
    footerText.add(new StringControl({ context, text: "Facts are neutral observations · No weighted signals" }));
    footer.add(footerText);
    modal.add(footer);

    this.add(modal);
  }
}

/**
 * Client-side activation code for the popup
 * This function should be called after DOM is ready
 */
function activateUrlFactsPopup() {
  // Import URL facts (these work with just URL strings)
  const { createAllUrlFacts } = require("../../facts/url");
  const urlFacts = createAllUrlFacts();

  // Find the popup element
  const popupEl = document.querySelector("[data-control='UrlFactsPopup']");
  if (!popupEl) {
    console.warn("[UrlFactsPopup] No popup element found");
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
        console.error(`[UrlFactsPopup] Error computing ${fact.name}:`, err);
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
      if (key === "reason" && !value) continue;
      parts.push(`${key}: ${value}`);
    }
    return parts.join(" · ");
  }

  // Event handlers
  backdrop.addEventListener("click", hide);
  closeBtn.addEventListener("click", hide);
  
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

  return { show, hide };
}

module.exports = {
  UrlFactsPopup,
  activateUrlFactsPopup
};
