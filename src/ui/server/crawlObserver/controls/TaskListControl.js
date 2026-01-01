'use strict';

const jsgui = require('jsgui3-html');

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

    container.add(new jsgui.Control({
      context: this.context,
      tagName: 'h2',
      text: '📋 Task Events'
    }));

    if (this._tasks.length === 0) {
      container.add(new jsgui.Control({
        context: this.context,
        tagName: 'p',
        text: 'No tasks found. Run a crawl to see events here.',
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
      headerRow.add(new jsgui.Control({
        context: this.context,
        tagName: 'th',
        text: h,
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

      row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        text: task.task_type,
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));

      const idCell = row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));
      idCell.add(new jsgui.Control({
        context: this.context,
        tagName: 'a',
        text: task.task_id.length > 40 ? task.task_id.slice(0, 37) + '...' : task.task_id,
        attr: { href: this._withBasePath(`/task/${encodeURIComponent(task.task_id)}`) },
        style: { color: '#0066cc', textDecoration: 'none' }
      }));

      row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        text: String(task.event_count),
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));

      row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        text: task.error_count > 0 ? `❌ ${task.error_count}` : '✓',
        style: {
          padding: '8px',
          borderBottom: '1px solid #eee',
          color: task.error_count > 0 ? '#c00' : '#090'
        }
      }));

      row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        text: task.warn_count > 0 ? `⚠️ ${task.warn_count}` : '-',
        style: {
          padding: '8px',
          borderBottom: '1px solid #eee',
          color: task.warn_count > 0 ? '#c60' : '#999'
        }
      }));

      const startDate = task.first_ts ? new Date(task.first_ts) : null;
      row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        text: startDate ? startDate.toLocaleString() : '-',
        style: { padding: '8px', borderBottom: '1px solid #eee', fontSize: '12px' }
      }));

      let duration = '-';
      if (task.first_ts && task.last_ts) {
        const ms = new Date(task.last_ts) - new Date(task.first_ts);
        if (ms < 1000) duration = `${ms}ms`;
        else if (ms < 60000) duration = `${(ms / 1000).toFixed(1)}s`;
        else duration = `${(ms / 60000).toFixed(1)}m`;
      }
      row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        text: duration,
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));

      const actionsCell = row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));
      actionsCell.add(new jsgui.Control({
        context: this.context,
        tagName: 'a',
        text: '🔍 View',
        attr: { href: this._withBasePath(`/task/${encodeURIComponent(task.task_id)}`) },
        style: { marginRight: '8px', color: '#0066cc', textDecoration: 'none' }
      }));
    }
  }
}

module.exports = { TaskListControl };
