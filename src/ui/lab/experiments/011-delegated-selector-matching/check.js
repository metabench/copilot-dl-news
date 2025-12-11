"use strict";

const results = [];
const log = (label, pass, detail) => {
	const status = pass ? "✅" : "❌";
	results.push({ label, pass, detail });
	console.log(`${status} ${label}${detail ? " — " + detail : ""}`);
};

function makeNode(name, classes = [], parent = null) {
	const listeners = {};
	return {
		name,
		classes,
		parent,
		_listeners: listeners,
		addEventListener(type, fn) {
			listeners[type] = listeners[type] || [];
			listeners[type].push(fn);
		},
		dispatch(type) {
			const event = { type, target: this, currentTarget: null };
			const hits = [];
			let node = this;
			while (node) {
				event.currentTarget = node;
				(node._listeners[type] || []).forEach(fn => fn(event, hits));
				node = node.parent;
			}
			return hits;
		}
	};
}

const matches = (node, selector) => node.classes.includes(selector);

const root = makeNode("root", ["root"]);
const list = makeNode("list", ["list"], root);
const item = makeNode("item", ["item"], list);
const text = makeNode("text", [], item); // simulate text control

// Delegated listener on list filtering by class "item"
list.addEventListener("click", (e, hits) => {
	if (matches(e.target, "item")) hits.push(`list-hit-${e.target.name}`);
});
// Delegated listener on root filtering by class "list"
root.addEventListener("click", (e, hits) => {
	if (matches(e.target, "list")) hits.push(`root-hit-${e.target.name}`);
});

const hitItem = item.dispatch("click");
const hitText = text.dispatch("click");

log("Selector hits on item target only", hitItem.length === 1 && hitItem[0] === "list-hit-item", hitItem.join(",") || "(empty)");
log("Text node does not trigger selectors", hitText.length === 0, hitText.join(",") || "(empty)");

(() => {
	const failed = results.filter(r => !r.pass);
	console.log("\nSummary:", `${results.length - failed.length}/${results.length} passed`);
	if (failed.length) {
		failed.forEach(f => console.log(" - FAIL", f.label, f.detail ? `(${f.detail})` : ""));
		process.exitCode = 1;
	}
})();
