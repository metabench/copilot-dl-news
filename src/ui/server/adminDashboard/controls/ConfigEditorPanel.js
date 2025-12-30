'use strict';

/**
 * ConfigEditorPanel - JSON configuration editor with validation
 * 
 * Allows editing system configuration with syntax highlighting
 * and validation before save.
 */

const jsgui = require('jsgui3-html');
const StringControl = jsgui.String_Control;

class ConfigEditorPanel extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.config - Current configuration object
   * @param {string} [spec.configKey='system'] - Configuration key name
   * @param {string} [spec.error] - Validation error message
   * @param {boolean} [spec.saved] - Whether config was just saved
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    
    this.config = spec.config || {};
    this.configKey = spec.configKey || 'system';
    this.error = spec.error || null;
    this.saved = spec.saved || false;
    
    this.add_class('admin-panel');
    this.add_class('config-editor-panel');
    this._compose();
  }

  _compose() {
    // Header
    const header = new jsgui.Control({ context: this.context, tagName: 'div' });
    header.add_class('admin-panel__header');
    
    const title = new jsgui.Control({ context: this.context, tagName: 'h2' });
    title.add_class('admin-panel__title');
    title.add(new StringControl({ context: this.context, text: '⚙️ Configuration Editor' }));
    header.add(title);
    
    this.add(header);
    
    // Status messages
    if (this.saved) {
      const success = new jsgui.Control({ context: this.context, tagName: 'div' });
      success.add_class('alert');
      success.add_class('alert--success');
      success.add(new StringControl({ context: this.context, text: '✅ Configuration saved successfully!' }));
      this.add(success);
    }
    
    if (this.error) {
      const error = new jsgui.Control({ context: this.context, tagName: 'div' });
      error.add_class('alert');
      error.add_class('alert--danger');
      error.add(new StringControl({ context: this.context, text: `❌ ${this.error}` }));
      this.add(error);
    }
    
    // Editor form
    const form = new jsgui.Control({ context: this.context, tagName: 'form' });
    form.add_class('config-editor__form');
    form.dom.attributes.method = 'POST';
    form.dom.attributes.action = '/admin/config';
    
    // Config key selector
    const keyGroup = new jsgui.Control({ context: this.context, tagName: 'div' });
    keyGroup.add_class('form-group');
    
    const keyLabel = new jsgui.Control({ context: this.context, tagName: 'label' });
    keyLabel.add_class('form-label');
    keyLabel.add(new StringControl({ context: this.context, text: 'Configuration Section' }));
    keyGroup.add(keyLabel);
    
    const keySelect = new jsgui.Control({ context: this.context, tagName: 'select' });
    keySelect.dom.attributes.name = 'configKey';
    keySelect.add_class('form-select');
    
    const configKeys = ['system', 'crawl', 'analysis', 'notifications', 'security'];
    for (const key of configKeys) {
      const opt = new jsgui.Control({ context: this.context, tagName: 'option' });
      opt.dom.attributes.value = key;
      if (key === this.configKey) {
        opt.dom.attributes.selected = 'selected';
      }
      opt.add(new StringControl({ context: this.context, text: key.charAt(0).toUpperCase() + key.slice(1) }));
      keySelect.add(opt);
    }
    
    keyGroup.add(keySelect);
    form.add(keyGroup);
    
    // JSON editor
    const editorGroup = new jsgui.Control({ context: this.context, tagName: 'div' });
    editorGroup.add_class('form-group');
    
    const editorLabel = new jsgui.Control({ context: this.context, tagName: 'label' });
    editorLabel.add_class('form-label');
    editorLabel.add(new StringControl({ context: this.context, text: 'Configuration JSON' }));
    editorGroup.add(editorLabel);
    
    const textarea = new jsgui.Control({ context: this.context, tagName: 'textarea' });
    textarea.dom.attributes.name = 'config';
    textarea.dom.attributes.rows = '20';
    textarea.add_class('config-editor__textarea');
    textarea.add_class('code-editor');
    
    // Format the config as pretty JSON
    const configJson = JSON.stringify(this.config, null, 2);
    textarea.add(new StringControl({ context: this.context, text: configJson }));
    
    editorGroup.add(textarea);
    form.add(editorGroup);
    
    // Buttons
    const buttons = new jsgui.Control({ context: this.context, tagName: 'div' });
    buttons.add_class('form-buttons');
    
    const validateBtn = new jsgui.Control({ context: this.context, tagName: 'button' });
    validateBtn.dom.attributes.type = 'button';
    validateBtn.add_class('btn');
    validateBtn.add_class('btn--secondary');
    validateBtn.dom.attributes['data-action'] = 'validate-config';
    validateBtn.add(new StringControl({ context: this.context, text: '🔍 Validate' }));
    buttons.add(validateBtn);
    
    const saveBtn = new jsgui.Control({ context: this.context, tagName: 'button' });
    saveBtn.dom.attributes.type = 'submit';
    saveBtn.add_class('btn');
    saveBtn.add_class('btn--primary');
    saveBtn.add(new StringControl({ context: this.context, text: '💾 Save Configuration' }));
    buttons.add(saveBtn);
    
    form.add(buttons);
    this.add(form);
    
    // Help text
    const help = new jsgui.Control({ context: this.context, tagName: 'div' });
    help.add_class('config-editor__help');
    
    const helpTitle = new jsgui.Control({ context: this.context, tagName: 'h4' });
    helpTitle.add(new StringControl({ context: this.context, text: '📚 Configuration Keys' }));
    help.add(helpTitle);
    
    const helpList = new jsgui.Control({ context: this.context, tagName: 'ul' });
    helpList.add_class('config-editor__help-list');
    
    const helpItems = [
      { key: 'system', desc: 'General system settings (name, timezone, debug mode)' },
      { key: 'crawl', desc: 'Crawler settings (rate limits, user agents, timeouts)' },
      { key: 'analysis', desc: 'Content analysis settings (confidence thresholds, extractors)' },
      { key: 'notifications', desc: 'Notification settings (email, webhooks)' },
      { key: 'security', desc: 'Security settings (rate limiting, blocked IPs)' }
    ];
    
    for (const item of helpItems) {
      const li = new jsgui.Control({ context: this.context, tagName: 'li' });
      
      const keySpan = new jsgui.Control({ context: this.context, tagName: 'strong' });
      keySpan.add(new StringControl({ context: this.context, text: item.key }));
      li.add(keySpan);
      
      li.add(new StringControl({ context: this.context, text: ` - ${item.desc}` }));
      helpList.add(li);
    }
    
    help.add(helpList);
    this.add(help);
  }
}

module.exports = { ConfigEditorPanel };
