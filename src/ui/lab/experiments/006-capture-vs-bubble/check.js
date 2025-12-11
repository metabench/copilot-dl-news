"use strict";

const results = [];
const log = (label, pass, detail) => {
	const status = pass ? "✅" : "❌";
	results.push({ label, pass, detail });
	console.log(`${status} ${label}${detail ? " — " + detail : ""}`);
};

function makeNode(name, parent = null) {
	const capture = {};
	const bubble = {};
	return {
		name,
		parent,
		addEventListener(type, fn, useCapture = false) {
			const store = useCapture ? capture : bubble;
			store[type] = store[type] || [];
			store[type].push(fn);
		},
		dispatch(type) {
			const calls = [];
			const path = [];
			let node = this;
			while (node) { path.push(node); node = node.parent; }

			// Capture: root -> target
			for (let i = path.length - 1; i >= 0; i--) {
				const current = path[i];
				(current.capture?.[type] || []).forEach(fn => {
					calls.push(`capture:${current.name}`);
					fn();
				});
			}
			// Bubble: target -> root
			for (const current of path) {
				(current.bubble?.[type] || []).forEach(fn => {
					calls.push(`bubble:${current.name}`);
					fn();
				});
			}
			return calls;
		},
		capture,
		bubble
	};
}

const root = makeNode("root");
const container = makeNode("container", root);
const child = makeNode("child", container);

// Capture listeners
root.addEventListener("click", () => {}, true);
container.addEventListener("click", () => {}, true);
child.addEventListener("click", () => {}, true);
// Bubble listeners
root.addEventListener("click", () => {}, false);
container.addEventListener("click", () => {}, false);
child.addEventListener("click", () => {}, false);

const calls = child.dispatch("click");
log("Capture before bubble ordering", calls.join(",") === "capture:root,capture:container,capture:child,bubble:child,bubble:container,bubble:root", calls.join(","));

(() => {
	const failed = results.filter(r => !r.pass);
	console.log("\nSummary:", `${results.length - failed.length}/${results.length} passed`);
	if (failed.length) {
		failed.forEach(f => console.log(" - FAIL", f.label, f.detail ? `(${f.detail})` : ""));
		process.exitCode = 1;
	}
})();
