/**
 * Analysis Start Form Component
 * Compact form for starting analysis runs with options
 */

import { is_defined, tof } from 'lang-tools';

/**
 * Create analysis start form
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Configuration
 * @param {Function} options.onStart - Start callback (receives form data)
 * @param {Function} options.onPreview - Preview callback (receives count)
 * @returns {Object} Form controller
 */
export function createAnalysisStartForm(container, options = {}) {
  if (!container) throw new Error('createAnalysisStartForm requires container element');
  
  const { onStart, onPreview } = options;
  
  // Create form
  const form = document.createElement('form');
  form.className = 'analysis-start-form';
  form.innerHTML = `
    <div class="analysis-start-form__header">
      <h3 class="analysis-start-form__title">Start New Analysis</h3>
      <button type="button" class="analysis-start-form__preview-btn" title="Preview how many articles will be analyzed">
        Preview Count
      </button>
    </div>
    
    <div class="analysis-start-form__preview" style="display:none">
      <div class="analysis-start-form__preview-content">
        <strong class="analysis-start-form__preview-count">—</strong>
        <span class="analysis-start-form__preview-label">articles will be analyzed</span>
      </div>
    </div>
    
    <div class="analysis-start-form__fields">
      <div class="analysis-start-form__field">
        <label for="analysisVersion">Analysis Version</label>
        <input 
          type="number" 
          id="analysisVersion" 
          name="analysisVersion" 
          value="1" 
          min="1" 
          step="1"
          title="Analysis algorithm version"
        />
      </div>
      
      <div class="analysis-start-form__field">
        <label for="pageLimit">Page Limit</label>
        <input 
          type="number" 
          id="pageLimit" 
          name="pageLimit" 
          placeholder="All pages" 
          min="1"
          title="Maximum number of pages to analyze (blank = all)"
        />
      </div>
      
      <div class="analysis-start-form__field">
        <label for="domainLimit">Domain Limit</label>
        <input 
          type="number" 
          id="domainLimit" 
          name="domainLimit" 
          placeholder="All domains" 
          min="1"
          title="Maximum number of domains to analyze (blank = all)"
        />
      </div>
    </div>
    
    <div class="analysis-start-form__flags">
      <label class="analysis-start-form__checkbox">
        <input type="checkbox" name="skipPages" />
        <span>Skip page analysis</span>
      </label>
      
      <label class="analysis-start-form__checkbox">
        <input type="checkbox" name="skipDomains" />
        <span>Skip domain analysis</span>
      </label>
      
      <label class="analysis-start-form__checkbox">
        <input type="checkbox" name="dryRun" />
        <span>Dry run (don't save changes)</span>
      </label>
      
      <label class="analysis-start-form__checkbox">
        <input type="checkbox" name="verbose" />
        <span>Verbose logging</span>
      </label>
    </div>
    
    <div class="analysis-start-form__actions">
      <button type="submit" class="analysis-start-form__submit-btn">
        Start Analysis
      </button>
    </div>
    
    <div class="analysis-start-form__status" style="display:none">
      <span class="analysis-start-form__status-text"></span>
    </div>
  `;
  
  container.appendChild(form);
  
  // Get element references
  const previewBtn = form.querySelector('.analysis-start-form__preview-btn');
  const previewDiv = form.querySelector('.analysis-start-form__preview');
  const previewCount = form.querySelector('.analysis-start-form__preview-count');
  const submitBtn = form.querySelector('.analysis-start-form__submit-btn');
  const statusDiv = form.querySelector('.analysis-start-form__status');
  const statusText = form.querySelector('.analysis-start-form__status-text');
  
  /**
   * Get form data as object
   */
  function getFormData() {
    const formData = new FormData(form);
    const data = {};
    
    // Numbers
    const version = formData.get('analysisVersion');
    if (version) data.analysisVersion = parseInt(version, 10);
    
    const pageLimit = formData.get('pageLimit');
    if (pageLimit) data.pageLimit = parseInt(pageLimit, 10);
    
    const domainLimit = formData.get('domainLimit');
    if (domainLimit) data.domainLimit = parseInt(domainLimit, 10);
    
    // Checkboxes
    data.skipPages = formData.get('skipPages') === 'on';
    data.skipDomains = formData.get('skipDomains') === 'on';
    data.dryRun = formData.get('dryRun') === 'on';
    data.verbose = formData.get('verbose') === 'on';
    
    return data;
  }
  
  /**
   * Show status message
   */
  function showStatus(message, type = 'info') {
    if (statusDiv && statusText) {
      statusText.textContent = message;
      statusDiv.style.display = 'block';
      statusDiv.setAttribute('data-type', type);
      
      // Auto-hide success messages
      if (type === 'success') {
        setTimeout(() => {
          statusDiv.style.display = 'none';
        }, 5000);
      }
    }
  }
  
  /**
   * Hide status message
   */
  function hideStatus() {
    if (statusDiv) {
      statusDiv.style.display = 'none';
    }
  }
  
  // Preview button handler
  if (previewBtn && typeof onPreview === 'function') {
    previewBtn.addEventListener('click', async () => {
      const data = getFormData();
      previewBtn.disabled = true;
      previewBtn.textContent = 'Loading...';
      hideStatus();
      
      try {
        const count = await onPreview(data);
        if (previewDiv && previewCount) {
          previewCount.textContent = count.toLocaleString();
          previewDiv.style.display = 'block';
        }
      } catch (err) {
        showStatus(`Preview failed: ${err.message || err}`, 'error');
      } finally {
        previewBtn.disabled = false;
        previewBtn.textContent = 'Preview Count';
      }
    });
  }
  
  // Form submit handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!onStart || typeof onStart !== 'function') return;
    
    const data = getFormData();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Starting...';
    hideStatus();
    
    try {
      await onStart(data);
      showStatus('Analysis started successfully!', 'success');
      
      // Reset preview on successful start
      if (previewDiv) {
        previewDiv.style.display = 'none';
      }
    } catch (err) {
      showStatus(`Start failed: ${err.message || err}`, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Start Analysis';
    }
  });
  
  return {
    /**
     * Reset form to defaults
     */
    reset() {
      form.reset();
      hideStatus();
      if (previewDiv) {
        previewDiv.style.display = 'none';
      }
    },
    
    /**
     * Enable/disable form
     */
    setEnabled(enabled) {
      const inputs = form.querySelectorAll('input, button');
      inputs.forEach(input => {
        input.disabled = !enabled;
      });
    },
    
    /**
     * Get form element
     */
    getElement() {
      return form;
    },
    
    /**
     * Show custom status
     */
    showStatus,
    
    /**
     * Hide status
     */
    hideStatus
  };
}
