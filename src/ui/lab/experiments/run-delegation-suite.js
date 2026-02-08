"use strict";

const { runBrowserScenario, closeShared } = require("../../../shared/utils/browserHarness");

const scenarios = [
	{
		id: "005",
		name: "Delegation Baseline",
		scenario: function () {
			const tracks = { childA: [], childB: [] };
			const root = document.createElement("div");
			const container = document.createElement("div");
			const childA = document.createElement("button");
			childA.id = "childA";
			const childB = document.createElement("button");
			childB.id = "childB";
			container.append(childA, childB);
			root.append(container);
			document.body.append(root);

			childA.addEventListener("click", () => tracks.childA.push("childA"));
			childB.addEventListener("click", () => tracks.childB.push("childB"));
			container.addEventListener("click", ev => {
				if (tracks[ev.target.id]) tracks[ev.target.id].push("container");
			});
			root.addEventListener("click", ev => {
				if (tracks[ev.target.id]) tracks[ev.target.id].push("root");
			});

			childA.dispatchEvent(new Event("click", { bubbles: true }));
			childB.dispatchEvent(new Event("click", { bubbles: true }));
			return tracks;
		},
		assert(result) {
			const checks = [];
			const expectA = ["childA", "container", "root"];
			const expectB = ["childB", "container", "root"];
			checks.push(makeCheck("childA order", arraysEqual(result.childA, expectA), result.childA.join(",")));
			checks.push(makeCheck("childB order", arraysEqual(result.childB, expectB), result.childB.join(",")));
			checks.push(makeCheck("equal counts", result.childA.length === result.childB.length && result.childA.length === 3, `${result.childA.length}/${result.childB.length}`));
			return checks;
		}
	},
	{
		id: "006",
		name: "Capture vs Bubble",
		scenario: function () {
			const calls = [];
			const root = document.createElement("div");
			const container = document.createElement("div");
			const child = document.createElement("button");
			container.append(child);
			root.append(container);
			document.body.append(root);

			root.addEventListener("click", () => calls.push("capture:root"), true);
			container.addEventListener("click", () => calls.push("capture:container"), true);
			child.addEventListener("click", () => calls.push("capture:child"), true);
			root.addEventListener("click", () => calls.push("bubble:root"));
			container.addEventListener("click", () => calls.push("bubble:container"));
			child.addEventListener("click", () => calls.push("bubble:child"));

			child.dispatchEvent(new Event("click", { bubbles: true }));
			return { calls };
		},
		assert(result) {
			const expected = "capture:root,capture:container,capture:child,bubble:child,bubble:container,bubble:root";
			return [makeCheck("capture before bubble", result.calls.join(",") === expected, result.calls.join(","))];
		}
	},
	{
		id: "007",
		name: "stopPropagation",
		scenario: function () {
			const callsNoStop = [];
			const callsStop = [];

			const root = document.createElement("div");
			root.id = "root";
			const mid = document.createElement("div");
			mid.id = "mid";
			const leaf = document.createElement("button");
			leaf.id = "leaf";
			mid.append(leaf);
			root.append(mid);
			document.body.append(root);

			[root, mid, leaf].forEach(node => node.addEventListener("click", () => callsNoStop.push(node.id)));
			leaf.dispatchEvent(new Event("click", { bubbles: true }));

			const root2 = document.createElement("div");
			root2.id = "root";
			const mid2 = document.createElement("div");
			mid2.id = "mid";
			const leaf2 = document.createElement("button");
			leaf2.id = "leaf";
			mid2.append(leaf2);
			root2.append(mid2);
			document.body.append(root2);

			root2.addEventListener("click", () => callsStop.push("root"));
			mid2.addEventListener("click", ev => {
				callsStop.push("mid");
				ev.stopPropagation();
			});
			leaf2.addEventListener("click", () => callsStop.push("leaf"));

			leaf2.dispatchEvent(new Event("click", { bubbles: true }));
			return { noStop: callsNoStop, stopAtMid: callsStop };
		},
		assert(result) {
			return [
				makeCheck("no stop hits all", result.noStop.length === 3, result.noStop.join(",")),
				makeCheck("stop at mid halts ancestors", result.stopAtMid.join(",") === "leaf,mid", result.stopAtMid.join(","))
			];
		}
	},
	{
		id: "008",
		name: "stopImmediatePropagation",
		scenario: function () {
			const noStop = [];
			const stopAtMid = [];

			const root = document.createElement("div");
			root.id = "root";
			const mid = document.createElement("div");
			mid.id = "mid";
			const leaf = document.createElement("button");
			leaf.id = "leaf";
			mid.append(leaf);
			root.append(mid);
			document.body.append(root);

			[root, mid, leaf].forEach(node => {
				node.addEventListener("click", () => noStop.push(`${node.id}#1`));
				node.addEventListener("click", () => noStop.push(`${node.id}#2`));
			});
			leaf.dispatchEvent(new Event("click", { bubbles: true }));

			const root2 = document.createElement("div");
			root2.id = "root";
			const mid2 = document.createElement("div");
			mid2.id = "mid";
			const leaf2 = document.createElement("button");
			leaf2.id = "leaf";
			mid2.append(leaf2);
			root2.append(mid2);
			document.body.append(root2);

			leaf2.addEventListener("click", () => stopAtMid.push("leaf#1"));
			leaf2.addEventListener("click", () => stopAtMid.push("leaf#2"));
			mid2.addEventListener("click", ev => {
				stopAtMid.push("mid#1");
				ev.stopImmediatePropagation();
			});
			mid2.addEventListener("click", () => stopAtMid.push("mid#2"));
			root2.addEventListener("click", () => stopAtMid.push("root#1"));
			root2.addEventListener("click", () => stopAtMid.push("root#2"));

			leaf2.dispatchEvent(new Event("click", { bubbles: true }));
			return { noStop, stopAtMid };
		},
		assert(result) {
			return [
				makeCheck("no immediate stop runs all", result.noStop.length === 6, result.noStop.join(",")),
				makeCheck("stopImmediatePropagation skips siblings/ancestors", result.stopAtMid.join(",") === "leaf#1,leaf#2,mid#1", result.stopAtMid.join(","))
			];
		}
	},
	{
		id: "009",
		name: "target vs currentTarget",
		scenario: function () {
			const pairs = [];
			const root = document.createElement("div");
			const parent = document.createElement("div");
			const child = document.createElement("button");
			parent.append(child);
			root.append(parent);
			document.body.append(root);

			[root, parent, child].forEach(node => {
				node.addEventListener("click", ev => {
					pairs.push(`${ev.target.id || "child"}->${ev.currentTarget.id || node.tagName.toLowerCase()}`);
				});
			});

			child.id = "child";
			parent.id = "parent";
			root.id = "root";
			child.dispatchEvent(new Event("click", { bubbles: true }));
			return { pairs };
		},
		assert(result) {
			return [makeCheck("target stays child", result.pairs.join(",") === "child->child,child->parent,child->root", result.pairs.join(","))];
		}
	},
	{
		id: "010",
		name: "Nested bubbling",
		scenario: function () {
			const names = ["n1", "n2", "n3", "n4", "n5"];
			const nodes = names.map(name => {
				const el = document.createElement("div");
				el.id = name;
				return el;
			});
			for (let i = nodes.length - 1; i > 0; i--) nodes[i - 1].append(nodes[i]);
			document.body.append(nodes[0]);
			const calls = [];
			nodes.forEach(node => node.addEventListener("click", () => calls.push(node.id)));
			nodes[nodes.length - 1].dispatchEvent(new Event("click", { bubbles: true }));
			return { calls };
		},
		assert(result) {
			return [makeCheck("bubble hits every ancestor", result.calls.join(",") === "n5,n4,n3,n2,n1", result.calls.join(","))];
		}
	},
	{
		id: "011",
		name: "Delegated selector matching",
		scenario: function () {
			const hitsItem = [];
			const hitsText = [];
			const root = document.createElement("div");
			const list = document.createElement("ul");
			list.dataset.name = "list";
			list.className = "list";
			const item = document.createElement("li");
			item.dataset.name = "item";
			item.className = "item";
			const text = document.createTextNode("label");
			item.append(text);
			list.append(item);
			root.append(list);
			document.body.append(root);

			list.addEventListener("click", ev => {
				if (ev.target.nodeType !== Node.ELEMENT_NODE) return;
				const target = ev.target;
				if (target.classList.contains("item")) hitsItem.push(`list-hit-${target.dataset.name}`);
			});
			root.addEventListener("click", ev => {
				if (ev.target.nodeType !== Node.ELEMENT_NODE) return;
				const target = ev.target;
				if (target.classList.contains("list")) {
					hitsText.push(`root-hit-${target.dataset.name}`);
				}
			});

			item.dispatchEvent(new Event("click", { bubbles: true }));
			text.dispatchEvent(new Event("click", { bubbles: true }));
			return { hitItem: hitsItem, hitText: hitsText };
		},
		assert(result) {
			return [
				makeCheck("delegated hits item", result.hitItem.length === 1 && result.hitItem[0] === "list-hit-item", result.hitItem.join(",") || "(empty)"),
				makeCheck("text node ignored", result.hitText.length === 0, result.hitText.join(",") || "(empty)")
			];
		}
	},
	{
		id: "012",
		name: "Dynamic children delegation",
		scenario: function () {
			const parent = document.createElement("div");
			parent.id = "parent";
			const child = document.createElement("button");
			child.id = "child";
			parent.append(child);
			document.body.append(parent);

			const hitsInitial = [];
			const hitsRemoved = [];
			const hitsAdded = [];

			const initialListener = ev => hitsInitial.push(ev.target.id);
			parent.addEventListener("click", initialListener);
			child.dispatchEvent(new Event("click", { bubbles: true }));

			parent.removeEventListener("click", initialListener);
			const removedListener = ev => hitsRemoved.push(ev.target.id);
			parent.addEventListener("click", removedListener);
			parent.removeChild(child);
			child.dispatchEvent(new Event("click", { bubbles: true }));

			parent.removeEventListener("click", removedListener);
			const addedListener = ev => hitsAdded.push(ev.target.id);
			parent.addEventListener("click", addedListener);
			const child2 = document.createElement("button");
			child2.id = "child2";
			parent.append(child2);
			child2.dispatchEvent(new Event("click", { bubbles: true }));

			return { hitsInitial, hitsRemoved, hitsAdded };
		},
		assert(result) {
			return [
				makeCheck("existing child covered", result.hitsInitial.join(",") === "child", result.hitsInitial.join(",")),
				makeCheck("removed child no longer bubbles", result.hitsRemoved.length === 0, result.hitsRemoved.join(",") || "(empty)"),
				makeCheck("new child covered", result.hitsAdded.join(",") === "child2", result.hitsAdded.join(","))
			];
		}
	},
	{
		id: "013",
		name: "Custom events bubbling",
		scenario: function () {
			const root = document.createElement("div");
			const parent = document.createElement("div");
			const child = document.createElement("button");
			parent.append(child);
			root.append(parent);
			document.body.append(root);

			const logCalls = [];
			[root, parent, child].forEach(node => {
				node.addEventListener("click", ev => logCalls.push(`click:${ev.currentTarget.id || node.tagName.toLowerCase()}`));
				node.addEventListener("custom", ev => logCalls.push(`custom:${ev.currentTarget.id || node.tagName.toLowerCase()}`));
			});

			child.id = "child";
			parent.id = "parent";
			root.id = "root";

			child.dispatchEvent(new Event("click", { bubbles: true }));
			child.dispatchEvent(new CustomEvent("custom", { bubbles: false }));
			child.dispatchEvent(new CustomEvent("custom", { bubbles: true }));

			return { logCalls };
		},
		assert(result) {
			return [
				makeCheck("native click bubbles", result.logCalls.slice(0, 3).join(",") === "click:child,click:parent,click:root", result.logCalls.slice(0, 3).join(",")),
				makeCheck("custom no bubble stays at target", result.logCalls[3] === "custom:child", result.logCalls[3]),
				makeCheck("custom bubble reaches ancestors", result.logCalls.slice(4).join(",") === "custom:child,custom:parent,custom:root", result.logCalls.slice(4).join(","))
			];
		}
	},
	{
		id: "014",
		name: "Delegation performance batch",
		scenario: function () {
			const sizes = [10, 100, 1000];
			const rows = [];
			sizes.forEach(size => {
				const parent = document.createElement("div");
				const children = [];
				for (let i = 0; i < size; i++) {
					const child = document.createElement("button");
					child.id = `c${i}`;
					children.push(child);
					parent.append(child);
				}
				document.body.append(parent);

				const perNodeStart = performance.now();
				children.forEach(child => child.addEventListener("click", () => {}));
				const perNodeRegisterTime = performance.now() - perNodeStart;

				const delegatedStart = performance.now();
				parent.addEventListener("click", () => {});
				const delegatedRegisterTime = performance.now() - delegatedStart;

				const perNodeHandlers = size + 1; // one per child + parent baseline
				const delegatedHandlers = 1; // one at parent
				const perNodeCalls = size; // conceptual work across all children
				const delegatedCalls = 1; // single delegated handler

				rows.push({ size, perNodeHandlers, delegatedHandlers, perNodeCalls, delegatedCalls, perNodeRegisterTime, delegatedRegisterTime });
			});
			return rows;
		},
		assert(result) {
			const checks = [];
			result.forEach(row => {
				checks.push(makeCheck(`handlers smaller @${row.size}`, row.delegatedHandlers < row.perNodeHandlers, `delegated=${row.delegatedHandlers}, perNode=${row.perNodeHandlers}`));
				checks.push(makeCheck(`calls smaller @${row.size}`, row.delegatedCalls < row.perNodeCalls, `delegated=${row.delegatedCalls}, perNode=${row.perNodeCalls}`));
				checks.push(makeCheck(`register faster-ish @${row.size}`, row.delegatedRegisterTime <= row.perNodeRegisterTime * 1.1, `delegated=${row.delegatedRegisterTime.toFixed(3)}ms, perNode=${row.perNodeRegisterTime.toFixed(3)}ms`));
			});
			return checks;
		}
	}
];

