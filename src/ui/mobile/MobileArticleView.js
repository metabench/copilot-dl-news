'use strict';

/**
 * MobileArticleView - Touch-friendly article display
 * 
 * Features:
 * - Mobile-responsive layout
 * - Touch gestures (swipe navigation, pull-to-refresh)
 * - Offline reading support
 * - Reading progress tracking
 * - Save for offline button
 * 
 * Uses jsgui3 for isomorphic rendering.
 * 
 * @module MobileArticleView
 */

let jsgui;
try {
  jsgui = require('jsgui3-html');
} catch (err) {
  // Client-side - use global
  if (typeof window !== 'undefined' && window.jsgui) {
    jsgui = window.jsgui;
  }
}

/**
 * MobileArticleView Control
 * 
 * @extends jsgui.Control
 */
class MobileArticleView extends (jsgui?.Control || class {}) {
  /**
   * Create a MobileArticleView
   * 
   * @param {Object} spec - Configuration
   * @param {Object} spec.context - jsgui context
   * @param {Object} spec.article - Article data
   * @param {number} spec.article.id - Article ID
   * @param {string} spec.article.title - Article title
   * @param {string} spec.article.body - Article body HTML
   * @param {string} [spec.article.author] - Author name
   * @param {string} [spec.article.publishedAt] - Publication date
   * @param {string} [spec.article.host] - Source domain
   * @param {string} [spec.article.url] - Original URL
   * @param {string} [spec.article.imageUrl] - Featured image URL
   * @param {Object} [spec.options] - Display options
   * @param {boolean} [spec.options.showSaveButton=true] - Show save for offline button
   * @param {boolean} [spec.options.showShareButton=true] - Show share button
   * @param {boolean} [spec.options.showProgress=true] - Show reading progress
   * @param {boolean} [spec.options.enableSwipe=true] - Enable swipe navigation
   * @param {Object} [spec.offlineManager] - OfflineManager instance
   * @param {Function} [spec.onSave] - Callback when article is saved
   * @param {Function} [spec.onShare] - Callback when share is triggered
   * @param {Function} [spec.onSwipeLeft] - Callback for left swipe (next article)
   * @param {Function} [spec.onSwipeRight] - Callback for right swipe (previous article)
   */
  constructor(spec = {}) {
    const defaults = {
      tagName: 'article',
      __type_name: 'mobile_article_view'
    };
    
    super({ ...defaults, ...spec });
    
    this.article = spec.article || {};
    this.options = {
      showSaveButton: true,
      showShareButton: true,
      showProgress: true,
      enableSwipe: true,
      ...spec.options
    };
    
    this.offlineManager = spec.offlineManager || null;
    this.onSave = spec.onSave || null;
    this.onShare = spec.onShare || null;
    this.onSwipeLeft = spec.onSwipeLeft || null;
    this.onSwipeRight = spec.onSwipeRight || null;
    
    // Reading progress state
    this._scrollPercent = 0;
    this._startTime = null;
    this._isSaved = false;
    
    // Gesture tracking
    this._touchStartX = 0;
    this._touchStartY = 0;
    
    // Apply classes
    if (this.add_class) {
      this.add_class('mobile-article-view');
    }
    
    // Only compose if not activating existing DOM
    if (!spec.el && this.compose) {
      this.compose();
    }
  }

