'use strict';

const jsgui = require('jsgui3-html');

/**
 * Helper to add text content to a control using Text_Node
 * (jsgui3 Control ignores the 'text' constructor property)
 */
function addText(ctx, parent, text) {
  parent.add(new jsgui.Text_Node({ context: ctx, text: String(text) }));
  return parent;
}

/**
 * Create a Control with text content
 */
function makeTextEl(ctx, tagName, text, options = {}) {
  const el = new jsgui.Control({
    context: ctx,
    tagName,
    style: options.style,
    attr: options.attr
  });
  addText(ctx, el, text);
  return el;
}

class TaskListControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._tasks = spec.tasks || [];
    this._basePath = spec.basePath ? String(spec.basePath) : '';
  }

  _withBasePath(routePath) {
    const base = this._basePath;
    const p = routePath ? String(routePath) : '';
    if (!base) return p;
    if (p === '/') return base + '/';
    return base + p;
  }

  compose() {
    const container = this.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: { padding: '16px' }
    }));

    container.add(makeTextEl(this.context, 'h2', '📋 Task Events'));

    if (this._tasks.length === 0) {
      container.add(makeTextEl(this.context, 'p', 'No tasks found. Run a crawl to see events here.', {
        style: { color: '#666', fontStyle: 'italic' }
      }));
      return;
    }

    const table = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'table',
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '14px'
      }
    }));

    const thead = table.add(new jsgui.Control({ context: this.context, tagName: 'thead' }));
    const headerRow = thead.add(new jsgui.Control({ context: this.context, tagName: 'tr' }));
    ['Type', 'Task ID', 'Events', 'Errors', 'Warnings', 'Started', 'Duration', ''].forEach(h => {
      headerRow.add(makeTextEl(this.context, 'th', h, {
        style: {
          textAlign: 'left',
          padding: '8px',
          borderBottom: '2px solid #ddd',
          background: '#f5f5f5'
        }
      }));
    });

    const tbody = table.add(new jsgui.Control({ context: this.context, tagName: 'tbody' }));
    for (const task of this._tasks) {
      const row = tbody.add(new jsgui.Control({ context: this.context, tagName: 'tr' }));

      row.add(makeTextEl(this.context, 'td', task.task_type, {
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));

      const idCell = row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));
      const linkText = task.task_id.length > 40 ? task.task_id.slice(0, 37) + '...' : task.task_id;
      idCell.add(makeTextEl(this.context, 'a', linkText, {
        attr: { href: this._withBasePath(`/task/${encodeURIComponent(task.task_id)}`) },
        style: { color: '#0066cc', textDecoration: 'none' }
      }));

      row.add(makeTextEl(this.context, 'td', String(task.event_count), {
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));

      row.add(makeTextEl(this.context, 'td', task.error_count > 0 ? `❌ ${task.error_count}` : '✓', {
        style: {
          padding: '8px',
          borderBottom: '1px solid #eee',
          color: task.error_count > 0 ? '#c00' : '#090'
        }
      }));

      row.add(makeTextEl(this.context, 'td', task.warn_count > 0 ? `⚠️ ${task.warn_count}` : '-', {
        style: {
          padding: '8px',
          borderBottom: '1px solid #eee',
          color: task.warn_count > 0 ? '#c60' : '#999'
        }
      }));

      const startDate = task.first_ts ? new Date(task.first_ts) : null;
      row.add(makeTextEl(this.context, 'td', startDate ? startDate.toLocaleString() : '-', {
        style: { padding: '8px', borderBottom: '1px solid #eee', fontSize: '12px' }
      }));

      let duration = '-';
      if (task.first_ts && task.last_ts) {
        const ms = new Date(task.last_ts) - new Date(task.first_ts);
        if (ms < 1000) duration = `${ms}ms`;
        else if (ms < 60000) duration = `${(ms / 1000).toFixed(1)}s`;
        else duration = `${(ms / 60000).toFixed(1)}m`;
      }
      row.add(makeTextEl(this.context, 'td', duration, {
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));

      const actionsCell = row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));
      actionsCell.add(makeTextEl(this.context, 'a', '🔍 View', {
        attr: { href: this._withBasePath(`/task/${encodeURIComponent(task.task_id)}`) },
        style: { marginRight: '8px', color: '#0066cc', textDecoration: 'none' }
      }));
    }
  }
}

module.exports = { TaskListControl };
