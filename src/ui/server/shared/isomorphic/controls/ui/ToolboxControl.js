/**
 * @fileoverview ToolboxControl - An isomorphic control that provides a palette of
 * draggable tools/shapes for WYSIWYG editors and visual composition interfaces.
 * 
 * This control displays a collection of tool items that can be dragged onto a canvas.
 * It supports grouping, collapsible sections, and different layout modes.
 * 
 * ## Key Features
 * - **Tool Palette**: Displays tools/shapes that can be dragged to a canvas
 * - **Grouping**: Organize tools into collapsible categories
 * - **Drag Source**: Tools act as drag sources for canvas drop targets
 * - **Layout Modes**: Grid, list, or compact layouts
 * - **Tool Templates**: Define tool prototypes that create instances when dropped
 * 
 * ## Usage Examples
 * 
 * ### Basic Toolbox
 * ```javascript
 * const ToolboxControl = require('shared/isomorphic/controls/ui/ToolboxControl');
 * 
 * class DiagramEditor extends Control {
 *   compose() {
 *     this.toolbox = new ToolboxControl({
 *       context: this.context,
 *       layout: 'grid',
 *       tools: [
 *         { id: 'rectangle', label: 'Rectangle', icon: '▭', type: 'shape' },
 *         { id: 'diamond', label: 'Diamond', icon: '◇', type: 'shape' },
 *         { id: 'circle', label: 'Circle', icon: '○', type: 'shape' },
 *         { id: 'arrow', label: 'Arrow', icon: '→', type: 'connector' }
 *       ]
 *     });
 *     this.add(this.toolbox);
 *   }
 * }
 * ```
 * 
 * ### With Groups
 * ```javascript
 * const toolbox = new ToolboxControl({
 *   context: this.context,
 *   groups: [
 *     {
 *       id: 'shapes',
 *       label: 'Shapes',
 *       icon: '📐',
 *       tools: [
 *         { id: 'rectangle', label: 'Rectangle', icon: '▭' },
 *         { id: 'diamond', label: 'Diamond', icon: '◇' }
 *       ]
 *     },
 *     {
 *       id: 'connectors',
 *       label: 'Connectors',
 *       icon: '🔗',
 *       tools: [
 *         { id: 'arrow', label: 'Arrow', icon: '→' },
 *         { id: 'line', label: 'Line', icon: '─' }
 *       ]
 *     }
 *   ]
 * });
 * ```
 * 
 * ### Handling Tool Selection
 * ```javascript
 * toolbox.on('tool-selected', (e) => {
 *   console.log(`Selected tool: ${e.tool.id}`);
 *   // User can now click on canvas to place
 * });
 * 
 * toolbox.on('tool-drag-start', (e) => {
 *   console.log(`Started dragging: ${e.tool.id}`);
 * });
 * ```
 * 
 * ### Registering Tool Factories
 * ```javascript
 * // Register a factory that creates the actual control when dropped
 * toolbox.registerToolFactory('rectangle', (tool, position) => {
 *   return new RectangleShape({
 *     context: this.context,
 *     width: 100,
 *     height: 60,
 *     position
 *   });
 * });
 * ```
 * 
 * ## CSS Classes Applied
 * - `.toolbox-control` - Main container
 * - `.toolbox-layout-grid` / `.toolbox-layout-list` / `.toolbox-layout-compact` - Layout mode
 * - `.toolbox-group` - Group container
 * - `.toolbox-group-header` - Group header (click to collapse)
 * - `.toolbox-group-collapsed` - When group is collapsed
 * - `.toolbox-tool` - Individual tool item
 * - `.toolbox-tool-selected` - Currently selected tool
 * - `.toolbox-tool-icon` - Tool icon element
 * - `.toolbox-tool-label` - Tool label element
 * 
 * ## Tool Definition
 * 
 * ```typescript
 * interface ToolDefinition {
 *   id: string;          // Unique identifier
 *   label: string;       // Display label
 *   icon?: string;       // Icon (emoji, character, or CSS class)
 *   type?: string;       // Tool type for categorization
 *   data?: any;          // Custom data passed to factory
 *   disabled?: boolean;  // Whether tool is disabled
 * }
 * ```
 * 
 * @module shared/isomorphic/controls/ui/ToolboxControl
 * @requires jsgui3-html
 */

const jsgui = require('jsgui3-html');
const { Control } = jsgui;

/**
 * Tool definition object
 * @typedef {Object} ToolDefinition
 * @property {string} id - Unique identifier for the tool
 * @property {string} label - Display label
 * @property {string} [icon] - Icon to display (emoji, character, or CSS class)
 * @property {string} [type] - Tool type for categorization
 * @property {*} [data] - Custom data passed to factory when creating instances
 * @property {boolean} [disabled=false] - Whether the tool is disabled
 */

