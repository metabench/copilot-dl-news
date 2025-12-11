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
			const pairs = [];
			const event = { type, target: this, currentTarget: null };
			const path = [];
			let node = this;
			while (node) { path.push(node); node = node.parent; }
			for (const current of path) {
				event.currentTarget = current;
				(listeners[type] || []).forEach(fn => {
					pairs.push(`${event.target.name}->${event.currentTarget.name}`);
					fn(event);
				});
			}
			return pairs;
		}
	};
}

const root = makeNode("root");
const parent = makeNode("parent", root);
const child = makeNode("child", parent);

[root, parent, child].forEach(n => n.addEventListener("click", () => {}));

const pairs = child.dispatch("click");
log("target remains child; currentTarget climbs path", pairs.join(",") === "child->child,child->parent,child->root", pairs.join(","));

(() => {
	const failed = results.filter(r => !r.pass);
	console.log("\nSummary:", `${results.length - failed.length}/${results.length} passed`);
	if (failed.length) {
		failed.forEach(f => console.log(" - FAIL", f.label, f.detail ? `(${f.detail})` : ""));
		process.exitCode = 1;
	}
})();
