'use strict';

module.exports = `
  :root {
    color-scheme: dark;
    --bg: #111213;
    --panel: #1b1c1f;
    --panel-2: #24262a;
    --border: rgba(212, 165, 116, 0.35);
    --text: #f3efe6;
    --muted: #b8aa93;
    --gold: #d4a574;
    --ok: #4ade80;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    background: var(--bg);
    color: var(--text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 18px;
  }
  h1 { margin: 0 0 6px; font-size: 28px; }
  h2 { margin: 0 0 12px; font-size: 18px; }
  .meta, .footer, .start-status { color: var(--muted); font-size: 13px; }
  .links { display: flex; gap: 8px; flex-wrap: wrap; }
  a { color: var(--gold); }
  .start {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 18px;
  }
  .crawl-batch {
    background: var(--panel);
    border: 1px solid rgba(74, 222, 128, 0.35);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 18px;
  }
  .crawl-batch-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 12px;
  }
  .crawl-batch-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(68px, 1fr));
    gap: 8px;
    min-width: 230px;
  }
  .crawl-batch-metric {
    background: #0d0e10;
    border: 1px solid rgba(212, 165, 116, 0.18);
    border-radius: 6px;
    padding: 8px;
    text-align: center;
  }
  .crawl-batch-metric span { display: block; font-size: 18px; color: var(--ok); font-weight: 700; }
  .crawl-batch-metric small { color: var(--muted); font-size: 11px; }
  .crawl-batch-grid {
    display: grid;
    grid-template-columns: minmax(180px, 1.4fr) repeat(3, minmax(110px, 0.8fr)) minmax(150px, 0.9fr);
    gap: 12px;
    align-items: end;
  }
  .crawl-batch-actions { display: flex; align-items: end; }
  .crawl-batch-status { margin-top: 10px; color: var(--muted); font-size: 13px; }
  .screenshot-ready-marker { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .start-row, .start-advanced-body {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    align-items: end;
  }
  .start-field label { display: block; color: var(--muted); font-size: 12px; margin-bottom: 5px; }
  input, select, textarea, button {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel-2);
    color: var(--text);
    padding: 9px 10px;
    font: inherit;
  }
  textarea { min-height: 72px; resize: vertical; }
  button { cursor: pointer; color: var(--gold); }
  .start-actions { display: grid; gap: 8px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .start-meta, .start-advanced { margin-top: 12px; }
  .throughput-strip {
    display: grid;
    grid-template-columns: repeat(5, minmax(110px, 1fr));
    gap: 8px;
    margin: 10px 0 14px;
  }
  .throughput-item {
    background: var(--panel);
    border: 1px solid rgba(212, 165, 116, 0.24);
    border-radius: 6px;
    padding: 10px;
    min-width: 0;
  }
  .throughput-item span { display: block; color: var(--ok); font-size: 20px; line-height: 1.1; font-weight: 750; }
  .throughput-item small { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--border); }
  th, td { padding: 10px; border-bottom: 1px solid rgba(212, 165, 116, 0.18); text-align: left; font-size: 13px; }
  th { color: var(--muted); font-weight: 600; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  .empty { text-align: center; color: var(--muted); padding: 20px; }
  .bar { height: 8px; background: #0d0e10; border-radius: 99px; overflow: hidden; min-width: 80px; }
  .bar span { display: block; height: 100%; background: var(--ok); }

    @media (max-width: 720px) {
      body { padding: 16px 14px; }
      header { flex-direction: column; gap: 12px; }
      h1 { font-size: 26px; line-height: 1.12; }
      h2 { font-size: 17px; }
      .links { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .links a { overflow-wrap: anywhere; }
      .start { padding: 14px; }
      .throughput-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .start-row, .start-advanced-body, .crawl-batch-grid { grid-template-columns: 1fr; }
      .crawl-batch-header { flex-direction: column; }
      .crawl-batch-metrics { width: 100%; min-width: 0; }
      .start-actions { grid-template-columns: 1fr 1fr; }
      .start-actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; }
      table { display: block; overflow-x: auto; min-width: 100%; }
      th, td { white-space: nowrap; }
    }
`;