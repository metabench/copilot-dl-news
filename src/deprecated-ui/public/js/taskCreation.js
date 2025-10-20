/**
 * @fileoverview Client-side Task Creation UI
 * 
 * Handles dynamic task creation forms using the property editor.
 * Loads task definitions from API and renders appropriate forms.
 */

// Import property editor (isomorphic module exposed via window.PropertyEditor)
const { render, extractValues, validateValues } = window.PropertyEditor;

/**
 * Task creation manager
 */
class TaskCreationManager {
  constructor() {
    this.taskTypes = [];
    this.currentTaskType = null;
    this.currentSchema = null;
    
    // DOM elements (will be set on init)
    this.modal = null;
    this.taskTypeSelector = null;
    this.propertyEditorContainer = null;
    this.currentForm = null;
  }
  
  /**
   * Initialize task creation UI
   */
  async init() {
    console.log('[TaskCreation] Initializing task creation UI');
    
    // Load available task types
    await this.loadTaskTypes();
    
    // Setup modal if not exists
    this.setupModal();
    
    // Attach to "Create Task" button
    const createButton = document.querySelector('[data-action="create-task"]');
    if (createButton) {
      createButton.addEventListener('click', () => this.openModal());
    }
    
    console.log('[TaskCreation] Initialization complete');
  }
  
  /**
   * Load available task types from API
   */
  async loadTaskTypes() {
    try {
      const response = await fetch('/api/background-tasks/types');
      const data = await response.json();
      
      if (data.success) {
        this.taskTypes = data.taskTypes;
        console.log('[TaskCreation] Loaded task types:', this.taskTypes.length);
      } else {
        console.error('[TaskCreation] Failed to load task types:', data.error);
      }
      
    } catch (error) {
      console.error('[TaskCreation] Error loading task types:', error);
    }
  }
  
