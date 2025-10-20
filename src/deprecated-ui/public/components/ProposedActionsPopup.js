/**
 * ProposedActionsPopup - UI component for displaying proposed actions
 * 
 * Creates a non-modal popup that displays actions the user can take when
 * an operation is refused (e.g., rate limiting).
 * 
 * Features:
 * - Non-modal overlay (doesn't block interactions)
 * - Close button in top-right corner
 * - Clickable action buttons that execute via API
 * - Auto-dismiss on successful action
 */

/**
 * Create proposed actions popup
 * 
 * @param {Object} options - Popup options
 * @param {string} options.title - Popup title
 * @param {string} options.message - Error/refusal message
 * @param {Array<Object>} options.proposedActions - Array of proposed action objects
 * @param {Function} [options.onActionExecuted] - Callback when action succeeds
 * @param {Function} [options.onClose] - Callback when popup closes
 * @returns {HTMLElement} Popup element
 */
function createProposedActionsPopup(options) {
  const {
    title = 'Action Required',
    message,
    proposedActions = [],
    onActionExecuted,
    onClose
  } = options;
  
  // Create popup container
  const popup = document.createElement('div');
  popup.className = 'proposed-actions-popup';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-labelledby', 'popup-title');
  
  // Create overlay backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'proposed-actions-backdrop';
  
  // Create popup content
  const content = document.createElement('div');
  content.className = 'proposed-actions-content';
  
  // Header with close button
  const header = document.createElement('div');
  header.className = 'proposed-actions-header';
  
  const titleEl = document.createElement('h3');
  titleEl.id = 'popup-title';
  titleEl.textContent = title;
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-button';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = () => {
    closePopup(popup, onClose);
  };
  
  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  
  // Message
  const messageEl = document.createElement('div');
  messageEl.className = 'proposed-actions-message';
  messageEl.textContent = message;
  
  // Actions container
  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'proposed-actions-list';
  
  // Sort proposed actions by priority (highest first)
  const sortedActions = [...proposedActions].sort((a, b) => 
    (b.priority || 0) - (a.priority || 0)
  );
  
  // Create action cards
  for (const proposedAction of sortedActions) {
    const actionCard = createActionCard(proposedAction, popup, onActionExecuted);
    actionsContainer.appendChild(actionCard);
  }
  
  // Assemble popup
  content.appendChild(header);
  content.appendChild(messageEl);
  content.appendChild(actionsContainer);
  
  backdrop.appendChild(content);
  popup.appendChild(backdrop);
  
  // Add to document
  document.body.appendChild(popup);
  
  // Focus first action button
  setTimeout(() => {
    const firstButton = actionsContainer.querySelector('.action-execute-btn');
    if (firstButton) {
      firstButton.focus();
    }
  }, 100);
  
  return popup;
}

/**
 * Create action card for proposed action
 * 
 * @param {Object} proposedAction - Proposed action object
 * @param {HTMLElement} popup - Popup element (for closing after action)
 * @param {Function} onActionExecuted - Callback when action succeeds
 * @returns {HTMLElement} Action card element
 */
function createActionCard(proposedAction, popup, onActionExecuted) {
  const { action, reason, description, severity } = proposedAction;
  
  const card = document.createElement('div');
  card.className = `action-card severity-${severity || 'info'}`;
  
  // Action label
  const labelEl = document.createElement('div');
  labelEl.className = 'action-label';
  labelEl.textContent = action.label;
  
  // Reason
  const reasonEl = document.createElement('div');
  reasonEl.className = 'action-reason';
  reasonEl.textContent = reason;
  
  // Description (if provided)
  if (description) {
    const descEl = document.createElement('div');
    descEl.className = 'action-description';
    descEl.textContent = description;
    card.appendChild(descEl);
  }
  
  // Execute button
  const executeBtn = document.createElement('button');
  executeBtn.className = 'action-execute-btn btn btn-primary';
  executeBtn.textContent = action.label;
  executeBtn.onclick = async () => {
    await executeAction(action, executeBtn, popup, onActionExecuted);
  };
  
  card.appendChild(reasonEl);
  card.appendChild(executeBtn);
  
  return card;
}

/**
 * Execute a proposed action
 * 
 * @param {Object} action - Action object
 * @param {HTMLButtonElement} button - Button that triggered action
 * @param {HTMLElement} popup - Popup element
 * @param {Function} onActionExecuted - Success callback
 */
async function executeAction(action, button, popup, onActionExecuted) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Executing...';
  
  try {
    const response = await fetch('/api/background-tasks/actions/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action })
    });
    
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      throw new Error(result.error?.message || 'Action execution failed');
    }
    
    // Success!
    button.textContent = '✓ Done';
    button.className = 'action-execute-btn btn btn-success';
    
    // Notify callback
    if (typeof onActionExecuted === 'function') {
      onActionExecuted(result);
    }
    
    // Close popup after short delay
    setTimeout(() => {
      closePopup(popup);
    }, 500);
    
  } catch (error) {
    console.error('[ProposedActionsPopup] Action execution failed:', error);
    button.textContent = originalText;
    button.disabled = false;
    
    // Show error message
    const errorMsg = document.createElement('div');
    errorMsg.className = 'action-error';
    errorMsg.textContent = `Error: ${error.message}`;
    button.parentElement.appendChild(errorMsg);
    
    setTimeout(() => {
      errorMsg.remove();
    }, 3000);
  }
}

/**
 * Close popup
 * 
 * @param {HTMLElement} popup - Popup element
 * @param {Function} [onClose] - Close callback
 */
function closePopup(popup, onClose) {
  if (popup && popup.parentElement) {
    popup.remove();
  }
  
  if (typeof onClose === 'function') {
    onClose();
  }
}

/**
 * Show proposed actions popup
 * 
 * @param {Object} error - Error response from API (429 status)
 * @param {Function} [onActionExecuted] - Callback when action succeeds
 */
function showProposedActionsPopup(error, onActionExecuted) {
  if (!error.proposedActions || error.proposedActions.length === 0) {
    console.warn('[ProposedActionsPopup] No proposed actions provided');
    return;
  }
  
  createProposedActionsPopup({
    title: 'Cannot Start Task',
    message: error.error?.message || error.message || 'Operation refused',
    proposedActions: error.proposedActions,
    onActionExecuted: (result) => {
      console.log('[ProposedActionsPopup] Action executed successfully:', result);
      
      if (typeof onActionExecuted === 'function') {
        onActionExecuted(result);
      }
    },
    onClose: () => {
      console.log('[ProposedActionsPopup] Popup closed');
    }
  });
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createProposedActionsPopup,
    showProposedActionsPopup
  };
}