/**
 * Tool group definition
 * @typedef {Object} ToolGroupDefinition
 * @property {string} id - Unique identifier for the group
 * @property {string} label - Display label for the group header
 * @property {string} [icon] - Icon for the group header
 * @property {ToolDefinition[]} tools - Tools in this group
 * @property {boolean} [collapsed=false] - Whether group starts collapsed
 */

/**
 * Event data for tool-selected event
 * @typedef {Object} ToolSelectedEvent
 * @property {ToolDefinition} tool - The selected tool
 * @property {ToolboxControl} toolbox - This toolbox
 */

/**
 * Configuration options for ToolboxControl
 * @typedef {Object} ToolboxControlOptions
 * @property {Object} context - jsgui3 context object (required)
 * @property {ToolDefinition[]} [tools] - Flat list of tools (if not using groups)
 * @property {ToolGroupDefinition[]} [groups] - Grouped tools
 * @property {'grid'|'list'|'compact'} [layout='grid'] - Layout mode
 * @property {boolean} [collapsible=true] - Whether groups can be collapsed
 * @property {string} [title] - Optional title for the toolbox
 * @property {number} [gridColumns=2] - Number of columns in grid layout
 * @property {string} [tagName='div'] - HTML tag to use
 */

/**
 * ToolboxControl - Isomorphic control providing a tool palette.
 * 
 * Displays draggable tools/shapes that can be placed on a canvas.
 * 
 * @extends Control
 */
class ToolboxControl extends Control {
  /**
   * Creates a new ToolboxControl instance.
   * 
   * @param {ToolboxControlOptions} spec - Configuration options
   * 
   * @example
   * const toolbox = new ToolboxControl({
   *   context: this.context,
   *   layout: 'grid',
   *   tools: [
   *     { id: 'rect', label: 'Rectangle', icon: '▭' }
   *   ]
   * });
   */
  constructor(spec = {}) {
    const {
      tools = [],
      groups = [],
      layout = 'grid',
      collapsible = true,
      title,
      gridColumns = 2,
      ...parentSpec
    } = spec;
    
    super(parentSpec);
    
    /**
     * Flat list of tools (if not using groups)
     * @type {ToolDefinition[]}
     */
    this.tools = tools;
    
    /**
     * Tool groups
     * @type {ToolGroupDefinition[]}
     */
    this.groups = groups;
    
    /**
     * Layout mode
     * @type {'grid'|'list'|'compact'}
     */
    this.layout = layout;
    
    /**
     * Whether groups can be collapsed
     * @type {boolean}
     */
    this.collapsible = collapsible;
    
    /**
     * Toolbox title
     * @type {string|undefined}
     */
    this.title = title;
    
    /**
     * Number of columns in grid layout
     * @type {number}
     */
    this.gridColumns = gridColumns;
    
    /**
     * Currently selected tool
     * @type {ToolDefinition|null}
     */
    this.selectedTool = null;
    
    /**
     * Map of tool IDs to their controls
     * @type {Map<string, Control>}
     * @private
     */
    this._toolControls = new Map();
    
    /**
     * Map of tool IDs to their factory functions
     * @type {Map<string, Function>}
     * @private
     */
    this._toolFactories = new Map();
    
    /**
     * Map of group IDs to their controls
     * @type {Map<string, Control>}
     * @private
     */
    this._groupControls = new Map();
  }
  
  /**
   * Composes the control's DOM structure.
   * @protected
   */
  compose() {
    // Add base CSS classes
    this.add_class('toolbox-control');
    this.add_class(`toolbox-layout-${this.layout}`);
    
    // Set grid columns CSS variable for grid layout
    if (this.layout === 'grid') {
      this.style.setProperty('--toolbox-columns', this.gridColumns);
    }
    
    // Add title if specified
    if (this.title) {
      this.ctrl_title = new Control({ context: this.context, tagName: 'div' });
      this.ctrl_title.add_class('toolbox-title');
      this.ctrl_title.add(this.title);
      this.add(this.ctrl_title);
    }
    
    // Create content container
    this.ctrl_content = new Control({ context: this.context, tagName: 'div' });
    this.ctrl_content.add_class('toolbox-content');
    this.add(this.ctrl_content);
    
    // Render tools - either grouped or flat
    if (this.groups.length > 0) {
      this._renderGroups();
    } else if (this.tools.length > 0) {
      this._renderTools(this.tools, this.ctrl_content);
    }
    
    // Server-side render state
    this.on('server-pre-render', () => {
      this._fields = this._fields || {};
      this._fields.layout = this.layout;
      this._fields.selectedToolId = this.selectedTool?.id || null;
      this._fields.collapsedGroups = this._getCollapsedGroupIds();
    });
  }
  