  /**
   * Compose the control structure
   */
  compose() {
    if (!jsgui) return;
    
    const ctx = this.context;
    const article = this.article;
    
    // Header with navigation and actions
    const header = new jsgui.Control({ context: ctx, tagName: 'header' });
    header.add_class('mobile-article-header');
    
    // Back button
    const backBtn = new jsgui.Control({ context: ctx, tagName: 'button' });
    backBtn.add_class('mobile-article-back');
    backBtn.dom.attributes.type = 'button';
    backBtn.dom.attributes['aria-label'] = 'Go back';
    backBtn.add('← Back');
    header.add(backBtn);
    
    // Source info
    if (article.host) {
      const source = new jsgui.Control({ context: ctx, tagName: 'span' });
      source.add_class('mobile-article-source');
      source.add(article.host);
      header.add(source);
    }
    
    // Action buttons container
    const actions = new jsgui.Control({ context: ctx, tagName: 'div' });
    actions.add_class('mobile-article-actions');
    
    if (this.options.showSaveButton) {
      const saveBtn = new jsgui.Control({ context: ctx, tagName: 'button' });
      saveBtn.add_class('mobile-article-save');
      saveBtn.dom.attributes.type = 'button';
      saveBtn.dom.attributes['aria-label'] = 'Save for offline';
      saveBtn.dom.attributes['data-action'] = 'save';
      saveBtn.add('📥');
      actions.add(saveBtn);
    }
    
    if (this.options.showShareButton) {
      const shareBtn = new jsgui.Control({ context: ctx, tagName: 'button' });
      shareBtn.add_class('mobile-article-share');
      shareBtn.dom.attributes.type = 'button';
      shareBtn.dom.attributes['aria-label'] = 'Share article';
      shareBtn.dom.attributes['data-action'] = 'share';
      shareBtn.add('📤');
      actions.add(shareBtn);
    }
    
    header.add(actions);
    this.add(header);
    
    // Featured image
    if (article.imageUrl) {
      const imageWrapper = new jsgui.Control({ context: ctx, tagName: 'div' });
      imageWrapper.add_class('mobile-article-image');
      
      const img = new jsgui.Control({ context: ctx, tagName: 'img' });
      img.dom.attributes.src = article.imageUrl;
      img.dom.attributes.alt = article.title || 'Article image';
      img.dom.attributes.loading = 'lazy';
      imageWrapper.add(img);
      
      this.add(imageWrapper);
    }
    
    // Article content container
    const content = new jsgui.Control({ context: ctx, tagName: 'div' });
    content.add_class('mobile-article-content');
    
    // Title
    const title = new jsgui.Control({ context: ctx, tagName: 'h1' });
    title.add_class('mobile-article-title');
    title.add(article.title || 'Untitled');
    content.add(title);
    
    // Meta info
    const meta = new jsgui.Control({ context: ctx, tagName: 'div' });
    meta.add_class('mobile-article-meta');
    
    if (article.author) {
      const author = new jsgui.Control({ context: ctx, tagName: 'span' });
      author.add_class('mobile-article-author');
      author.add(`By ${article.author}`);
      meta.add(author);
    }
    
    if (article.publishedAt) {
      const date = new jsgui.Control({ context: ctx, tagName: 'time' });
      date.add_class('mobile-article-date');
      date.dom.attributes.datetime = article.publishedAt;
      date.add(this._formatDate(article.publishedAt));
      meta.add(date);
    }
    
    if (meta._ctrl_fields && meta._ctrl_fields.length > 0) {
      content.add(meta);
    }
    
    // Body content
    const body = new jsgui.Control({ context: ctx, tagName: 'div' });
    body.add_class('mobile-article-body');
    body.dom.innerHTML = article.body || '<p>No content available.</p>';
    content.add(body);
    
    // Original link
    if (article.url) {
      const originalLink = new jsgui.Control({ context: ctx, tagName: 'a' });
      originalLink.add_class('mobile-article-original');
      originalLink.dom.attributes.href = article.url;
      originalLink.dom.attributes.target = '_blank';
      originalLink.dom.attributes.rel = 'noopener noreferrer';
      originalLink.add('View original article →');
      content.add(originalLink);
    }
    
    this.add(content);
    
    // Progress indicator
    if (this.options.showProgress) {
      const progress = new jsgui.Control({ context: ctx, tagName: 'div' });
      progress.add_class('mobile-article-progress');
      
      const progressBar = new jsgui.Control({ context: ctx, tagName: 'div' });
      progressBar.add_class('mobile-article-progress-bar');
      progressBar.dom.attributes.role = 'progressbar';
      progressBar.dom.attributes['aria-valuenow'] = '0';
      progressBar.dom.attributes['aria-valuemin'] = '0';
      progressBar.dom.attributes['aria-valuemax'] = '100';
      progress.add(progressBar);
      
      this.add(progress);
    }
  }

  /**
   * Activate the control (bind events)
   */
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this.dom?.el;
    if (!el) return;
    
    this._startTime = Date.now();
    
    // Action buttons
    el.addEventListener('click', (e) => this._handleClick(e));
    
    // Scroll tracking for reading progress
    if (this.options.showProgress) {
      window.addEventListener('scroll', () => this._updateProgress());
    }
    
    // Touch gestures
    if (this.options.enableSwipe) {
      el.addEventListener('touchstart', (e) => this._handleTouchStart(e), { passive: true });
      el.addEventListener('touchend', (e) => this._handleTouchEnd(e), { passive: true });
    }
    