  /**
   * Setup modal HTML
   */
  setupModal() {
    // Check if modal already exists
    let modal = document.getElementById('task-creation-modal');
    
    if (!modal) {
      // Create modal
      modal = document.createElement('div');
      modal.id = 'task-creation-modal';
      modal.className = 'modal modal--task-creation';
      modal.innerHTML = `
        <div class="modal__backdrop" data-action="close-modal"></div>
        <div class="modal__content">
          <div class="modal__header">
            <h2 class="modal__title">Create Background Task</h2>
            <button class="modal__close" data-action="close-modal" aria-label="Close">×</button>
          </div>
          <div class="modal__body">
            <div class="task-type-selection">
              <label for="task-type-select" class="task-type-label">Task Type</label>
              <select id="task-type-select" class="task-type-select">
                <option value="">Select a task type...</option>
              </select>
            </div>
            <div id="property-editor-container" class="property-editor-container is-hidden">
              <!-- Property editor will be rendered here -->
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
    }
    
    this.modal = modal;
    this.taskTypeSelector = modal.querySelector('#task-type-select');
    this.propertyEditorContainer = modal.querySelector('#property-editor-container');
    
    // Populate task type selector
    this.populateTaskTypeSelector();
    
    // Event listeners
    this.taskTypeSelector.addEventListener('change', (e) => this.onTaskTypeChange(e.target.value));
    
    modal.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
      btn.addEventListener('click', () => this.closeModal());
    });
  }
  
  /**
   * Populate task type selector with available types
   */
  populateTaskTypeSelector() {
    // Clear existing options except first
    while (this.taskTypeSelector.options.length > 1) {
      this.taskTypeSelector.remove(1);
    }
    
    // Add task type options
    this.taskTypes.forEach(taskType => {
      const option = document.createElement('option');
      option.value = taskType.taskType;
      option.textContent = `${taskType.icon} ${taskType.title}`;
      this.taskTypeSelector.appendChild(option);
    });
  }
  
  /**
   * Handle task type selection change
   */
  async onTaskTypeChange(taskType) {
    if (!taskType) {
      this.propertyEditorContainer.classList.add('is-hidden');
      this.currentTaskType = null;
      this.currentSchema = null;
      return;
    }
    
    console.log('[TaskCreation] Loading schema for task type:', taskType);
    
    try {
      // Fetch task definition with schema
      const response = await fetch(`/api/background-tasks/types/${taskType}`);
      const data = await response.json();
      
      if (data.success) {
        this.currentTaskType = taskType;
        this.currentSchema = data.definition;
        this.renderPropertyEditor();
      } else {
        console.error('[TaskCreation] Failed to load task definition:', data.error);
      }
      
    } catch (error) {
      console.error('[TaskCreation] Error loading task definition:', error);
    }
  }
  
  /**
   * Render property editor for current schema
   */
  renderPropertyEditor() {
    if (!this.currentSchema) return;
    
    console.log('[TaskCreation] Rendering property editor for:', this.currentSchema.title);
    
    // Render using isomorphic property editor
    const html = render(this.currentSchema, {}, {
      showTitle: true,
      showSubmit: true,
      submitLabel: 'Start Task',
      cancelLabel: 'Cancel',
      formId: 'task-creation-form'
    });
    
    this.propertyEditorContainer.innerHTML = html;
    this.propertyEditorContainer.classList.remove('is-hidden');
    
    // Get form reference
    this.currentForm = document.getElementById('task-creation-form');
    
    // Attach form submit handler
    this.currentForm.addEventListener('submit', (e) => this.onSubmit(e));
    
    // Attach cancel handler
    const cancelButton = this.currentForm.querySelector('[data-action="cancel"]');
    if (cancelButton) {
      cancelButton.addEventListener('click', () => this.closeModal());
    }
  }
  
  /**
   * Handle form submission
   */
  async onSubmit(event) {
    event.preventDefault();
    
    if (!this.currentForm || !this.currentSchema) return;
    
    console.log('[TaskCreation] Submitting task creation form');
    
    // Extract values from form
    const parameters = extractValues(this.currentForm);
    
    console.log('[TaskCreation] Extracted parameters:', parameters);
    
    // Validate
    const validation = validateValues(parameters, this.currentSchema);
    
    if (!validation.valid) {
      console.error('[TaskCreation] Validation failed:', validation.errors);
      this.showValidationErrors(validation.errors);
      return;
    }
    
    // Submit to API
    try {
      const response = await fetch('/api/background-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          taskType: this.currentTaskType,
          parameters,
          autoStart: true  // Start immediately
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log('[TaskCreation] Task created successfully:', data.task);
        this.closeModal();
        
        // Notify user
        this.showNotification('success', `Task "${this.currentSchema.title}" started successfully`);
        
        // Trigger refresh of task list (custom event)
        window.dispatchEvent(new CustomEvent('task-created', { detail: data.task }));
        
      } else {
        console.error('[TaskCreation] Failed to create task:', data.error);
        
        if (data.validationErrors) {
          this.showValidationErrors(data.validationErrors);
        } else {
          this.showNotification('error', data.error || 'Failed to create task');
        }
      }
      
    } catch (error) {
      console.error('[TaskCreation] Error creating task:', error);
      this.showNotification('error', 'Network error creating task');
    }
  }
  
  /**
   * Show validation errors in form
   */
  showValidationErrors(errors) {
    // Clear existing errors
    this.currentForm.querySelectorAll('.prop-error').forEach(el => el.remove());
    this.currentForm.querySelectorAll('.prop-field--invalid').forEach(el => {
      el.classList.remove('prop-field--invalid');
    });
    
    // Show new errors
    errors.forEach(error => {
      const field = this.currentForm.querySelector(`[data-field-name="${error.field}"]`);
      if (field) {
        field.classList.add('prop-field--invalid');
        
        const errorEl = document.createElement('div');
        errorEl.className = 'prop-error';
        errorEl.textContent = error.message;
        field.appendChild(errorEl);
      }
    });
  }
  
  /**
   * Show notification toast
   */
  showNotification(type, message) {
    // Simple notification - could be enhanced with a proper toast system
    const notification = document.createElement('div');
    notification.className = `notification notification--${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'success' ? '#27ae60' : '#e74c3c'};
      color: white;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  
  /**
   * Open modal
   */
  openModal() {
    if (this.modal) {
      this.modal.classList.add('is-visible');
      document.body.style.overflow = 'hidden';
    }
  }
  
  /**
   * Close modal
   */
  closeModal() {
    if (this.modal) {
      this.modal.classList.remove('is-visible');
      document.body.style.overflow = '';
      
      // Reset form
      this.taskTypeSelector.value = '';
      this.propertyEditorContainer.classList.add('is-hidden');
      this.currentTaskType = null;
      this.currentSchema = null;
      this.currentForm = null;
    }
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.taskCreationManager = new TaskCreationManager();
    window.taskCreationManager.init();
  });
} else {
  window.taskCreationManager = new TaskCreationManager();
  window.taskCreationManager.init();
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TaskCreationManager };
}
