'use strict';

const { classify, inventory } = require('../ui-check-inventory');

describe('ui-check-inventory', () => {
  describe('classify', () => {
    it('calls a puppeteer/playwright check live-browser', () => {
      expect(classify("const puppeteer = require('puppeteer');")).toBe('live-browser');
      expect(classify("import { chromium } from 'playwright';")).toBe('live-browser');
    });

    it('does NOT count a check that only mentions puppeteer in a comment', () => {
      // the c126 documentation-as-data trap: prose about a tool is not use of it
      expect(classify('/**\n * Renders SSR HTML; a puppeteer version is TODO.\n */\nconst html = render();')).toBe('in-process');
      expect(classify('// playwright would be better here\nconst html = render();')).toBe('in-process');
    });

    it('calls activation reasoning without a browser activation-aware', () => {
      expect(classify('ctrl.activate();\nassert(html.includes("x"));')).toBe('activation-aware');
      expect(classify('expect(el.getAttribute("data-jsgui-type")).toBe("x");')).toBe('activation-aware');
    });

    it('calls plain render + string assertions in-process', () => {
      expect(classify('const html = renderPage({});\nif (!html.includes("marker")) process.exit(1);')).toBe('in-process');
    });

    it('prefers live-browser when a check does both', () => {
      expect(classify("require('puppeteer');\nctrl.activate();")).toBe('live-browser');
    });
  });

  describe('inventory over the real tree', () => {
    const inv = inventory();

    it('finds the corpus and classifies every file exactly once', () => {
      expect(inv.total).toBeGreaterThan(50);
      expect(inv.liveBrowser.length + inv.activationAware.length + inv.inProcess.length).toBe(inv.total);
      expect(inv.totalLines).toBeGreaterThan(1000);
    });

    it('reports the browser-driven checks that exist today', () => {
      expect(inv.liveBrowser.length).toBeGreaterThanOrEqual(4);
      expect(inv.liveBrowser.map((r) => r.file).join(' ')).toMatch(/screenshot\.check\.js/);
    });

    it('shows the in-process pattern dominates — the finding this tool exists to track', () => {
      expect(inv.inProcess.length).toBeGreaterThan(inv.liveBrowser.length * 5);
    });

    it('excludes node_modules and yields repo-relative posix paths', () => {
      for (const r of inv.rows) {
        expect(r.file).not.toMatch(/node_modules/);
        expect(r.file).not.toMatch(/\\/);
        expect(r.file.endsWith('.check.js')).toBe(true);
      }
    });
  });
});
