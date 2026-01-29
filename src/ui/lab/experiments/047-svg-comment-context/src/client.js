"use strict";

const { installConsoleNoiseFilter } = require("../../../../client/consoleNoiseFilter");
installConsoleNoiseFilter();

const jsgui = require("jsgui3-client");
const { Control, Active_HTML_Document, controls } = jsgui;

function toSingleQuoteJson(value) {
    return JSON.stringify(value).replace(/"/g, "'");
}


/* ==========================================================================
   Control: ContextLink
   --------------------------------------------------------------------------
   Draws a connector line between two points.
   Intended to be used inside an <svg>.
   ========================================================================== */
class ContextLink extends Control {
    constructor(spec = {}) {
        super({
            ...spec,
            tagName: "g", // SVG Group
            __type_name: spec.__type_name || "context_link"
        });

        this.add_class("context-link");

        if (!spec.el) {
            this.compose();
            // Store initial coordinates if provided
            this.dom.attributes["data-coords"] = toSingleQuoteJson({
                x1: spec.x1 || 0,
                y1: spec.y1 || 0,
                x2: spec.x2 || 100,
                y2: spec.y2 || 100
            });
        }
    }

    compose() {
        const { context } = this;
        // The line element
        const line = new Control({ context, tagName: "line", __type_name: "line" });
        line.dom.attributes.stroke = "#00FF00"; // Bright green for visibility
        line.dom.attributes.active = "stroke-width";
        line.dom.attributes["stroke-width"] = "2";
        line.dom.attributes["marker-end"] = "url(#arrowhead)"; // Assuming marker exists

        this.add(line);

        // Link ctrl field
        this.dom.attributes["data-jsgui-ctrl-fields"] = toSingleQuoteJson({
            line: line._id()
        });
    }

    activate(el) {
        super.activate(el);
        if (this.__activatedOnce) return;
        this.__activatedOnce = true;

        this.updateGeometry();
    }

    // API to update coordinates dynamically
    setCoords(x1, y1, x2, y2) {
        if (!this.line) return;
        const lineEl = this.line.dom.el;
        if (lineEl) {
            lineEl.setAttribute("x1", x1);
            lineEl.setAttribute("y1", y1);
            lineEl.setAttribute("x2", x2);
            lineEl.setAttribute("y2", y2);
        }
        // Persist to data attribute for hydration consistency
        if (this.dom.el) {
            this.dom.el.setAttribute("data-coords", JSON.stringify({ x1, y1, x2, y2 }));
        }
    }

    updateGeometry() {
        // Read from data attribute on activation
        if (this.dom.el && this.line) {
            try {
                let attr = this.dom.el.getAttribute("data-coords") || "{}";
                // Handle single-quote JSON from server render
                if (attr.indexOf("'") > -1) {
                    attr = attr.replace(/'/g, '"');
                }
                const data = JSON.parse(attr);
                this.setCoords(data.x1, data.y1, data.x2, data.y2);
            } catch (e) {
                console.error("ContextLink hydration error", e);
            }
        }
    }
}
controls.context_link = ContextLink;


/* ==========================================================================
   Control: CommentBubble
   --------------------------------------------------------------------------
   Visual comment indicator.
   Has a 'data-target' pointing to the ID of the element it annotates.
   ========================================================================== */
class CommentBubble extends Control {
    constructor(spec = {}) {
        super({
            ...spec,
            tagName: "g",
            __type_name: spec.__type_name || "comment_bubble"
        });

        this.add_class("comment-bubble");
        // Center coordinates
        this.x = spec.x || 0;
        this.y = spec.y || 0;

        if (!spec.el) {
            this.compose();
            this.dom.attributes.transform = `translate(${this.x}, ${this.y})`;
            this.dom.attributes["data-jsgui-fields"] = toSingleQuoteJson({
                x: this.x,
                y: this.y,
                targetId: spec.targetId || ""
            });
        }
    }

    compose() {
        const { context } = this;

        // 1. The Circle Background
        const circle = new Control({ context, tagName: "circle", __type_name: "circle" });
        circle.dom.attributes.r = "12";
        circle.dom.attributes.fill = "#4444ff";
        circle.dom.attributes.stroke = "#ffffff";
        circle.dom.attributes["stroke-width"] = "2";

        // 2. The Text Label (e.g., "1", "2" or "?")
        const label = new Control({ context, tagName: "text", __type_name: "text" });
        label.add_text("?");
        label.dom.attributes["text-anchor"] = "middle";
        label.dom.attributes.dy = "4"; // Vertical center adjustment
        label.dom.attributes.fill = "#ffffff";
        label.dom.attributes["font-size"] = "12px";
        label.dom.attributes["font-family"] = "sans-serif";
        label.dom.attributes["pointer-events"] = "none"; // Let clicks pass to circle/group

        this.add(circle);
        this.add(label);

        this.dom.attributes["data-jsgui-ctrl-fields"] = toSingleQuoteJson({
            circle: circle._id(),
            label: label._id()
        });
    }

    activate(el) {
        super.activate(el);
        if (this.__activatedOnce) return;
        this.__activatedOnce = true;

        const root = el || this.dom.el;

        // Make Draggable (Basic implementation for lab)
        root.addEventListener("mousedown", (e) => {
            e.preventDefault();
            this.startDrag(e);
        });

        // Initialize fields
        let attr = root.getAttribute("data-jsgui-fields") || "{}";
        if (attr.indexOf("'") > -1) {
            attr = attr.replace(/'/g, '"');
        }
        const fields = JSON.parse(attr);
        this.targetId = fields.targetId;
    }

    startDrag(e) {
        // Find SVG root for coordinate conversion
        const svg = this.dom.el.ownerSVGElement;
        if (!svg) return;

        let startX = e.clientX;
        let startY = e.clientY;

        // Parse current translate
        // (Simplified for lab: assume translate(x,y) format)
        const transform = this.dom.el.getAttribute("transform");
        const match = /translate\(([^,]+)[, ]+([^)]+)\)/.exec(transform);
        let currentX = match ? parseFloat(match[1]) : 0;
        let currentY = match ? parseFloat(match[2]) : 0;

        const onMove = (moveEvt) => {
            const dx = moveEvt.clientX - startX;
            const dy = moveEvt.clientY - startY;

            // Convert screen delta to SVG delta? 
            // For now assume 1:1 if no scaling. 
            // Proper CTM (Current Transformation Matrix) support would be better but keeping it simple.

            this.dom.el.setAttribute("transform", `translate(${currentX + dx}, ${currentY + dy})`);

            // Dispatch event for ContextLink to listen to?
            // "jsgui-drag-move"
            const event = new CustomEvent("jsgui-drag-move", {
                detail: { x: currentX + dx, y: currentY + dy, id: this.dom.el.id },
                bubbles: true
            });
            this.dom.el.dispatchEvent(event);
        };

        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }
}
controls.comment_bubble = CommentBubble;


/* ==========================================================================
   Page: Lab Page
   --------------------------------------------------------------------------
   Hosts the SVG and the Controls.
   ========================================================================== */
class SVGContextLabPage extends Active_HTML_Document {
    constructor(spec = {}) {
        super({ ...spec, __type_name: spec.__type_name || "svg_context_lab_page" });
        if (!spec.el) this.compose();
    }

    compose() {
        const { context } = this;

        // Styles
        const style = new Control({ context, tagName: "style", __type_name: "style" });
        style.add_text(`
            body { font-family: sans-serif; background: #222; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            svg { background: #333; border: 1px solid #555; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
            .context-link { pointer-events: none; }
            .comment-bubble { cursor: grab; }
            .comment-bubble:active { cursor: grabbing; }
        `);
        this.head.add(style);

        const host = new Control({ context, tagName: "main", __type_name: "main" });

        // Create an SVG container
        const svg = new Control({ context, tagName: "svg", __type_name: "svg" });
        svg.dom.attributes.width = "800";
        svg.dom.attributes.height = "600";
        svg.dom.attributes.viewBox = "0 0 800 600";
        // Needed for correct namespace? 
        // jsgui3 might not handle namespace automatically in strings, but browsers handle <svg> in HTML5.

        // 1. Target Element (e.g. a box representing a Code Block)
        const target = new Control({ context, tagName: "rect", __type_name: "rect" });
        target.dom.attributes.x = "300";
        target.dom.attributes.y = "250";
        target.dom.attributes.width = "200";
        target.dom.attributes.height = "100";
        target.dom.attributes.fill = "#55aa55";
        target.dom.attributes.id = "target-box"; // Important for linking
        svg.add(target);

        // 2. Connector Link
        const link = new ContextLink({
            context,
            x1: 100, y1: 100,
            x2: 400, y2: 300 // Center of target box
        });
        link.dom.attributes.id = "my-link";
        svg.add(link);

        // 3. Comment Bubble
        const bubble = new CommentBubble({
            context,
            x: 100, y: 100,
            targetId: "target-box"
        });
        bubble.dom.attributes.id = "my-bubble";
        svg.add(bubble);

        host.add(svg);
        this.body.add(host);
    }
}
controls.svg_context_lab_page = SVGContextLabPage;

module.exports = jsgui;