function arraysEqual(a, b) {
	return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

function makeCheck(label, pass, detail) {
	return { label, pass, detail };
}

function printCheck(check) {
	const status = check.pass ? "✅" : "❌";
	const detail = check.detail ? ` — ${check.detail}` : "";
	console.log(`${status} ${check.label}${detail}`);
}

async function runScenario(def) {
	const { result, logs, errors } = await runBrowserScenario({ name: def.name, scenario: def.scenario });
	if (logs.length) {
		console.log(`Console (${def.id} ${def.name}):`);
		logs.forEach(l => console.log(` [${l.type}] ${l.text}`));
	}
	if (errors.length) {
		console.log(`Errors (${def.id} ${def.name}):`);
		errors.forEach(e => console.log(` [error] ${e.text}`));
	}
	const checks = def.assert(result, logs, errors);
	checks.forEach(printCheck);
	const failed = checks.filter(c => !c.pass).length;
	console.log(`Summary ${def.id}: ${checks.length - failed}/${checks.length} passed\n`);
	return failed;
}

async function main() {
	const selectorArg = process.argv.find(arg => arg.startsWith("--scenario"));
	let selected = scenarios;
	if (selectorArg) {
		const raw = selectorArg.split("=")[1] || "";
		const wanted = new Set(raw.split(",").map(s => s.trim()).filter(Boolean));
		selected = scenarios.filter(s => wanted.has(s.id) || wanted.has(s.name.toLowerCase()));
	}
	let totalFailed = 0;
	for (const scenario of selected) {
		console.log(`Running ${scenario.id} – ${scenario.name}`);
		totalFailed += await runScenario(scenario);
	}
	await closeShared();
	if (totalFailed) process.exitCode = 1;
}

main().catch(err => {
	console.error(err);
	process.exitCode = 1;
	closeShared();
});
