/**
 * @fileoverview SelectableControl - An isomorphic control that wraps the jsgui3-html
 * `selectable` mixin to provide selection functionality for any jsgui3 control.
 * 
 * This control is designed for use in list views, grids, file browsers, diagram editors,
 * and any interface requiring selection. It supports single selection, multi-selection,
 * toggle selection, and integrates with SelectionScopeControl for group selection management.
 * 
 * ## Key Features
 * - **Isomorphic**: Works in both server-side rendering and client-side hydration
 * - **Selection Modes**: Single selection, multi-selection (Ctrl+click), toggle selection
 * - **Visual Feedback**: Automatic `selected` CSS class for styling
 * - **Event System**: `select`, `deselect` events for state tracking
 * - **Scope Integration**: Works with SelectionScopeControl for managing groups
 * 
 * ## Usage Examples
 * 
 * ### Basic Selectable Item
 * ```javascript
 * const SelectableControl = require('shared/isomorphic/controls/interactive/SelectableControl');
 * 
 * class FileItem extends SelectableControl {
 *   compose() {
 *     super.compose();
 *     this.add_class('file-item');
 *     this.add(this.spec.fileName);
 *   }
 * }
 * 
 * // Usage
 * const item = new FileItem({
 *   context: this.context,
 *   fileName: 'document.pdf',
 *   selectable: true,
 *   toggleSelection: true
 * });
 * ```
 * 
 * ### Multi-Selection List
 * ```javascript
 * items.forEach(itemData => {
 *   const item = new SelectableControl({
 *     context: this.context,
 *     selectable: true,
 *     multiSelect: true  // Ctrl+click adds to selection
 *   });
 *   item.add(itemData.name);
 *   listContainer.add(item);
 * });
 * ```
 * 
 * ### With Selection Scope
 * ```javascript
 * const scope = new SelectionScopeControl({ context: this.context });
 * 
 * items.forEach(itemData => {
 *   const item = new SelectableControl({
 *     context: this.context,
 *     selectable: true
 *   });
 *   scope.add(item);  // Item now participates in scope selection
 * });
 * 
 * // Get all selected items
 * const selected = scope.getSelectedItems();
 * ```
 * 
 * ### Event Handling
 * ```javascript
 * item.on('select', () => {
 *   console.log('Item selected');
 *   showProperties(item);
 * });
 * 
 * item.on('deselect', () => {
 *   console.log('Item deselected');
 *   hideProperties();
 * });
 * ```
 * 
 * ## CSS Classes Applied
 * - `.selectable-control` - Always present
 * - `.selectable` - When selection is enabled
 * - `.selected` - When the control is selected
 * 
 * ## Selection Modes Explained
 * 
 * | Mode | Behavior |
 * |------|----------|
 * | Single (default) | Click selects item, deselects others |
 * | Multi (`multiSelect: true`) | Ctrl/Cmd+click adds to selection |
 * | Toggle (`toggleSelection: true`) | Click toggles selection state |
 * 
 * @module shared/isomorphic/controls/interactive/SelectableControl
 * @requires jsgui3-html
 * @see {@link https://github.com/nicktackes/jsgui3-html|jsgui3-html} for the underlying mixin
 */

const jsgui = require('jsgui3-html');
const { Control } = jsgui;
const selectable = require('jsgui3-html/control_mixins/selectable');

/**
 * Event data for selection events
 * @typedef {Object} SelectionEvent
 * @property {SelectableControl} target - The control that was selected/deselected
 * @property {boolean} selected - The new selection state
 */

/**
 * Configuration options for SelectableControl
 * @typedef {Object} SelectableControlOptions
 * @property {Object} context - jsgui3 context object (required)
 * @property {boolean} [selectable=true] - Whether selection is enabled
 * @property {boolean} [selected=false] - Initial selection state
 * @property {boolean} [toggleSelection=false] - Whether clicking toggles selection
 * @property {boolean} [multiSelect=false] - Whether Ctrl+click adds to selection
 * @property {string[]} [selectionAction=['mousedown', 'touchstart']] - Events that trigger selection
 * @property {boolean} [preventDefault=true] - Whether to prevent default on selection
 * @property {Function} [condition] - Function returning boolean, selection only works if true
 * @property {Control} [handle] - Specific control to use as selection handle
 * @property {string} [tagName='div'] - HTML tag to use for the control
 */

/**
 * SelectableControl - Isomorphic control providing selection functionality.
 * 
 * Wraps the jsgui3-html `selectable` mixin to provide a clean, reusable control
 * for selection interfaces.
 * 
 * @extends Control
 */
class SelectableControl extends Control {
  /**
   * Creates a new SelectableControl instance.
   * 
   * @param {SelectableControlOptions} spec - Configuration options
   * @throws {Error} If context is not provided
   * 
   * @example
   * const ctrl = new SelectableControl({
   *   context: this.context,
   *   selectable: true,
   *   toggleSelection: true
   * });
   */
  constructor(spec = {}) {
    // Extract our options before passing to parent
    const {
      selectable: selectableOpt = true,
      selected = false,
      toggleSelection = false,
      multiSelect = false,
      selectionAction = ['mousedown', 'touchstart'],
      preventDefault = true,
      condition,
      handle,
      ...parentSpec
    } = spec;
    
    super(parentSpec);
    
    /**
     * Whether selection is enabled
     * @type {boolean}
     * @private
     */
    this._selectable = selectableOpt;
    
    /**
     * Initial selection state
     * @type {boolean}
     * @private
     */
    this._initialSelected = selected;
    
    /**
     * Whether clicking toggles selection
     * @type {boolean}
     * @private
     */
    this._toggleSelection = toggleSelection;
    
    /**
     * Whether multi-select is enabled
     * @type {boolean}
     * @private
     */
    this._multiSelect = multiSelect;
    
    /**
     * Events that trigger selection
     * @type {string[]}
     * @private
     */
    this._selectionAction = selectionAction;
    
    /**
     * Whether to prevent default
     * @type {boolean}
     * @private
     */
    this._preventDefault = preventDefault;
    
    /**
     * Condition function for selection
     * @type {Function|null}
     * @private
     */
    this._condition = condition || null;
    
    /**
     * Selection handle control
     * @type {Control|null}
     * @private
     */
    this._handle = handle || null;
  }
  
