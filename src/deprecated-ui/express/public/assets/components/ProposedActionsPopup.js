(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/deprecated-ui/express/public/components/ProposedActionsPopup.js
  var require_ProposedActionsPopup = __commonJS({
    "src/deprecated-ui/express/public/components/ProposedActionsPopup.js"(exports, module) {
      function createProposedActionsPopup(options) {
        const {
          title = "Action Required",
          message,
          proposedActions = [],
          onActionExecuted,
          onClose
        } = options;
        const popup = document.createElement("div");
        popup.className = "proposed-actions-popup";
        popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-labelledby", "popup-title");
        const backdrop = document.createElement("div");
        backdrop.className = "proposed-actions-backdrop";
        const content = document.createElement("div");
        content.className = "proposed-actions-content";
        const header = document.createElement("div");
        header.className = "proposed-actions-header";
        const titleEl = document.createElement("h3");
        titleEl.id = "popup-title";
        titleEl.textContent = title;
        const closeBtn = document.createElement("button");
        closeBtn.className = "close-button";
        closeBtn.setAttribute("aria-label", "Close");
        closeBtn.innerHTML = "&times;";
        closeBtn.onclick = () => {
          closePopup(popup, onClose);
        };
        header.appendChild(titleEl);
        header.appendChild(closeBtn);
        const messageEl = document.createElement("div");
        messageEl.className = "proposed-actions-message";
        messageEl.textContent = message;
        const actionsContainer = document.createElement("div");
        actionsContainer.className = "proposed-actions-list";
        const sortedActions = [...proposedActions].sort(
          (a, b) => (b.priority || 0) - (a.priority || 0)
        );
        for (const proposedAction of sortedActions) {
          const actionCard = createActionCard(proposedAction, popup, onActionExecuted);
          actionsContainer.appendChild(actionCard);
        }
        content.appendChild(header);
        content.appendChild(messageEl);
        content.appendChild(actionsContainer);
        backdrop.appendChild(content);
        popup.appendChild(backdrop);
        document.body.appendChild(popup);
        setTimeout(() => {
          const firstButton = actionsContainer.querySelector(".action-execute-btn");
          if (firstButton) {
            firstButton.focus();
          }
        }, 100);
        return popup;
      }
      function createActionCard(proposedAction, popup, onActionExecuted) {
        const { action, reason, description, severity } = proposedAction;
        const card = document.createElement("div");
        card.className = `action-card severity-${severity || "info"}`;
        const labelEl = document.createElement("div");
        labelEl.className = "action-label";
        labelEl.textContent = action.label;
        const reasonEl = document.createElement("div");
        reasonEl.className = "action-reason";
        reasonEl.textContent = reason;
        if (description) {
          const descEl = document.createElement("div");
          descEl.className = "action-description";
          descEl.textContent = description;
          card.appendChild(descEl);
        }
        const executeBtn = document.createElement("button");
        executeBtn.className = "action-execute-btn btn btn-primary";
        executeBtn.textContent = action.label;
        executeBtn.onclick = async () => {
          await executeAction(action, executeBtn, popup, onActionExecuted);
        };
        card.appendChild(reasonEl);
        card.appendChild(executeBtn);
        return card;
      }
      async function executeAction(action, button, popup, onActionExecuted) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Executing...";
        try {
          const response = await fetch("/api/background-tasks/actions/execute", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ action })
          });
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.error?.message || "Action execution failed");
          }
          button.textContent = "\u2713 Done";
          button.className = "action-execute-btn btn btn-success";
          if (typeof onActionExecuted === "function") {
            onActionExecuted(result);
          }
          setTimeout(() => {
            closePopup(popup);
          }, 500);
        } catch (error) {
          console.error("[ProposedActionsPopup] Action execution failed:", error);
          button.textContent = originalText;
          button.disabled = false;
          const errorMsg = document.createElement("div");
          errorMsg.className = "action-error";
          errorMsg.textContent = `Error: ${error.message}`;
          button.parentElement.appendChild(errorMsg);
          setTimeout(() => {
            errorMsg.remove();
          }, 3e3);
        }
      }
      function closePopup(popup, onClose) {
        if (popup && popup.parentElement) {
          popup.remove();
        }
        if (typeof onClose === "function") {
          onClose();
        }
      }
      function showProposedActionsPopup(error, onActionExecuted) {
        if (!error.proposedActions || error.proposedActions.length === 0) {
          console.warn("[ProposedActionsPopup] No proposed actions provided");
          return;
        }
        createProposedActionsPopup({
          title: "Cannot Start Task",
          message: error.error?.message || error.message || "Operation refused",
          proposedActions: error.proposedActions,
          onActionExecuted: (result) => {
            console.log("[ProposedActionsPopup] Action executed successfully:", result);
            if (typeof onActionExecuted === "function") {
              onActionExecuted(result);
            }
          },
          onClose: () => {
            console.log("[ProposedActionsPopup] Popup closed");
          }
        });
      }
      if (typeof module !== "undefined" && module.exports) {
        module.exports = {
          createProposedActionsPopup,
          showProposedActionsPopup
        };
      }
    }
  });
  require_ProposedActionsPopup();
})();
//# sourceMappingURL=ProposedActionsPopup.js.map
