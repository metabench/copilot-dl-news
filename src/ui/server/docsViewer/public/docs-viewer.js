/**
 * Documentation Viewer Client-Side JavaScript
 * 
 * Handles client-side interactions (non-jsgui features):
 * - Navigation toggle (mobile)
 * - Search filtering
 * - Copy link
 * - Keyboard navigation
 * 
 * Note: Theme toggle is handled by jsgui3 client controls
 * (see client/controls/DocsThemeToggleControl.js)
 */

(function() {
  "use strict";

  // ========================================
  // Navigation Toggle (Mobile)
  // ========================================

  function toggleNav() {
    const navColumn = document.querySelector(".doc-app__nav-column");
    if (navColumn) {
      navColumn.classList.toggle("is-open");
    }
  }

  function closeNav() {
    const navColumn = document.querySelector(".doc-app__nav-column");
    if (navColumn) {
      navColumn.classList.remove("is-open");
    }
  }

  // ========================================
  // Search Filtering (fallback if jsgui control not activated)
  // ========================================

  function initSearch() {
    const searchInput = document.querySelector("[data-jsgui-control='docs_search']");
    if (!searchInput) return;
    
    // If jsgui3 control is activated, it handles this
    if (searchInput.__jsgui_control) return;

    let debounceTimer;
    
    searchInput.addEventListener("input", function(e) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function() {
        filterTree(e.target.value);
      }, 150);
    });

    searchInput.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        e.target.value = "";
        filterTree("");
        e.target.blur();
      }
    });
  }

  function filterTree(query) {
    const tree = document.querySelector(".doc-nav__tree");
    if (!tree) return;

    const normalizedQuery = query.toLowerCase().trim();
    const items = tree.querySelectorAll(".doc-nav__item");

    items.forEach(function(item) {
      const label = item.querySelector(".doc-nav__label");
      const text = label ? label.textContent.toLowerCase() : "";
      
      if (!normalizedQuery || text.includes(normalizedQuery)) {
        item.style.display = "";
        // Expand parent folders
        let parent = item.parentElement;
        while (parent) {
          if (parent.tagName === "DETAILS") {
            parent.open = true;
          }
          parent = parent.parentElement;
        }
      } else {
        item.style.display = "none";
      }
    });
  }

  // ========================================
  // Copy Link
  // ========================================

  function copyLink() {
    const url = window.location.href;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function() {
        showToast("Link copied!");
      }).catch(function() {
        fallbackCopyLink(url);
      });
    } else {
      fallbackCopyLink(url);
    }
  }

  function fallbackCopyLink(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      document.execCommand("copy");
      showToast("Link copied!");
    } catch (e) {
      showToast("Could not copy link");
    }
    
    document.body.removeChild(textarea);
  }

  function showToast(message) {
    // Remove existing toast
    const existing = document.querySelector(".docs-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "docs-toast";
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 1000;
      animation: fadeInOut 2s ease;
    `;
    
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 2000);
  }

  // ========================================
  // Print
  // ========================================

  function printDocument() {
    window.print();
  }

  // ========================================
  // Keyboard Navigation
  // ========================================

  function initKeyboardNav() {
    document.addEventListener("keydown", function(e) {
      // Ignore if in input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        return;
      }

      switch (e.key) {
        case "/":
          e.preventDefault();
          const searchInput = document.querySelector("[data-jsgui-control='docs_search']");
          if (searchInput) searchInput.focus();
          break;
        case "Escape":
          closeNav();
          break;
      }
    });
  }

  // ========================================
  // Event Delegation (non-jsgui actions)
  // ========================================

  function initEventDelegation() {
    document.addEventListener("click", function(e) {
      const target = e.target.closest("[data-action]");
      if (!target) return;

      const action = target.getAttribute("data-action");
      
      switch (action) {
        case "toggle-nav":
          toggleNav();
          break;
        case "copy-link":
          copyLink();
          break;
        case "print":
          printDocument();
          break;
        // theme toggle is handled by jsgui3 DocsThemeToggleControl
      }
    });

    // Close nav when clicking on a link (mobile)
    document.addEventListener("click", function(e) {
      if (e.target.closest(".doc-nav__link")) {
        closeNav();
      }
    });
  }

  // ========================================
  // Smooth Scroll for Anchors
  // ========================================

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
      anchor.addEventListener("click", function(e) {
        const href = this.getAttribute("href");
        if (href === "#") return;

        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          history.pushState(null, null, href);
        }
      });
    });
  }

  // ========================================
  // Initialize
  // ========================================

  function init() {
    // Initialize features (theme is handled by jsgui3)
    initSearch();
    initKeyboardNav();
    initEventDelegation();
    initSmoothScroll();
  }

  // Run on DOM ready, but with a slight delay to let jsgui3 activate first
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
      setTimeout(init, 50);
    });
  } else {
    setTimeout(init, 50);
  }

  // Add fadeInOut animation
  const style = document.createElement("style");
  style.textContent = `
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateY(10px); }
      15% { opacity: 1; transform: translateY(0); }
      85% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-10px); }
    }
  `;
  document.head.appendChild(style);

})();
