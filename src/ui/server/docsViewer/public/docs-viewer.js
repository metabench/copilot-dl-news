/**
 * Documentation Viewer Client-Side JavaScript
 * 
 * Handles client-side interactions (non-jsgui features):
 * - Navigation toggle (mobile)
 * - Search filtering
 * - Copy link
 * - Keyboard navigation
 * - Column header sorting
 * - Column selection context menu
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
  // Column Header Sorting & Context Menu
  // ========================================
  // NOTE: Column header sorting and context menu are now handled by
  // jsgui3 controls: ColumnHeaderControl and ColumnContextMenuControl
  // These controls are activated via data-jsgui-control attributes.
  // The code below is kept as fallback only if jsgui3 activation fails.
  
  /**
   * Get the ColumnContextMenuControl instance (activated by jsgui3-client)
   * @returns {Object|null} The control instance or null
   */
  function getColumnMenuControl() {
    const menuEl = document.querySelector("[data-context-menu='columns']");
    if (!menuEl) return null;
    return menuEl.__jsgui_control || null;
  }
  
  /**
   * Check if ColumnHeaderControl is active (jsgui3 handles interactions)
   * @returns {boolean}
   */
  function isColumnHeaderControlActive() {
    const headerEl = document.querySelector("[data-column-header]");
    return !!(headerEl && headerEl.__jsgui_control);
  }
  
  function initColumnHeader() {
    // Skip if jsgui3 ColumnHeaderControl is active
    if (isColumnHeaderControlActive()) {
      console.log("[docs-viewer] Column header handled by jsgui3 control");
      return;
    }
    
    console.log("[docs-viewer] Using fallback column header handlers");
    
    const columnHeader = document.querySelector("[data-column-header]");
    if (!columnHeader) return;
    
    // Click on sortable headers to sort
    columnHeader.addEventListener("click", function(e) {
      // Don't handle if clicking on options button
      if (e.target.closest(".doc-nav__col-options-btn, [data-action='show-column-menu']")) {
        return;
      }
      
      const header = e.target.closest(".doc-nav__col-header--sortable");
      if (!header) return;
      
      const sortBy = header.getAttribute("data-sort-by");
      const currentOrder = header.getAttribute("data-sort-order") || 'asc';
      
      // Toggle order if clicking same column, else use default
      let newOrder;
      if (header.classList.contains("doc-nav__col-header--active")) {
        newOrder = currentOrder === 'asc' ? 'desc' : 'asc';
      } else {
        newOrder = sortBy === 'mtime' ? 'desc' : 'asc'; // Default desc for date, asc for name
      }
      
      // Build new URL with sort params
      const url = new URL(window.location.href);
      url.searchParams.set("sort_by", sortBy);
      url.searchParams.set("sort_order", newOrder);
      
      window.location.href = url.toString();
    });
    
    // Right-click on column header to show context menu
    columnHeader.addEventListener("contextmenu", function(e) {
      e.preventDefault();
      const control = getColumnMenuControl();
      if (control && typeof control.show === "function") {
        control.show(e.clientX, e.clientY);
      } else {
        // Fallback for when control isn't activated yet
        showColumnContextMenu(e.clientX, e.clientY);
      }
    });
    
    // Click on options button to show context menu
    const optionsBtn = columnHeader.querySelector(".doc-nav__col-options-btn");
    if (optionsBtn) {
      optionsBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        const rect = optionsBtn.getBoundingClientRect();
        const control = getColumnMenuControl();
        if (control && typeof control.show === "function") {
          control.show(rect.left, rect.bottom + 4);
        } else {
          // Fallback for when control isn't activated yet
          showColumnContextMenu(rect.left, rect.bottom + 4);
        }
      });
    }
  }
  
  // Fallback functions for when jsgui3-client control isn't activated
  function showColumnContextMenu(x, y) {
    const menu = document.querySelector("[data-context-menu='columns']");
    if (!menu) return;
    
    // Position the menu
    menu.style.display = "block";
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    
    // Ensure menu stays within viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = (x - rect.width) + "px";
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (y - rect.height) + "px";
    }
    
    // Close on click outside
    function closeOnClickOutside(e) {
      if (!menu.contains(e.target)) {
        hideColumnContextMenu();
        document.removeEventListener("click", closeOnClickOutside);
      }
    }
    
    // Delay adding listener to avoid immediate close
    setTimeout(function() {
      document.addEventListener("click", closeOnClickOutside);
    }, 10);
    
    // Close on escape
    function closeOnEscape(e) {
      if (e.key === "Escape") {
        hideColumnContextMenu();
        document.removeEventListener("keydown", closeOnEscape);
      }
    }
    document.addEventListener("keydown", closeOnEscape);
  }
  
  function hideColumnContextMenu() {
    const menu = document.querySelector("[data-context-menu='columns']");
    if (menu) {
      menu.style.display = "none";
    }
  }
  
  // initColumnToggle only needed as fallback - ColumnContextMenuControl handles this
  function initColumnToggle() {
    const menu = document.querySelector("[data-context-menu='columns']");
    if (!menu) return;
    
    // Skip if control is activated (it handles its own events)
    if (menu.__jsgui_control) return;
    
    menu.addEventListener("change", function(e) {
      const toggle = e.target.closest("[data-column-toggle]");
      if (!toggle) return;
      
      const column = toggle.getAttribute("data-column-toggle");
      const isChecked = toggle.checked;
      
      // Build new URL with column visibility
      const url = new URL(window.location.href);
      if (isChecked) {
        url.searchParams.set("col_" + column, "1");
      } else {
        url.searchParams.delete("col_" + column);
      }
      
      window.location.href = url.toString();
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
          hideColumnContextMenu();
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
    initColumnHeader();
    initColumnToggle();
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