  /**
   * Renders grouped tools.
   * @private
   */
  _renderGroups() {
    for (const group of this.groups) {
      const groupCtrl = new Control({ context: this.context, tagName: 'div' });
      groupCtrl.add_class('toolbox-group');
      
      if (group.collapsed) {
        groupCtrl.add_class('toolbox-group-collapsed');
      }
      
      // Group header
      const headerCtrl = new Control({ context: this.context, tagName: 'div' });
      headerCtrl.add_class('toolbox-group-header');
      
      // Collapse indicator
      const collapseIndicator = new Control({ context: this.context, tagName: 'span' });
      collapseIndicator.add_class('toolbox-collapse-indicator');
      collapseIndicator.add(group.collapsed ? '▶' : '▼');
      headerCtrl.add(collapseIndicator);
      
      // Icon
      if (group.icon) {
        const iconCtrl = new Control({ context: this.context, tagName: 'span' });
        iconCtrl.add_class('toolbox-group-icon');
        iconCtrl.add(group.icon);
        headerCtrl.add(iconCtrl);
      }
      
      // Label
      const labelCtrl = new Control({ context: this.context, tagName: 'span' });
      labelCtrl.add_class('toolbox-group-label');
      labelCtrl.add(group.label);
      headerCtrl.add(labelCtrl);
      
      groupCtrl.add(headerCtrl);
      
      // Tools container
      const toolsContainer = new Control({ context: this.context, tagName: 'div' });
      toolsContainer.add_class('toolbox-group-tools');
      if (this.layout === 'grid') {
        toolsContainer.add_class('toolbox-grid');
      }
      
      this._renderTools(group.tools, toolsContainer);
      groupCtrl.add(toolsContainer);
      
      // Store references
      groupCtrl._groupId = group.id;
      groupCtrl._headerCtrl = headerCtrl;
      groupCtrl._toolsContainer = toolsContainer;
      groupCtrl._collapseIndicator = collapseIndicator;
      this._groupControls.set(group.id, groupCtrl);
      
      this.ctrl_content.add(groupCtrl);
    }
  }
  
  /**
   * Renders a list of tools into a container.
   * @param {ToolDefinition[]} tools - Tools to render
   * @param {Control} container - Container to add tools to
   * @private
   */
  _renderTools(tools, container) {
    for (const tool of tools) {
      const toolCtrl = this._createToolControl(tool);
      container.add(toolCtrl);
      this._toolControls.set(tool.id, toolCtrl);
    }
  }
  
  /**
   * Creates a control for a single tool.
   * @param {ToolDefinition} tool - Tool definition
   * @returns {Control} The tool control
   * @private
   */
  _createToolControl(tool) {
    const toolCtrl = new Control({ context: this.context, tagName: 'div' });
    toolCtrl.add_class('toolbox-tool');
    toolCtrl._toolDef = tool;
    
    if (tool.disabled) {
      toolCtrl.add_class('toolbox-tool-disabled');
    }
    
    // Make draggable
    toolCtrl.dom.attributes.draggable = 'true';
    
    // Icon
    if (tool.icon) {
      const iconCtrl = new Control({ context: this.context, tagName: 'span' });
      iconCtrl.add_class('toolbox-tool-icon');
      
      // Check if icon is a CSS class (starts with a letter) or character
      if (/^[a-zA-Z]/.test(tool.icon) && tool.icon.includes('-')) {
        iconCtrl.add_class(tool.icon);
      } else {
        iconCtrl.add(tool.icon);
      }
      
      toolCtrl.add(iconCtrl);
    }
    
    // Label
    const labelCtrl = new Control({ context: this.context, tagName: 'span' });
    labelCtrl.add_class('toolbox-tool-label');
    labelCtrl.add(tool.label);
    toolCtrl.add(labelCtrl);
    
    return toolCtrl;
  }
  
  /**
   * Gets IDs of collapsed groups.
   * @returns {string[]}
   * @private
   */
  _getCollapsedGroupIds() {
    const collapsed = [];
    for (const [id, ctrl] of this._groupControls) {
      if (ctrl.has_class('toolbox-group-collapsed')) {
        collapsed.push(id);
      }
    }
    return collapsed;
  }
  
