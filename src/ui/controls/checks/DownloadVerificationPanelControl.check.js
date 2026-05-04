#!/usr/bin/env node
"use strict";

const jsgui = require("jsgui3-html");
const { DownloadVerificationPanelControl } = require("../DownloadVerificationPanelControl");

function main() {
  const context = new jsgui.Page_Context();
  const control = new DownloadVerificationPanelControl({ context });
  const html = control.renderHtml();

  const required = [
    'data-download-verification-root="true"',
    'data-download-verification-api-base="/api/downloads/verifications"',
    'data-download-verification-stat="verified"',
    'data-download-verification-stat="saved"',
    'data-download-verification-stat="algorithms"',
    'data-download-verification-stat="levels"',
    'data-download-verification-input="limit"',
    'data-download-verification-input="since"',
    'data-download-verification-table="true"',
    'data-download-verification-status="true"'
  ];

  const missing = required.filter((needle) => !html.includes(needle));
  if (missing.length) {
    throw new Error(`DownloadVerificationPanelControl missing markers: ${missing.join(", ")}`);
  }

  console.log(html);
  console.log("Rendered DownloadVerificationPanelControl with stats, filters, table, and status regions");
}

if (require.main === module) {
  main();
}