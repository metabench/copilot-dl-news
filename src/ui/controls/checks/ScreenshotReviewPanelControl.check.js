#!/usr/bin/env node
"use strict";

const jsgui = require("jsgui3-html");
const { ScreenshotReviewPanelControl } = require("../ScreenshotReviewPanelControl");

function main() {
  const context = new jsgui.Page_Context();
  const control = new ScreenshotReviewPanelControl({ context });
  const html = control.renderHtml();

  const required = [
    'data-screenshot-review-root="true"',
    'data-screenshot-review-api-base="/api/screenshot-review"',
    'data-screenshot-subject="screenshot-review"',
    'data-screenshot-route="/?app=screenshot-review"',
    'data-screenshot-review-stat="runs"',
    'data-screenshot-review-filter="session"',
    'data-screenshot-review-filter="app"',
    'data-screenshot-review-runs="true"',
    'data-screenshot-review-gallery="true"',
    'data-screenshot-review-comments="true"',
    'data-screenshot-review-comment-form="true"',
    'data-screenshot-review-comment-input="true"',
    'data-screenshot-review-status="true"'
  ];

  const missing = required.filter((needle) => !html.includes(needle));
  if (missing.length) {
    throw new Error(`ScreenshotReviewPanelControl missing markers: ${missing.join(", ")}`);
  }

  console.log(html);
  console.log("Rendered ScreenshotReviewPanelControl with run list, gallery, comment form, and screenshot markers");
}

if (require.main === module) {
  main();
}