  /**
   * Activates the control.
   * @protected
   */
  activate() {
    super.activate();
    
    // Restore collapsed state from SSR
    if (this._fields?.collapsedGroups) {
      for (const groupId of this._fields.collapsedGroups) {
        const groupCtrl = this._groupControls.get(groupId);
        if (groupCtrl) {
          groupCtrl.add_class('toolbox-group-collapsed');
          if (groupCtrl._collapseIndicator) {
            groupCtrl._collapseIndicator.dom.el.textContent = '▶';
          }
        }
      }
    }
    
    // Restore selected tool from SSR
    if (this._fields?.selectedToolId) {
      const toolCtrl = this._toolControls.get(this._fields.selectedToolId);
      if (toolCtrl) {
        this._selectToolControl(toolCtrl);
      }
    }
    
    // Set up event handlers
    this._setupEventHandlers();
  }
  
  /**
   * Sets up event handlers for tools and groups.
   * @private
   */
  _setupEventHandlers() {
    // Tool click and drag handlers
    for (const [id, toolCtrl] of this._toolControls) {
      const tool = toolCtrl._toolDef;
      
      // Click to select
      toolCtrl.on('click', (e) => {
        if (!tool.disabled) {
          this.selectTool(tool.id);
        }
      });
      
      // Drag start
      toolCtrl.on('dragstart', (e) => {
        if (!tool.disabled) {
          e.dataTransfer.setData('application/x-toolbox-tool', JSON.stringify(tool));
          e.dataTransfer.effectAllowed = 'copy';
          
          toolCtrl.add_class('toolbox-tool-dragging');
          
          this.raise('tool-drag-start', {
            tool,
            toolbox: this
          });
        }
      });
      
      // Drag end
      toolCtrl.on('dragend', (e) => {
        toolCtrl.remove_class('toolbox-tool-dragging');
        
        this.raise('tool-drag-end', {
          tool,
          toolbox: this
        });
      });
    }
    
    // Group header click handlers
    if (this.collapsible) {
      for (const [id, groupCtrl] of this._groupControls) {
        groupCtrl._headerCtrl.on('click', () => {
          this.toggleGroup(id);
        });
      }
    }
  }
  
  /**
   * Selects a tool control visually.
   * @param {Control} toolCtrl - Tool control to select
   * @private
   */
  _selectToolControl(toolCtrl) {
    // Deselect previous
    for (const ctrl of this._toolControls.values()) {
      ctrl.remove_class('toolbox-tool-selected');
    }
    
    // Select new
    toolCtrl.add_class('toolbox-tool-selected');
    this.selectedTool = toolCtrl._toolDef;
  }
  
  // ============================================
  // Public API
  // ============================================
  
  /**
   * Selects a tool by ID.
   * 
   * @param {string} toolId - ID of tool to select
   */
  selectTool(toolId) {
    const toolCtrl = this._toolControls.get(toolId);
    if (toolCtrl && !toolCtrl._toolDef.disabled) {
      this._selectToolControl(toolCtrl);
      
      this.raise('tool-selected', {
        tool: this.selectedTool,
        toolbox: this
      });
    }
  }
  
  /**
   * Deselects the current tool.
   */
  deselectTool() {
    for (const ctrl of this._toolControls.values()) {
      ctrl.remove_class('toolbox-tool-selected');
    }
    this.selectedTool = null;
    
    this.raise('tool-deselected', {
      toolbox: this
    });
  }
  
  /**
   * Gets the currently selected tool.
   * 
   * @returns {ToolDefinition|null}
   */
  getSelectedTool() {
    return this.selectedTool;
  }
  
  /**
   * Toggles a group's collapsed state.
   * 
   * @param {string} groupId - ID of group to toggle
   */
  toggleGroup(groupId) {
    const groupCtrl = this._groupControls.get(groupId);
    if (!groupCtrl) return;
    
    const isCollapsed = groupCtrl.has_class('toolbox-group-collapsed');
    
    if (isCollapsed) {
      this.expandGroup(groupId);
    } else {
      this.collapseGroup(groupId);
    }
  }
  
  /**
   * Collapses a group.
   * 
   * @param {string} groupId - ID of group to collapse
   */
  collapseGroup(groupId) {
    const groupCtrl = this._groupControls.get(groupId);
    if (!groupCtrl) return;
    
    groupCtrl.add_class('toolbox-group-collapsed');
    if (groupCtrl._collapseIndicator?.dom?.el) {
      groupCtrl._collapseIndicator.dom.el.textContent = '▶';
    }
    
    this.raise('group-collapsed', {
      groupId,
      toolbox: this
    });
  }
  
