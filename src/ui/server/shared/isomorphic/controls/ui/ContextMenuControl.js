/**
 * @fileoverview ContextMenuControl - isomorphic context menu with mouse and keyboard support.
 *
 * Provides a simple, agent-friendly context menu that can be positioned at arbitrary coordinates
 * (e.g., right-click target) and works in SSR + client contexts. Items support disabled state,
 * optional icons/shortcuts, and raise a single `item-selected` event when chosen.
 *
 * ## Key Features
 * - Programmatic open/close with coordinate anchoring
 * - Click-outside + Escape to dismiss
 * - Arrow key navigation with Enter/Space activation
 * - Optional item callbacks via `onSelect`
 *
 * ## Item Shape
 * ```typescript
 * interface ContextMenuItem {
 *   id: string;
 *   label: string;
 *   icon?: string;
 *   shortcut?: string;
 *   disabled?: boolean;
 *   danger?: boolean;
 *   onSelect?: (item: ContextMenuItem) => void;
 * }
 * ```
 *
 * @module shared/isomorphic/controls/ui/ContextMenuControl
 */

const jsgui = require('jsgui3-html');
const { Control } = jsgui;

class ContextMenuControl extends Control {
  /**
   * @param {Object} [spec]
   * @param {ContextMenuItem[]} [spec.items=[]] - Menu items.
   * @param {{x:number,y:number}} [spec.anchor={x:0,y:0}] - Initial anchor position.
   * @param {boolean} [spec.closeOnSelect=true] - Whether to close after selection.
   * @param {number} [spec.maxHeight=320] - Max height before scroll.
   * @param {number} [spec.minWidth=160] - Minimum width for the menu.
   */
  constructor(spec = {}) {
    const {
      items = [],
      anchor = { x: 0, y: 0 },
      closeOnSelect = true,
      maxHeight = 320,
      minWidth = 160,
      tagName = 'div',
      ...rest
    } = spec;

    super({ tagName, ...rest });

    this.items = items;
    this.anchor = anchor;
    this.closeOnSelect = closeOnSelect;
    this.maxHeight = maxHeight;
    this.minWidth = minWidth;

    this._itemControls = [];
    this._isOpen = false;
    this._activeIndex = -1;
    this._docClickHandler = null;
    this._docKeyHandler = null;
  }

  /**
   * Build DOM structure.
   * @protected
   */
  compose() {
    this.add_class('context-menu-control');
    this.style.setProperty('position', 'absolute');
    this.style.setProperty('display', 'none');
    this.style.setProperty('min-width', `${this.minWidth}px`);
    this.style.setProperty('max-height', `${this.maxHeight}px`);

    this.dom.attributes.tabindex = '-1';
    this.style.setProperty('left', `${this.anchor.x}px`);
    this.style.setProperty('top', `${this.anchor.y}px`);

    this.list = new Control({ context: this.context, tagName: 'ul' });
    this.list.add_class('context-menu-list');
    this.add(this.list);

    this._renderItems();
  }

  /**
   * Wire up event handlers.
   * @protected
   */
  activate() {
    super.activate();
    this._attachItemHandlers();
  }

