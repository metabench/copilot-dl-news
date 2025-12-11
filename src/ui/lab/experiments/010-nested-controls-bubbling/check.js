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
			const path = [];
			let node = this;
			while (node) { path.push(node); node = node.parent; }
			for (const current of path) {
				(listeners[type] || []).forEach(fn => {
					calls.push(current.name);
					fn();
				});
			}
			return calls;
		}
	};
}

// Deep chain of 5 levels
const n1 = makeNode("n1");
const n2 = makeNode("n2", n1);
const n3 = makeNode("n3", n2);
const n4 = makeNode("n4", n3);
const n5 = makeNode("n5", n4);

[n1, n2, n3, n4, n5].forEach(n => n.addEventListener("click", () => {}));

const calls = n5.dispatch("click");
log("Bubble path hits every ancestor once", calls.join(",") === "n5,n4,n3,n2,n1", calls.join(","));

(() => {
	const failed = results.filter(r => !r.pass);
	console.log("\nSummary:", `${results.length - failed.length}/${results.length} passed`);
	if (failed.length) {
		failed.forEach(f => console.log(" - FAIL", f.label, f.detail ? `(${f.detail})` : ""));
		process.exitCode = 1;
	}
})();
