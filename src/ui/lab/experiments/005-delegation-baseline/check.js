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
		dispatch(type) {
			const calls = [];
			const event = { type, target: this, currentTarget: null };
			const path = [];
			let node = this;
			while (node) {
				path.push(node);
				node = node.parent;
			}
			// Bubble phase only for this baseline
			for (const current of path) {
				event.currentTarget = current;
				(listeners[type] || []).forEach(fn => {
					calls.push(`${type}:${current.name}`);
					fn(event);
				});
			}
			return calls;
		}
	};
}

// Build tree: root -> container -> childA/childB
const root = makeNode("root");
const container = makeNode("container", root);
const childA = makeNode("childA", container);
const childB = makeNode("childB", container);

// Delegated listener on container
container.addEventListener("click", () => {});
// Delegated listener on root
root.addEventListener("click", () => {});
// Direct listeners on children
childA.addEventListener("click", () => {});
childB.addEventListener("click", () => {});

const callsA = childA.dispatch("click");
const callsB = childB.dispatch("click");

log("Delegated + direct handler order (childA)", callsA.join(",") === "click:childA,click:container,click:root", callsA.join(","));
log("Delegated + direct handler order (childB)", callsB.join(",") === "click:childB,click:container,click:root", callsB.join(","));
log("Same handler count for siblings", callsA.length === callsB.length && callsA.length === 3, `counts=${callsA.length},${callsB.length}`);

(() => {
	const failed = results.filter(r => !r.pass);
	console.log("\nSummary:", `${results.length - failed.length}/${results.length} passed`);
	if (failed.length) {
		failed.forEach(f => console.log(" - FAIL", f.label, f.detail ? `(${f.detail})` : ""));
		process.exitCode = 1;
	}
})();
