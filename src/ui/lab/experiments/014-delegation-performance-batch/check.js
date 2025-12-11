"use strict";

const results = [];
const log = (label, pass, detail) => {
	const status = pass ? "✅" : "❌";
	results.push({ label, pass, detail });
	console.log(`${status} ${label}${detail ? " — " + detail : ""}`);
};

function perNodeListenerCount(childrenCount) {
	// One handler per child + one per parent for comparison
	return childrenCount;
}

function delegatedListenerCount(childrenCount) {
	// One handler at parent covers all children
	return 1;
}

function simulateDispatch(childrenCount, delegated) {
	// Simple metric: handler invocations per event
	return delegated ? 1 : childrenCount;
}

const sizes = [10, 100, 1000];
sizes.forEach(size => {
	const perNodeHandlers = perNodeListenerCount(size) + 1; // +1 parent baseline
	const delegatedHandlers = delegatedListenerCount(size) + 0; // just parent handler
	const perNodeCalls = simulateDispatch(size, false);
	const delegatedCalls = simulateDispatch(size, true);
	log(`Handlers (size=${size}) delegated vs per-node`, delegatedHandlers < perNodeHandlers, `delegated=${delegatedHandlers}, perNode=${perNodeHandlers}`);
	log(`Dispatch calls (size=${size}) delegated vs per-node`, delegatedCalls < perNodeCalls, `delegated=${delegatedCalls}, perNode=${perNodeCalls}`);
});

(() => {
	const failed = results.filter(r => !r.pass);
	console.log("\nSummary:", `${results.length - failed.length}/${results.length} passed`);
	if (failed.length) {
		failed.forEach(f => console.log(" - FAIL", f.label, f.detail ? `(${f.detail})` : ""));
		process.exitCode = 1;
	}
})();
