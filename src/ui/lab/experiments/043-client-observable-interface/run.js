"use strict";

const { startServer } = require("./server");

async function main() {
	const { pageUrl, stop } = await startServer();
	process.stdout.write(`Lab 043 running: ${pageUrl}\n`);
	process.stdout.write("Press Ctrl+C to stop.\n");

	let stopping = false;
	async function shutdown() {
		if (stopping) return;
		stopping = true;
		try {
			await stop();
		} finally {
			process.exit(0);
		}
	}

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

if (require.main === module) {
	main().catch((err) => {
		process.stderr.write(String(err && err.stack || err) + "\n");
		process.exitCode = 1;
	});
}
