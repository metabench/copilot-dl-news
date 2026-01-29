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

(function () {
  "use strict";

  // ========================================
  // Lazy Loading API
  // ========================================

  const API_CACHE = new Map();

  /**
   * Fetch the doc tree from API
   * @param {string} path - Optional path to fetch subtree
   * @param {number} depth - Depth limit (1 = immediate children only)
   */
  async function fetchTree(path = '', depth = 1) {
    const cacheKey = `tree:${path}:${depth}`;
    if (API_CACHE.has(cacheKey)) {
      return API_CACHE.get(cacheKey);
    }

    let url = '/api/tree';
    if (path) {
      url += `?path=${encodeURIComponent(path)}&depth=${depth}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch tree');
    const data = await response.json();
    API_CACHE.set(cacheKey, data);
    return data;
  }

  /**
   * Fetch document content from API
   * @param {string} docPath - Path to document
   */
  async function fetchDoc(docPath) {
    const cacheKey = `doc:${docPath}`;
    if (API_CACHE.has(cacheKey)) {
      return API_CACHE.get(cacheKey);
    }

    const response = await fetch(`/api/doc?path=${encodeURIComponent(docPath)}`);
    if (!response.ok) throw new Error('Failed to fetch document');
    const data = await response.json();
    API_CACHE.set(cacheKey, data);
    return data;
  }

  /**
   * Render tree nodes as HTML (for lazy-loaded content)
   * @param {Array} items - Tree items to render
   * @param {number} depth - Current depth for styling
   */
  function renderTreeHTML(items, depth = 0) {
    if (!items || items.length === 0) return '';

    let html = `<ul class="doc-nav__list doc-nav__list--depth-${depth}">`;

    for (const item of items) {
      if (item.type === 'folder') {
        html += `
          <li class="doc-nav__item doc-nav__folder">
            <details data-folder-path="${escapeHtml(item.path)}">
              <summary class="doc-nav__folder-summary">
                <span class="doc-nav__icon">📁</span>
                <span class="doc-nav__label">${escapeHtml(item.name)}</span>
              </summary>
              <div class="doc-nav__folder-content" data-loading="true">
                <span class="doc-nav__loading">Loading...</span>
              </div>
            </details>
          </li>`;
      } else {
        const icon = item.name.endsWith('.svg') ? '🖼️' : '📄';
        html += `
          <li class="doc-nav__item">
            <a href="?doc=${encodeURIComponent(item.path)}" 
               class="doc-nav__link" 
               data-doc-path="${escapeHtml(item.path)}"
               data-lazy-doc="true">
              <span class="doc-nav__icon">${icon}</span>
              <span class="doc-nav__label">${escapeHtml(item.name)}</span>
            </a>
          </li>`;
      }
    }

    html += '</ul>';
    return html;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Handle folder expansion - lazy load children
   */
  async function handleFolderExpand(details) {
    const folderPath = details.getAttribute('data-folder-path');
    const contentDiv = details.querySelector('.doc-nav__folder-content');

    // Skip if already loaded
    if (contentDiv && contentDiv.getAttribute('data-loading') !== 'true') {
      return;
    }

    try {
      const data = await fetchTree(folderPath, 1);
      if (contentDiv && data.tree) {
        // Find the children of this folder in the tree
        const children = findChildrenInTree(data.tree, folderPath);
        contentDiv.innerHTML = renderTreeHTML(children, 1);
        contentDiv.removeAttribute('data-loading');

        // Add toggle listeners to new folders
        contentDiv.querySelectorAll('details[data-folder-path]').forEach(d => {
          d.addEventListener('toggle', () => {
            if (d.open) handleFolderExpand(d);
          });
        });

        // Add click listeners to new doc links
        contentDiv.querySelectorAll('[data-lazy-doc]').forEach(link => {
          link.addEventListener('click', handleDocClick);
        });
      }
    } catch (err) {
      console.error('Failed to load folder:', err);
      if (contentDiv) {
        contentDiv.innerHTML = '<span class="doc-nav__error">Failed to load</span>';
      }
    }
  }

  /**
   * Find children of a folder path in the tree structure
   */
  function findChildrenInTree(tree, targetPath) {
    if (!targetPath) return tree;

    function search(items, path) {
      for (const item of items) {
        if (item.path === path && item.children) {
          return item.children;
        }
        if (item.children) {
          const found = search(item.children, path);
          if (found) return found;
        }
      }
      return null;
    }

    return search(tree, targetPath) || [];
  }

  /**
   * Handle document link click - load via API instead of full page reload
   */
  async function handleDocClick(e) {
    // Allow normal navigation if modifier keys pressed
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;

    const link = e.currentTarget;
    const docPath = link.getAttribute('data-doc-path');
    if (!docPath) return;

    e.preventDefault();

    // Update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set('doc', docPath);
    history.pushState({ doc: docPath }, '', url.toString());

    // Highlight selected link
    document.querySelectorAll('.doc-nav__link--selected').forEach(el => {
      el.classList.remove('doc-nav__link--selected');
    });
    link.classList.add('doc-nav__link--selected');

    // Load document content
    await loadDocContent(docPath);
  }

  /**
   * Load and display document content
   */
  async function loadDocContent(docPath) {
    const viewer = document.querySelector('.doc-viewer__content');
    if (!viewer) return;

    // Show loading state
    viewer.innerHTML = '<div class="doc-nav__loading">Loading document...</div>';

    try {
      const data = await fetchDoc(docPath);
      if (data && data.html) {
        viewer.innerHTML = `<div class="doc-content">${data.html}</div>`;

        // Update page title
        if (data.title) {
          document.title = data.title + ' - Documentation Viewer';
        }

        // Scroll to top
        viewer.scrollTop = 0;
      }
    } catch (err) {
      console.error('Failed to load document:', err);
      viewer.innerHTML = '<div class="doc-nav__error">Failed to load document</div>';
    }
  }

  /**
   * Initialize lazy loading event handlers
   */
  function initLazyLoading() {
    // Add toggle listeners to all folders
    document.querySelectorAll('details[data-folder-path]').forEach(details => {
      details.addEventListener('toggle', () => {
        if (details.open) handleFolderExpand(details);
      });
    });

    // Add click listeners to all doc links
    document.querySelectorAll('[data-lazy-doc]').forEach(link => {
      link.addEventListener('click', handleDocClick);
    });

    // Handle browser back/forward
    window.addEventListener('popstate', async (e) => {
      if (e.state && e.state.doc) {
        await loadDocContent(e.state.doc);
      } else {
        // Reload page for home
        window.location.reload();
      }
    });
  }

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

    searchInput.addEventListener("input", function (e) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        filterTree(e.target.value);
      }, 150);
    });

    searchInput.addEventListener("keydown", function (e) {
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

    items.forEach(function (item) {
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
   * Sort the navigation tree items client-side
   * @param {string} sortBy - 'name' or 'mtime'
   * @param {string} order - 'asc' or 'desc'
   */
  function sortNavTree(sortBy, order) {
    // Find all nav lists (root and nested)
    const lists = document.querySelectorAll('.doc-nav__list');

    lists.forEach(list => {
      // Get immediate children items
      const items = Array.from(list.children).filter(el =>
        el.classList.contains('doc-nav__item') ||
        el.tagName.toLowerCase() === 'li'
      );

      if (items.length === 0) return;

      // Sort items
      items.sort((a, b) => {
        // Get type (folder or file)
        const aIsFolder = a.classList.contains('doc-nav__item--folder') || a.querySelector('.doc-nav__folder');
        const bIsFolder = b.classList.contains('doc-nav__item--folder') || b.querySelector('.doc-nav__folder');

        // Folders always come before files when sorting by name
        if (sortBy === 'name' && aIsFolder !== bIsFolder) {
          return aIsFolder ? -1 : 1;
        }

        let valA, valB;

        if (sortBy === 'mtime') {
          // Get mtime from data attribute or cell text
          const aMtimeCell = a.querySelector('.doc-nav__cell--mtime');
          const bMtimeCell = b.querySelector('.doc-nav__cell--mtime');
          valA = aMtimeCell ? aMtimeCell.textContent.trim() : '';
          valB = bMtimeCell ? bMtimeCell.textContent.trim() : '';
        } else {
          // Get name from label
          const aLabel = a.querySelector('.doc-nav__label');
          const bLabel = b.querySelector('.doc-nav__label');
          valA = (aLabel ? aLabel.textContent.trim() : '').toLowerCase();
          valB = (bLabel ? bLabel.textContent.trim() : '').toLowerCase();
        }

        let result;
        if (valA < valB) result = -1;
        else if (valA > valB) result = 1;
        else result = 0;

        return order === 'desc' ? -result : result;
      });

      // Reorder DOM
      items.forEach(item => list.appendChild(item));
    });
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
    columnHeader.addEventListener("click", function (e) {
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

      // Sort the nav tree client-side
      sortNavTree(sortBy, newOrder);

      // Update header UI to show active sort
      document.querySelectorAll('.doc-nav__col-header--sortable').forEach(h => {
        h.classList.remove('doc-nav__col-header--active');
      });
      header.classList.add('doc-nav__col-header--active');
      header.setAttribute('data-sort-order', newOrder);

      // Update sort indicator
      const sortIcon = header.querySelector('.doc-nav__sort-icon');
      if (sortIcon) {
        sortIcon.textContent = newOrder === 'asc' ? ' ▲' : ' ▼';
      } else {
        const newIcon = document.createElement('span');
        newIcon.className = 'doc-nav__sort-icon';
        newIcon.textContent = newOrder === 'asc' ? ' ▲' : ' ▼';
        header.appendChild(newIcon);
      }

      // Update URL for persistence on reload (but don't navigate)
      const url = new URL(window.location.href);
      url.searchParams.set("sort_by", sortBy);
      url.searchParams.set("sort_order", newOrder);
      history.replaceState(null, '', url.toString());
    });

    // Right-click on column header to show context menu
    columnHeader.addEventListener("contextmenu", function (e) {
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
      optionsBtn.addEventListener("click", function (e) {
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
    setTimeout(function () {
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

  // initColumnToggle - handles showing/hiding columns client-side
  function initColumnToggle() {
    const menu = document.querySelector("[data-context-menu='columns']");
    if (!menu) return;

    // Skip if control is activated (it handles its own events)
    if (menu.__jsgui_control) return;

    menu.addEventListener("change", function (e) {
      const toggle = e.target.closest("[data-column-toggle]");
      if (!toggle) return;

      const column = toggle.getAttribute("data-column-toggle");
      const isChecked = toggle.checked;

      // Update DOM immediately - toggle mtime column visibility
      if (column === 'mtime') {
        toggleMtimeColumn(isChecked);
      }

      // Also update URL for persistence on reload (but don't navigate)
      const url = new URL(window.location.href);
      if (isChecked) {
        url.searchParams.set("col_" + column, "1");
      } else {
        url.searchParams.delete("col_" + column);
      }
      history.replaceState(null, '', url.toString());

      // Hide the menu
      hideColumnContextMenu();
    });
  }

  // Toggle mtime column visibility in DOM
  function toggleMtimeColumn(show) {
    // Toggle the column header
    const mtimeHeader = document.querySelector('.doc-nav__col-header--mtime');
    if (mtimeHeader) {
      mtimeHeader.style.display = show ? 'flex' : 'none';
    }

    // Toggle all mtime cells in the tree
    const mtimeCells = document.querySelectorAll('.doc-nav__cell--mtime');
    mtimeCells.forEach(cell => {
      cell.style.display = show ? 'flex' : 'none';
    });

    // Add/remove class on items for layout adjustment
    const items = document.querySelectorAll('.doc-nav__item');
    items.forEach(item => {
      if (show) {
        item.classList.add('doc-nav__item--with-columns');
      } else {
        item.classList.remove('doc-nav__item--with-columns');
      }
    });
  }

  // ========================================
  // Copy Link
  // ========================================

  function copyLink() {
    const url = window.location.href;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        showToast("Link copied!");
      }).catch(function () {
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
    setTimeout(function () { toast.remove(); }, 2000);
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
    document.addEventListener("keydown", function (e) {
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
    document.addEventListener("click", function (e) {
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
    document.addEventListener("click", function (e) {
      if (e.target.closest(".doc-nav__link")) {
        closeNav();
      }
    });
  }

  // ========================================
  // Smooth Scroll for Anchors
  // ========================================

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener("click", function (e) {
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
  // Divider Touch Context Menu Prevention
  // ========================================

  function initDividerTouch() {
    const divider = document.querySelector('.split-layout__divider');
    if (!divider) return;

    // Prevent context menu on long press
    divider.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }, { passive: false });

    // Prevent text selection and other touch behaviors
    divider.addEventListener('touchstart', function (e) {
      // Don't prevent default here as it would block the resize functionality
      // but stop propagation to parent elements
      e.stopPropagation();
    }, { passive: true });
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
    initLazyLoading();
    initDividerTouch();
  }

  // Run on DOM ready, but with a slight delay to let jsgui3 activate first
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
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
