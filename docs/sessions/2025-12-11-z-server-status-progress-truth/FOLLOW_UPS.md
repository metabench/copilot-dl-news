# Follow Ups – z-server status/progress truthfulness

- Add unit tests for `_updateServerStatus(filePath, running)` covering:
	- selected server updates propagate to `ContentArea.setServerRunning(running)`
	- `running:false` clears PID and hides URL in content area
- Decide whether “Already running” should prefer `detectedPort` (if known) over `defaultPort` when inferring URL.
- (Optional) Consider de-registering IPC listeners after initial scan to avoid leaks if `init()` could ever run more than once.
