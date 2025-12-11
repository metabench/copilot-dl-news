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
		dispatch(type, stopImmediateOn) {
			const calls = [];
			const event = {
				type,
				_immediateStopped: false,
				stopImmediatePropagation() { event._immediateStopped = true; }
			};
			const path = [];
			let node = this;
			while (node) { path.push(node); node = node.parent; }
			for (const current of path) {
				const fns = listeners[type] || [];
				for (let i = 0; i < fns.length; i++) {
					calls.push(`${current.name}#${i + 1}`);
					if (current.name === stopImmediateOn && i === 0) {
						event.stopImmediatePropagation();
					}
					fns[i](event);
					if (event._immediateStopped) break;
				}
				if (event._immediateStopped) break;
			}
			return calls;
		}
	};
}

const root = makeNode("root");
const mid = makeNode("mid", root);
const leaf = makeNode("leaf", mid);

[root, mid, leaf].forEach(n => {
	n.addEventListener("click", () => {});
	n.addEventListener("click", () => {});
});

const noStop = leaf.dispatch("click");
log("No immediate stop runs all handlers", noStop.length === 6, noStop.join(","));

const stopAtMidFirst = leaf.dispatch("click", "mid");
log("stopImmediatePropagation skips sibling handlers and ancestors", stopAtMidFirst.join(",") === "leaf#1,leaf#2,mid#1", stopAtMidFirst.join(","));

(() => {
	const failed = results.filter(r => !r.pass);
	console.log("\nSummary:", `${results.length - failed.length}/${results.length} passed`);
	if (failed.length) {
		failed.forEach(f => console.log(" - FAIL", f.label, f.detail ? `(${f.detail})` : ""));
		process.exitCode = 1;
	}
})();
