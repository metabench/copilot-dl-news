'use strict';

const jsgui = require('jsgui3-html');

class TelemetryDashboardControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._stats = spec.stats || {};
  }

  compose() {
    const container = this.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      style: { padding: '16px' }
    }));

    container.add(new jsgui.Control({
      context: this.context,
      el: 'h2',
      text: '📈 Crawl Telemetry Dashboard'
    }));

    const cardRow = container.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }
    }));

    const recent = this._stats.recentCrawls || {};
    this._addCard(cardRow, '🕷️ Crawls (24h)', recent.crawl_count || 0);
    this._addCard(cardRow, '🔗 URLs Fetched', recent.total_urls || 0);
    this._addCard(cardRow, '❌ Errors', recent.error_count || 0, (recent.error_count || 0) > 0 ? '#c44' : null);
    this._addCard(cardRow, '⏱️ Avg Duration', `${Math.round(recent.avg_duration_ms || 0)}ms`);

    container.add(new jsgui.Control({
      context: this.context,
      el: 'h3',
      text: '📊 Hourly Activity (Last 24h)',
      style: { marginTop: '24px' }
    }));
    this._addHourlyChart(container);

    container.add(new jsgui.Control({
      context: this.context,
      el: 'h3',
      text: '🚨 Error Breakdown (7 days)',
      style: { marginTop: '24px' }
    }));
    this._addErrorTable(container);

    container.add(new jsgui.Control({
      context: this.context,
      el: 'h3',
      text: '🌐 Domain Performance (24h)',
      style: { marginTop: '24px' }
    }));
    this._addDomainTable(container);
  }

  _addCard(parent, label, value, bgColor) {
    const card = parent.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      style: {
        background: bgColor || '#2a3a5a',
        padding: '16px',
        borderRadius: '8px',
        textAlign: 'center'
      }
    }));
    card.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      text: String(value),
      style: { fontSize: '28px', fontWeight: 'bold', marginBottom: '4px' }
    }));
    card.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      text: label,
      style: { fontSize: '12px', color: '#aaa' }
    }));
  }

  _addHourlyChart(parent) {
    const hours = this._stats.hourlyStats || [];
    if (hours.length === 0) {
      parent.add(new jsgui.Control({
        context: this.context,
        el: 'p',
        text: 'No data available',
        style: { color: '#666' }
      }));
      return;
    }

    const maxUrls = Math.max(...hours.map(h => h.urls_fetched || 0), 1);
    const chartWrap = parent.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      style: {
        display: 'flex',
        gap: '2px',
        alignItems: 'flex-end',
        height: '120px',
        background: '#1a2a4a',
        padding: '8px',
        borderRadius: '4px'
      }
    }));

    for (const h of hours.slice().reverse()) {
      const height = Math.max(4, Math.round((h.urls_fetched / maxUrls) * 100));
      chartWrap.add(new jsgui.Control({
        context: this.context,
        el: 'div',
        style: {
          flex: '1',
          height: `${height}%`,
          background: h.errors > 0 ? '#c44' : '#4a9',
          borderRadius: '2px 2px 0 0',
          minWidth: '8px'
        },
        attr: { title: `${h.hour}: ${h.urls_fetched} URLs, ${h.errors} errors` }
      }));
    }
  }

  _addErrorTable(parent) {
    const errors = this._stats.errorBreakdown || [];
    if (errors.length === 0) {
      parent.add(new jsgui.Control({
        context: this.context,
        el: 'p',
        text: '✅ No errors in the last 7 days!',
        style: { color: '#4a9' }
      }));
      return;
    }

    const table = parent.add(new jsgui.Control({
      context: this.context,
      el: 'table',
      style: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' }
    }));

    const thead = table.add(new jsgui.Control({ context: this.context, el: 'thead' }));
    const headerRow = thead.add(new jsgui.Control({ context: this.context, el: 'tr' }));
    ['Event Type', 'Count', 'Last Seen'].forEach(h => {
      headerRow.add(new jsgui.Control({
        context: this.context,
        el: 'th',
        text: h,
        style: { textAlign: 'left', padding: '8px', borderBottom: '1px solid #444' }
      }));
    });

    const tbody = table.add(new jsgui.Control({ context: this.context, el: 'tbody' }));
    for (const err of errors) {
      const row = tbody.add(new jsgui.Control({ context: this.context, el: 'tr' }));
      [err.event_type, err.count, err.last_seen].forEach((val, i) => {
        row.add(new jsgui.Control({
          context: this.context,
          el: 'td',
          text: String(val),
          style: { padding: '8px', borderBottom: '1px solid #333', color: i === 1 ? '#c44' : '#ccc' }
        }));
      });
    }
  }

  _addDomainTable(parent) {
    const domains = this._stats.domainStats || [];
    if (domains.length === 0) {
      parent.add(new jsgui.Control({
        context: this.context,
        el: 'p',
        text: 'No domain data available',
        style: { color: '#666' }
      }));
      return;
    }

    const table = parent.add(new jsgui.Control({
      context: this.context,
      el: 'table',
      style: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' }
    }));

    const thead = table.add(new jsgui.Control({ context: this.context, el: 'thead' }));
    const headerRow = thead.add(new jsgui.Control({ context: this.context, el: 'tr' }));
    ['Domain', 'Fetches', 'Avg (ms)', 'Errors'].forEach(h => {
      headerRow.add(new jsgui.Control({
        context: this.context,
        el: 'th',
        text: h,
        style: { textAlign: 'left', padding: '8px', borderBottom: '1px solid #444' }
      }));
    });

    const tbody = table.add(new jsgui.Control({ context: this.context, el: 'tbody' }));
    for (const d of domains) {
      const row = tbody.add(new jsgui.Control({ context: this.context, el: 'tr' }));
      [
        d.domain || '(unknown)',
        d.fetch_count,
        Math.round(d.avg_ms || 0),
        d.errors
      ].forEach((val, i) => {
        row.add(new jsgui.Control({
          context: this.context,
          el: 'td',
          text: String(val),
          style: {
            padding: '8px',
            borderBottom: '1px solid #333',
            color: i === 3 && val > 0 ? '#c44' : '#ccc'
          }
        }));
      });
    }
  }
}

module.exports = { TelemetryDashboardControl };