    // Check if already saved
    this._checkSavedStatus();
  }

  /**
   * Handle click events
   * 
   * @param {Event} e
   * @private
   */
  _handleClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    
    const action = target.dataset.action;
    
    if (action === 'save') {
      this._saveForOffline();
    } else if (action === 'share') {
      this._shareArticle();
    }
  }

  /**
   * Save article for offline reading
   * 
   * @private
   */
  async _saveForOffline() {
    if (!this.offlineManager) {
      console.warn('[MobileArticleView] No OfflineManager available');
      return;
    }
    
    try {
      const result = await this.offlineManager.saveArticle(this.article);
      
      if (result.success) {
        this._isSaved = true;
        this._updateSaveButton(true);
        
        if (this.onSave) {
          this.onSave(this.article, result);
        }
      }
    } catch (err) {
      console.error('[MobileArticleView] Failed to save article:', err);
    }
  }

  /**
   * Share article using Web Share API
   * 
   * @private
   */
  async _shareArticle() {
    const shareData = {
      title: this.article.title,
      text: this.article.title,
      url: this.article.url || window.location.href
    };
    
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        
        if (this.onShare) {
          this.onShare(this.article, shareData);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[MobileArticleView] Share failed:', err);
        }
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareData.url);
        alert('Link copied to clipboard!');
        
        if (this.onShare) {
          this.onShare(this.article, { ...shareData, method: 'clipboard' });
        }
      } catch (err) {
        console.error('[MobileArticleView] Clipboard copy failed:', err);
      }
    }
  }

  /**
   * Update reading progress indicator
   * 
   * @private
   */
  _updateProgress() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    this._scrollPercent = Math.min(100, Math.round((scrollTop / docHeight) * 100));
    
    const progressBar = this.dom?.el?.querySelector('.mobile-article-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${this._scrollPercent}%`;
      progressBar.setAttribute('aria-valuenow', this._scrollPercent);
    }
    
    // Save progress to IndexedDB (throttled)
    this._throttledSaveProgress();
  }

  /**
   * Throttled save progress to avoid excessive writes
   * 
   * @private
   */
  _throttledSaveProgress() {
    if (this._saveProgressTimeout) return;
    
    this._saveProgressTimeout = setTimeout(async () => {
      this._saveProgressTimeout = null;
      
      if (this.offlineManager && this.article.id) {
        try {
          await this.offlineManager.saveProgress(this.article.id, {
            scrollPercent: this._scrollPercent,
            timeSpentMs: Date.now() - this._startTime,
            completed: this._scrollPercent >= 90
          });
        } catch (err) {
          // Silent fail for progress tracking
        }
      }
    }, 2000);
  }

  /**
   * Handle touch start
   * 
   * @param {TouchEvent} e
   * @private
   */
  _handleTouchStart(e) {
    this._touchStartX = e.changedTouches[0].screenX;
    this._touchStartY = e.changedTouches[0].screenY;
  }

  /**
   * Handle touch end for swipe detection
   * 
   * @param {TouchEvent} e
   * @private
   */
  _handleTouchEnd(e) {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    
    const deltaX = touchEndX - this._touchStartX;
    const deltaY = touchEndY - this._touchStartY;
    
    // Minimum swipe distance
    const minSwipeDistance = 100;
    
    // Check if horizontal swipe (not vertical scroll)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
      if (deltaX > 0 && this.onSwipeRight) {
        // Swipe right - previous article
        this.onSwipeRight();
      } else if (deltaX < 0 && this.onSwipeLeft) {
        // Swipe left - next article
        this.onSwipeLeft();
      }
    }
  }

  /**
   * Check if article is already saved
   * 
   * @private
   */
  async _checkSavedStatus() {
    if (!this.offlineManager || !this.article.id) return;
    
    try {
      this._isSaved = await this.offlineManager.isArticleSaved(this.article.id);
      this._updateSaveButton(this._isSaved);
    } catch (err) {
      // Silent fail
    }
  }

  /**
   * Update save button appearance
   * 
   * @param {boolean} isSaved
   * @private
   */
  _updateSaveButton(isSaved) {
    const saveBtn = this.dom?.el?.querySelector('.mobile-article-save');
    if (!saveBtn) return;
    
    if (isSaved) {
      saveBtn.innerHTML = '✅';
      saveBtn.setAttribute('aria-label', 'Saved for offline');
      saveBtn.classList.add('saved');
    } else {
      saveBtn.innerHTML = '📥';
      saveBtn.setAttribute('aria-label', 'Save for offline');
      saveBtn.classList.remove('saved');
    }
  }

  /**
   * Format date for display
   * 
   * @param {string} dateStr - ISO date string
   * @returns {string}
   * @private
   */
  _formatDate(dateStr) {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now - date;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      
      if (diffHours < 1) {
        return 'Just now';
      } else if (diffHours < 24) {
        return `${diffHours}h ago`;
      } else if (diffHours < 48) {
        return 'Yesterday';
      } else {
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
      }
    } catch (err) {
      return dateStr;
    }
  }

  /**
   * Get reading stats
   * 
   * @returns {Object}
   */
  getReadingStats() {
    return {
      articleId: this.article.id,
      scrollPercent: this._scrollPercent,
      timeSpentMs: this._startTime ? Date.now() - this._startTime : 0,
      completed: this._scrollPercent >= 90,
      isSaved: this._isSaved
    };
  }
}

