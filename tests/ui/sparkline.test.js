"use strict";

const jsgui = require("jsgui3-html");
const SparklineControl = require("../../src/ui/controls/Sparkline");

describe("SparklineControl", () => {
  test("renders polyline with viewBox and points attribute", () => {
    const context = new jsgui.Page_Context();
    const s = new SparklineControl({ context, series: [0, 2, 1, 3], width: 100, height: 30 });
    expect(s.dom.attributes.viewBox).toBe("0 0 100 30");
    // children should include a polyline element with points
    const first = s.content && s.content.get(0);
    expect(first).toBeDefined();
    expect(first.dom && typeof first.dom.attributes.points === "string").toBe(true);
    const pts = first.dom.attributes.points.split(" ");
    expect(pts.length).toBeGreaterThan(0);
  });
});
