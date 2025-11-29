/**
 * Design Studio - Vanilla JS fallback for non-jsgui features
 * 
 * Handles:
 * - Theme toggle
 * - Mobile navigation toggle
 * - Keyboard shortcuts
 */

(function() {
  "use strict";
  
  // ==================== Theme Toggle ====================
  
  const THEME_KEY = "design-studio-theme";
  
  function getStoredTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null;
    }
  }
  
  function setStoredTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      // localStorage may be disabled
    }
  }
  
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    
    // Update toggle button icon
    const toggleBtn = document.querySelector("[data-jsgui-control='design_theme_toggle']");
    if (toggleBtn) {
      toggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
      toggleBtn.title = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    }
  }
  
  function initTheme() {
    // Check for stored preference
    const stored = getStoredTheme();
    if (stored) {
      applyTheme(stored);
      return;
    }
    
    // Check system preference
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      applyTheme("dark");
    } else {
      applyTheme("light");
    }
    
    // Listen for system preference changes
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (!getStoredTheme()) {
        applyTheme(e.matches ? "dark" : "light");
      }
    });
  }
  
  function setupThemeToggle() {
    const toggleBtn = document.querySelector("[data-jsgui-control='design_theme_toggle']");
    if (!toggleBtn) return;
    
    toggleBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      setStoredTheme(next);
    });
  }
  
  // ==================== Mobile Navigation ====================
  
  function setupMobileNav() {
    const toggleBtn = document.querySelector("[data-jsgui-control='design_nav_toggle']");
    const navColumn = document.querySelector(".design-app__nav-column");
    
    if (!toggleBtn || !navColumn) return;
    
    toggleBtn.addEventListener("click", () => {
      navColumn.classList.toggle("is-open");
    });
    
    // Close nav when clicking outside
    document.addEventListener("click", (e) => {
      if (!navColumn.classList.contains("is-open")) return;
      if (navColumn.contains(e.target) || toggleBtn.contains(e.target)) return;
      navColumn.classList.remove("is-open");
    });
  }
  
  // ==================== Keyboard Shortcuts ====================
  
  function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      // Ignore if in input/textarea
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      
      // Cmd/Ctrl + K to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const searchInput = document.querySelector("[data-jsgui-control='design_search']");
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
      
      // Escape to close mobile nav
      if (e.key === "Escape") {
        const navColumn = document.querySelector(".design-app__nav-column");
        if (navColumn) {
          navColumn.classList.remove("is-open");
        }
      }
      
      // T to toggle theme
      if (e.key === "t" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const toggleBtn = document.querySelector("[data-jsgui-control='design_theme_toggle']");
        if (toggleBtn) {
          toggleBtn.click();
        }
      }
    });
  }
  
  // ==================== Initialize ====================
  
  function init() {
    initTheme();
    setupThemeToggle();
    setupMobileNav();
    setupKeyboardShortcuts();
    
    console.log("[Design Studio] Vanilla JS initialized");
  }
  
  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
