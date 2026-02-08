"use strict";

require("../../../../shared/utils/userTerminationBanner");

const path = require("path");
const { runFractalChecks } = require("./fractal.check");

async function main() {
	// Run synthetic matrix check (existing harness)
	require(path.join(__dirname, "check"));
	const priorExit = process.exitCode || 0;

	// Run fractal hex virtual-scroll validation
	const ok = await runFractalChecks();
	if (!ok || priorExit) {
		process.exitCode = 1;
	}
}

if (require.main === module) {
	main().catch(err => {
		console.error(err);
		process.exitCode = 1;
	}).finally(() => {
		// If anything (Puppeteer / sockets) leaves handles behind, exit anyway.
		setTimeout(() => process.exit(process.exitCode || 0), 0).unref();
	});
}
