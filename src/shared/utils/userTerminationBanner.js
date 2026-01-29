"use strict";

let installed = false;

function formatRed(text) {
	// ANSI red + reset. Works in most terminals; harmless if not supported.
	return `\x1b[31m${text}\x1b[0m`;
}

function emitBanner({ signal, label }) {
	const stamp = new Date().toISOString();
	const parts = ["[USER TERMINATED]", signal ? `(${signal})` : null, label ? `— ${label}` : null, stamp].filter(Boolean);
	const line = parts.join(" ");
	try {
		process.stderr.write(`${formatRed(line)}\n`);
	} catch (e) {
		// Fallback if stderr is unavailable.
		try {
			console.error(line);
		} catch (e2) {
			// ignore
		}
	}
}

/**
 * Installs SIGINT/SIGTERM handlers that print a red `[USER TERMINATED]` banner.
 *
 * Notes:
 * - You cannot detect *all* termination types (e.g. hard kill / power loss).
 * - If the user hits Ctrl+C, Node emits SIGINT; VS Code task stop often emits SIGTERM.
 * - Because adding a SIGINT handler disables Node's default Ctrl+C exit, this helper
 *   restores that behavior by calling `process.exit(...)`.
 */
function installUserTerminationBanner(options = {}) {
	if (installed) return;
	if (process.env.USER_TERMINATED_BANNER === "0") return;
	installed = true;

	const label = typeof options.label === "string" ? options.label : "";
	const exitOnSignal = options.exitOnSignal !== false;

	process.once("SIGINT", () => {
		emitBanner({ signal: "SIGINT", label });
		if (exitOnSignal) process.exit(130);
	});
	process.once("SIGTERM", () => {
		emitBanner({ signal: "SIGTERM", label });
		if (exitOnSignal) process.exit(143);
	});
}

// If preloaded via `node -r`, install automatically.
installUserTerminationBanner();

module.exports = { installUserTerminationBanner };
