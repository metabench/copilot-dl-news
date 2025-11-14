"use strict";

const jsgui = require("jsgui3-html");

// Minimal server-side sparkline SVG control.
class SparklineControl extends jsgui.Control {
  constructor(spec = {}) {
    const { context } = spec;
    super({ ...spec, tagName: "svg" });
    this.add_class("sparkline");
    const { series = [], width = 160, height = 32, stroke = "#4338ca", strokeWidth = 2, fill = "none" } = spec;
    const points = Array.isArray(series) ? series.map((n) => (Number.isFinite(n) ? Number(n) : 0)) : [];
    const max = points.length ? Math.max(...points) : 0;
    const min = points.length ? Math.min(...points) : 0;
    const range = max - min || 1;
    const step = points.length > 1 ? width / (points.length - 1) : width;
    const pathPoints = points.map((p, i) => `${i * step},${height - ((p - min) / range) * height}`).join(" ");
    this.dom.attributes.viewBox = `0 0 ${width} ${height}`;
    // polyline for the sparkline
    const polyline = new jsgui.Control({ context, tagName: "polyline" });
    polyline.dom.attributes.points = pathPoints;
    polyline.dom.attributes.fill = fill;
    polyline.dom.attributes.stroke = stroke;
    polyline.dom.attributes["stroke-width"] = String(strokeWidth);
    polyline.dom.attributes["stroke-linejoin"] = "round";
    polyline.dom.attributes["stroke-linecap"] = "round";
    this.add(polyline);
  }
}

module.exports = SparklineControl;
