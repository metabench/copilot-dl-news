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
  table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--border); }
  th, td { padding: 10px; border-bottom: 1px solid rgba(212, 165, 116, 0.18); text-align: left; font-size: 13px; }
  th { color: var(--muted); font-weight: 600; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  .empty { text-align: center; color: var(--muted); padding: 20px; }
  .bar { height: 8px; background: #0d0e10; border-radius: 99px; overflow: hidden; min-width: 80px; }
  .bar span { display: block; height: 100%; background: var(--ok); }
`;