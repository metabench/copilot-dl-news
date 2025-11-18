#!/usr/bin/env node
"use strict";

const jsgui = require("jsgui3-html");
const { PagerButtonControl } = require("../PagerButton");

function buildButtons(context) {
  const configs = [
    { text: "<< First", kind: "first", href: "/urls?page=1", disabled: false },
    { text: "Next >", kind: "next", href: "/urls?page=3", disabled: false },
    { text: "Last >>", kind: "last", href: "/urls?page=10", disabled: true }
  ];
  return configs.map((config) => new PagerButtonControl({ context, ...config }));
}

function main() {
  const context = new jsgui.Page_Context();
  const container = new jsgui.div({ context });
  buildButtons(context).forEach((button) => container.add(button));
  const html = container.all_html_render();
  if (!html.includes("pager-button")) {
    throw new Error("PagerButton check failed to render buttons");
  }
  console.log(html);
  console.log("Rendered pager buttons:", 3);
}

if (require.main === module) {
  main();
}
