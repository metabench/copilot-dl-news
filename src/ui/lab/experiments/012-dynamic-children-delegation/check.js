"use strict";

const results = [];
const log = (label, pass, detail) => {
	const status = pass ? "✅" : "❌";
	results.push({ label, pass, detail });
	console.log(`${status} ${label}${detail ? " — " + detail : ""}`);
};

function makeNode(name, parent = null) {
	const listeners = {};
	const node = {
		name,
		parent,
		children: [],
		_listeners: listeners,
		addEventListener(type, fn) {
			listeners[type] = listeners[type] || [];
			listeners[type].push(fn);
		},
		addChild(child) {
			child.parent = node;
			node.children.push(child);
		},
		removeChild(child) {
			node.children = node.children.filter(c => c !== child);
			child.parent = null;
		},
		dispatch(type) {
			const hits = [];
			const event = { type, target: this, currentTarget: null };
			let current = this;
			while (current) {
				event.currentTarget = current;
				(current._listeners[type] || []).forEach(fn => fn(event, hits));
				current = current.parent;
			}
			return hits;
		}
	};
	return node;
}

const root = makeNode("root");
const parent = makeNode("parent", root);
const child = makeNode("child", parent);

// Delegated listener on parent collecting targets
parent.addEventListener("click", (e, hits) => hits.push(e.target.name));

// Initial dispatch
const initialHits = child.dispatch("click");
log("Delegation covers existing child", initialHits.join(",") === "child", initialHits.join(","));

// Remove child
parent.removeChild(child);
const afterRemoveHits = child.dispatch("click");
log("Removed child no longer bubbles to parent", afterRemoveHits.length === 0, afterRemoveHits.join(","));

// Add new child and dispatch
const child2 = makeNode("child2");
parent.addChild(child2);
const afterAddHits = child2.dispatch("click");
log("New child is covered without rebinding", afterAddHits.join(",") === "child2", afterAddHits.join(","));

(() => {
	const failed = results.filter(r => !r.pass);
	console.log("\nSummary:", `${results.length - failed.length}/${results.length} passed`);
	if (failed.length) {
		failed.forEach(f => console.log(" - FAIL", f.label, f.detail ? `(${f.detail})` : ""));
		process.exitCode = 1;
	}
})();