  /**
   * Expands a group.
   * 
   * @param {string} groupId - ID of group to expand
   */
  expandGroup(groupId) {
    const groupCtrl = this._groupControls.get(groupId);
    if (!groupCtrl) return;
    
    groupCtrl.remove_class('toolbox-group-collapsed');
    if (groupCtrl._collapseIndicator?.dom?.el) {
      groupCtrl._collapseIndicator.dom.el.textContent = '▼';
    }
    
    this.raise('group-expanded', {
      groupId,
      toolbox: this
    });
  }
  
  /**
   * Registers a factory function for creating tool instances.
   * 
   * @param {string} toolId - ID of the tool
   * @param {Function} factory - Factory function (tool, position) => Control
   * 
   * @example
   * toolbox.registerToolFactory('rectangle', (tool, pos) => {
   *   return new RectangleShape({ context, position: pos });
   * });
   */
  registerToolFactory(toolId, factory) {
    this._toolFactories.set(toolId, factory);
  }
  
  /**
   * Creates an instance of a tool using its registered factory.
   * 
   * @param {string} toolId - ID of the tool
   * @param {{x: number, y: number}} position - Position for the new instance
   * @returns {Control|null} The created control, or null if no factory registered
   */
  createToolInstance(toolId, position) {
    const factory = this._toolFactories.get(toolId);
    const toolCtrl = this._toolControls.get(toolId);
    
    if (!factory || !toolCtrl) return null;
    
    return factory(toolCtrl._toolDef, position);
  }
  
  /**
   * Enables a tool.
   * 
   * @param {string} toolId - ID of tool to enable
   */
  enableTool(toolId) {
    const toolCtrl = this._toolControls.get(toolId);
    if (toolCtrl) {
      toolCtrl._toolDef.disabled = false;
      toolCtrl.remove_class('toolbox-tool-disabled');
      toolCtrl.dom.attributes.draggable = 'true';
    }
  }
  
  /**
   * Disables a tool.
   * 
   * @param {string} toolId - ID of tool to disable
   */
  disableTool(toolId) {
    const toolCtrl = this._toolControls.get(toolId);
    if (toolCtrl) {
      toolCtrl._toolDef.disabled = true;
      toolCtrl.add_class('toolbox-tool-disabled');
      toolCtrl.dom.attributes.draggable = 'false';
      
      // Deselect if currently selected
      if (this.selectedTool?.id === toolId) {
        this.deselectTool();
      }
    }
  }
  
  /**
   * Adds a new tool dynamically.
   * 
   * @param {ToolDefinition} tool - Tool to add
   * @param {string} [groupId] - Group to add to (if using groups)
   */
  addTool(tool, groupId) {
    if (this._toolControls.has(tool.id)) {
      console.warn(`Tool with id "${tool.id}" already exists`);
      return;
    }
    
    const toolCtrl = this._createToolControl(tool);
    this._toolControls.set(tool.id, toolCtrl);
    
    // Add to appropriate container
    if (groupId && this._groupControls.has(groupId)) {
      const groupCtrl = this._groupControls.get(groupId);
      groupCtrl._toolsContainer.add(toolCtrl);
    } else {
      this.ctrl_content.add(toolCtrl);
    }
    
    // Activate if already active
    if (this.dom.el) {
      toolCtrl.pre_activate();
      toolCtrl.activate();
      
      // Set up handlers for new tool
      this._setupEventHandlers();
    }
    
    this.raise('tool-added', {
      tool,
      groupId,
      toolbox: this
    });
  }
  
  /**
   * Removes a tool.
   * 
   * @param {string} toolId - ID of tool to remove
   */
  removeTool(toolId) {
    const toolCtrl = this._toolControls.get(toolId);
    if (!toolCtrl) return;
    
    const tool = toolCtrl._toolDef;
    
    toolCtrl.remove();
    this._toolControls.delete(toolId);
    this._toolFactories.delete(toolId);
    
    if (this.selectedTool?.id === toolId) {
      this.selectedTool = null;
    }
    
    this.raise('tool-removed', {
      tool,
      toolbox: this
    });
  }
  
  /**
   * Sets the layout mode.
   * 
   * @param {'grid'|'list'|'compact'} mode - New layout mode
   */
  setLayout(mode) {
    this.remove_class(`toolbox-layout-${this.layout}`);
    this.layout = mode;
    this.add_class(`toolbox-layout-${this.layout}`);
  }
  
  /**
   * Gets all tools (flat list, regardless of grouping).
   * 
   * @returns {ToolDefinition[]}
   */
  getAllTools() {
    return Array.from(this._toolControls.values()).map(ctrl => ctrl._toolDef);
  }
}

module.exports = ToolboxControl;
