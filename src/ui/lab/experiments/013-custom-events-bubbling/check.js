"use strict";

const results = [];
const log = (label, pass, detail) => {
	const status = pass ? "✅" : "❌";
	results.push({ label, pass, detail });
	console.log(`${status} ${label}${detail ? " — " + detail : ""}`);
};

function makeNode(name, parent = null) {
	const listeners = {};
	return {
		name,
		parent,
		addEventListener(type, fn) {
			listeners[type] = listeners[type] || [];
			listeners[type].push(fn);
		},
		dispatch(type, opts = {}) {
			const { bubbles = true, isCustom = false } = opts;
			const calls = [];
			const event = { type, bubbles, isCustom, target: null, currentTarget: null };
			const path = [];
			let node = this;
			while (node) {
				path.push(node);
				if (!bubbles) break;
				node = node.parent;
			}
			event.target = this;
			for (const current of path) {
				event.currentTarget = current;
				(listeners[type] || []).forEach(fn => {
					calls.push(`${event.type}:${current.name}`);
					fn(event);
				});
			}
			return calls;
		}
	};
}

// Build a simple tree: root -> parent -> child
const root = makeNode("root");
const parent = makeNode("parent", root);
const child = makeNode("child", parent);

// Attach listeners for native click and custom event
[root, parent, child].forEach(node => {
	node.addEventListener("click", () => {});
	node.addEventListener("custom", () => {});
});

// Scenario 1: Native click (bubbles=true)
const nativeCalls = child.dispatch("click", { bubbles: true, isCustom: false });
log("Native click bubbles through chain", nativeCalls.join(",") === "click:child,click:parent,click:root", nativeCalls.join(","));

// Scenario 2: Custom event with bubbles=false
const customNoBubble = child.dispatch("custom", { bubbles: false, isCustom: true });
log("Custom event without bubbles stays at target", customNoBubble.join(",") === "custom:child", customNoBubble.join(","));

// Scenario 3: Custom event with bubbles=true
const customBubble = child.dispatch("custom", { bubbles: true, isCustom: true });
log("Custom event with bubbles reaches ancestors", customBubble.join(",") === "custom:child,custom:parent,custom:root", customBubble.join(","));

// Summary
(() => {
	const failed = results.filter(r => !r.pass);
	console.log("\nSummary:", `${results.length - failed.length}/${results.length} passed`);
	if (failed.length) {
		failed.forEach(f => console.log(" - FAIL", f.label, f.detail ? `(${f.detail})` : ""));
		process.exitCode = 1;
	}
})();
