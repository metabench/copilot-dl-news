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
		dispatch(type, stopperAt) {
			const calls = [];
			const event = { type, stopPropagation() { event.stopped = true; }, stopped: false };
			const path = [];
			let node = this;
			while (node) { path.push(node); node = node.parent; }
			for (const current of path) {
				event.currentTarget = current;
				(listeners[type] || []).forEach(fn => {
					calls.push(current.name);
					if (current.name === stopperAt) {
						event.stopPropagation();
					}
					fn(event);
				});
				if (event.stopped) break;
			}
			return calls;
		}
	};
}

const root = makeNode("root");
const mid = makeNode("mid", root);
const leaf = makeNode("leaf", mid);

[root, mid, leaf].forEach(n => n.addEventListener("click", () => {}));

const noStop = leaf.dispatch("click");
log("No stopPropagation hits all", noStop.join(",") === "leaf,mid,root", noStop.join(","));

const stopAtMid = leaf.dispatch("click", "mid");
log("stopPropagation at mid halts ancestors", stopAtMid.join(",") === "leaf,mid", stopAtMid.join(","));

(() => {
	const failed = results.filter(r => !r.pass);
	console.log("\nSummary:", `${results.length - failed.length}/${results.length} passed`);
	if (failed.length) {
		failed.forEach(f => console.log(" - FAIL", f.label, f.detail ? `(${f.detail})` : ""));
		process.exitCode = 1;
	}
})();