  /**
   * Render items into the list.
   * @private
   */
  _renderItems() {
    if (this.list) {
      this.list.clear();
    }
    this._itemControls = [];

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const li = new Control({ context: this.context, tagName: 'li' });
      li.add_class('context-menu-item');
      li.dom.attributes.role = 'menuitem';
      li.dom.attributes['data-index'] = String(i);

      if (item.disabled) {
        li.add_class('context-menu-item-disabled');
        li.dom.attributes['aria-disabled'] = 'true';
      }
      if (item.danger) {
        li.add_class('context-menu-item-danger');
      }

      if (item.icon) {
        const iconCtrl = new Control({ context: this.context, tagName: 'span' });
        iconCtrl.add_class('context-menu-item-icon');
        iconCtrl.add(item.icon);
        li.add(iconCtrl);
      }

      const labelCtrl = new Control({ context: this.context, tagName: 'span' });
      labelCtrl.add_class('context-menu-item-label');
      labelCtrl.add(item.label);
      li.add(labelCtrl);

      if (item.shortcut) {
        const shortcutCtrl = new Control({ context: this.context, tagName: 'span' });
        shortcutCtrl.add_class('context-menu-item-shortcut');
        shortcutCtrl.add(item.shortcut);
        li.add(shortcutCtrl);
      }

      this.list.add(li);
      this._itemControls.push(li);
    }
  }

  /**
   * Set up per-item handlers.
   * @private
   */
  _attachItemHandlers() {
    for (let i = 0; i < this._itemControls.length; i++) {
      const ctrl = this._itemControls[i];
      const item = this.items[i];

      ctrl.on('click', () => {
        if (item.disabled) return;
        this._activateItem(i);
      });
    }
  }

  /**
   * Attach global listeners when open.
   * @private
   */
  _attachGlobalHandlers() {
    if (typeof document === 'undefined') return;

    if (!this._docClickHandler) {
      this._docClickHandler = (e) => {
        if (!this._isOpen) return;
        if (!this.dom || !this.dom.el) return;
        if (!this.dom.el.contains(e.target)) {
          this.close();
        }
      };
      document.addEventListener('mousedown', this._docClickHandler, true);
    }

    if (!this._docKeyHandler) {
      this._docKeyHandler = (e) => {
        if (!this._isOpen) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this._moveActive(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this._moveActive(-1);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (this._activeIndex >= 0) {
            this._activateItem(this._activeIndex);
          }
        }
      };
      document.addEventListener('keydown', this._docKeyHandler, true);
    }
  }

  /**
   * Detach global listeners.
   * @private
   */
  _detachGlobalHandlers() {
    if (typeof document === 'undefined') return;

    if (this._docClickHandler) {
      document.removeEventListener('mousedown', this._docClickHandler, true);
      this._docClickHandler = null;
    }
    if (this._docKeyHandler) {
      document.removeEventListener('keydown', this._docKeyHandler, true);
      this._docKeyHandler = null;
    }
  }

  /**
   * Activate an item by index.
   * @param {number} index
   * @private
   */
  _activateItem(index) {
    const item = this.items[index];
    if (!item || item.disabled) return;

    this._activeIndex = index;
    this._refreshActiveClass();

    if (typeof item.onSelect === 'function') {
      item.onSelect(item);
    }

    this.raise('item-selected', {
      item,
      index,
      menu: this
    });

    if (this.closeOnSelect) {
      this.close();
    }
  }

  /**
   * Move active index with wrap-around.
   * @param {number} delta
   * @private
   */
  _moveActive(delta) {
    if (!this._itemControls.length) return;

    let next = this._activeIndex;
    const count = this._itemControls.length;
    for (let i = 0; i < count; i++) {
      next = (next + delta + count) % count;
      const candidate = this.items[next];
      if (!candidate.disabled) {
        this._activeIndex = next;
        this._refreshActiveClass();
        break;
      }
    }
  }

  /**
   * Apply active CSS class to the current index.
   * @private
   */
  _refreshActiveClass() {
    for (let i = 0; i < this._itemControls.length; i++) {
      const ctrl = this._itemControls[i];
      if (i === this._activeIndex) {
        ctrl.add_class('context-menu-item-active');
      } else {
        ctrl.remove_class('context-menu-item-active');
      }
    }
  }

  /**
   * Clamp menu within viewport when available.
   * @private
   */
  _clampToViewport() {
    if (typeof window === 'undefined' || !this.dom?.el) return;

    const { innerWidth, innerHeight } = window;
    const rect = this.dom.el.getBoundingClientRect();

    let left = this.anchor.x;
    let top = this.anchor.y;

    if (rect.width + left > innerWidth) {
      left = Math.max(0, innerWidth - rect.width - 8);
    }
    if (rect.height + top > innerHeight) {
      top = Math.max(0, innerHeight - rect.height - 8);
    }

    this.style.setProperty('left', `${left}px`);
    this.style.setProperty('top', `${top}px`);
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Open the menu at the given coordinates.
   * @param {{x:number,y:number}} anchor
   */
  openAt(anchor) {
    this.anchor = anchor;
    this.style.setProperty('left', `${anchor.x}px`);
    this.style.setProperty('top', `${anchor.y}px`);
    this.style.setProperty('display', 'block');
    this._isOpen = true;

    // Choose the first enabled item
    this._activeIndex = this.items.findIndex(item => !item.disabled);
    this._refreshActiveClass();

    this._attachGlobalHandlers();
    this._clampToViewport();

    if (this.dom?.el) {
      this.dom.el.focus();
    }

    this.raise('menu-opened', {
      anchor,
      menu: this
    });
  }

  /**
   * Close the menu and remove handlers.
   */
  close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.style.setProperty('display', 'none');
    this._detachGlobalHandlers();

    this.raise('menu-closed', {
      menu: this
    });
  }

  /**
   * Replace menu items and re-render.
   * @param {ContextMenuItem[]} items
   */
  setItems(items) {
    this.items = items || [];
    if (this.list) {
      this._renderItems();
      if (this.dom?.el) {
        this._attachItemHandlers();
      }
    }
  }

  /**
   * Whether the menu is currently open.
   * @returns {boolean}
   */
  isOpen() {
    return this._isOpen;
  }
}

module.exports = ContextMenuControl;