  /**
   * Composes the control's DOM structure.
   * Called automatically during control construction.
   * Override in subclasses to add child elements.
   * 
   * @protected
   */
  compose() {
    // Add base CSS class
    this.add_class('selectable-control');
    
    // Add selectable class if enabled
    if (this._selectable) {
      this.add_class('selectable');
    }
    
    // Add selected class if initially selected
    if (this._initialSelected) {
      this.add_class('selected');
    }
    
    // Set up server-side render event for state persistence
    this.on('server-pre-render', () => {
      this._fields = this._fields || {};
      this._fields.selectable = this._selectable;
      this._fields.selected = this.selected;
      this._fields.toggleSelection = this._toggleSelection;
      this._fields.multiSelect = this._multiSelect;
    });
  }
  
  /**
   * Activates the control, binding event handlers.
   * Called when the control is attached to the DOM.
   * 
   * @protected
   */
  activate() {
    super.activate();
    
    // Restore state from server-rendered fields if present
    if (this._fields) {
      if (this._fields.selectable !== undefined) this._selectable = this._fields.selectable;
      if (this._fields.toggleSelection !== undefined) this._toggleSelection = this._fields.toggleSelection;
      if (this._fields.multiSelect !== undefined) this._multiSelect = this._fields.multiSelect;
    }
    
    // Apply the selectable mixin
    this._setupSelectable();
  }
  
  /**
   * Sets up the selectable mixin with current configuration.
   * @private
   */
  _setupSelectable() {
    // Build mixin options
    const mixinOpts = {
      toggle: this._toggleSelection,
      multi: this._multiSelect,
      selection_action: this._selectionAction,
      preventDefault: this._preventDefault
    };
    
    if (this._condition) {
      mixinOpts.condition = this._condition;
    }
    
    if (this._handle) {
      mixinOpts.handle = this._handle;
    }
    
    // Apply the mixin (selectable takes ctrl, handle, opts)
    selectable(this, null, mixinOpts);
    
    // Set initial state
    this.selectable = this._selectable;
    if (this._initialSelected) {
      this.selected = true;
    }
    
    // Listen to selection changes and emit richer events
    this.on('select', () => {
      this.raise('selection-changed', {
        target: this,
        selected: true
      });
    });
    
    this.on('deselect', () => {
      this.raise('selection-changed', {
        target: this,
        selected: false
      });
    });
  }
  
  // ============================================
  // Public API
  // ============================================
  
  /**
   * Checks if the control is currently selected.
   * @returns {boolean}
   */
  isSelected() {
    return this.selected === true;
  }
  
  /**
   * Selects this control.
   * If a selection scope is present, uses scope selection.
   */
  doSelect() {
    if (this.select) {
      this.select();
    } else {
      this.selected = true;
    }
  }
  
  /**
   * Deselects this control.
   * If a selection scope is present, uses scope deselection.
   */
  doDeselect() {
    if (this.deselect) {
      this.deselect();
    } else {
      this.selected = false;
    }
  }
  
  /**
   * Toggles the selection state.
   */
  toggleSelect() {
    if (this.selected) {
      this.doDeselect();
    } else {
      this.doSelect();
    }
  }
  
  /**
   * Enables or disables selection.
   * @param {boolean} enabled - Whether selection should be enabled
   */
  setSelectable(enabled) {
    this._selectable = enabled;
    this.selectable = enabled;
    
    if (enabled) {
      this.add_class('selectable');
    } else {
      this.remove_class('selectable');
      this.remove_class('selected');
    }
  }
  
  /**
   * Checks if selection is enabled.
   * @returns {boolean}
   */
  isSelectableEnabled() {
    return this._selectable;
  }
  
  /**
   * Sets a specific control as the selection handle.
   * Only interactions with this handle will trigger selection.
   * 
   * @param {Control} handle - The control to use as selection handle
   */
  setSelectionHandle(handle) {
    this._handle = handle;
  }
  
  /**
   * Sets a condition function that must return true for selection to work.
   * 
   * @param {Function} conditionFn - Function returning boolean
   * @example
   * ctrl.setCondition(() => !isReadOnly);
   */
  setCondition(conditionFn) {
    this._condition = conditionFn;
  }
  
  /**
   * Enables or disables toggle mode.
   * In toggle mode, clicking toggles selection instead of always selecting.
   * 
   * @param {boolean} enabled - Whether toggle mode should be enabled
   */
  setToggleMode(enabled) {
    this._toggleSelection = enabled;
  }
  
  /**
   * Enables or disables multi-select mode.
   * In multi-select mode, Ctrl+click adds to selection instead of replacing.
   * 
   * @param {boolean} enabled - Whether multi-select should be enabled
   */
  setMultiSelectMode(enabled) {
    this._multiSelect = enabled;
  }
}

module.exports = SelectableControl;