/**
 * Get CSS for mobile article view
 * 
 * @returns {string}
 */
function getMobileArticleViewCss() {
  return `
    .mobile-article-view {
      --mobile-padding: 16px;
      --mobile-header-height: 56px;
      --mobile-progress-height: 3px;
      
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background: var(--theme-bg, #fff);
      color: var(--theme-text, #1a1a2e);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    .mobile-article-header {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: var(--mobile-header-height);
      padding: 0 var(--mobile-padding);
      background: var(--theme-surface, #f8f9fa);
      border-bottom: 1px solid var(--theme-border, #e0e0e0);
    }
    
    .mobile-article-back {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      background: none;
      border: none;
      color: var(--theme-primary, #4a90d9);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    
    .mobile-article-source {
      flex: 1;
      text-align: center;
      font-size: 12px;
      color: var(--theme-text-muted, #666);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 12px;
    }
    
    .mobile-article-actions {
      display: flex;
      gap: 8px;
    }
    
    .mobile-article-actions button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      padding: 0;
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      border-radius: 50%;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.2s;
    }
    
    .mobile-article-actions button:active {
      background: var(--theme-bg-hover, rgba(0,0,0,0.05));
    }
    
    .mobile-article-actions button.saved {
      color: var(--theme-success, #22c55e);
    }
    
    .mobile-article-image {
      width: 100%;
      aspect-ratio: 16/9;
      overflow: hidden;
      background: var(--theme-surface, #f0f0f0);
    }
    
    .mobile-article-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .mobile-article-content {
      flex: 1;
      padding: var(--mobile-padding);
    }
    
    .mobile-article-title {
      margin: 0 0 16px;
      font-size: 24px;
      font-weight: 700;
      line-height: 1.3;
      color: var(--theme-text, #1a1a2e);
    }
    
    .mobile-article-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
      font-size: 14px;
      color: var(--theme-text-muted, #666);
    }
    
    .mobile-article-author::after {
      content: '•';
      margin-left: 8px;
    }
    
    .mobile-article-body {
      font-size: 17px;
      line-height: 1.7;
      color: var(--theme-text, #333);
    }
    
    .mobile-article-body p {
      margin: 0 0 1em;
    }
    
    .mobile-article-body img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 1em 0;
    }
    
    .mobile-article-body a {
      color: var(--theme-primary, #4a90d9);
      text-decoration: none;
    }
    
    .mobile-article-body a:hover {
      text-decoration: underline;
    }
    
    .mobile-article-original {
      display: inline-block;
      margin-top: 24px;
      padding: 12px 24px;
      background: var(--theme-primary, #4a90d9);
      color: #fff;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
    }
    
    .mobile-article-progress {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: var(--mobile-progress-height);
      background: var(--theme-surface, #e0e0e0);
      z-index: 100;
    }
    
    .mobile-article-progress-bar {
      height: 100%;
      width: 0%;
      background: var(--theme-primary, #4a90d9);
      transition: width 0.1s ease-out;
    }
    
    /* Safe area for notched devices */
    @supports (padding-top: env(safe-area-inset-top)) {
      .mobile-article-header {
        padding-top: env(safe-area-inset-top);
        height: calc(var(--mobile-header-height) + env(safe-area-inset-top));
      }
      
      .mobile-article-progress {
        bottom: env(safe-area-inset-bottom);
      }
    }
    
    /* Dark mode */
    @media (prefers-color-scheme: dark) {
      .mobile-article-view {
        --theme-bg: #1a1a2e;
        --theme-surface: #2a2a3e;
        --theme-text: #e0e0e0;
        --theme-text-muted: #a0a0a0;
        --theme-border: #3a3a4e;
        --theme-bg-hover: rgba(255,255,255,0.1);
      }
    }
  `;
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MobileArticleView, getMobileArticleViewCss };
}

if (typeof window !== 'undefined') {
  window.MobileArticleView = MobileArticleView;
  window.getMobileArticleViewCss = getMobileArticleViewCss;
}
