# Server Lifecycle Contract ("--check" Mode)

## Boundary
UI servers (Express entrypoints under `src/ui/server/`) must support a **non-hanging verification mode** so CI/agents can validate startup wiring.

The verification consumer is any script that runs `node <server> --check` expecting a fast exit.

## Contract

### Inputs
- CLI flag: `--check`
- Port selection: `--port <number>` (or `PORT` env)
- Host selection: `--host <string>` (or `HOST` env)
- Optional: `SERVER_NAME` env for log labeling

### Behavior
When `--check` is present, the server must:
1. Start listening on the resolved host/port.
2. Verify it responds to at least `GET /` (or a configured health endpoint).
3. Shut down deterministically.
4. Exit with:
   - `0` on success
   - `1` on failure

### Implementation reference
The standard implementation is:
- `src/ui/server/utils/serverStartupCheck.js`
  - `handleStartupCheck()` (spawns + probes + kills)
  - `wrapServerForCheck()` (inline mode: listen + probe + `server.close()`)

## Invariants
- **Must not hang** in `--check` mode.
- **Must not leak sockets**: check probes must use `Connection: close` and disable keep-alive.
- **Must not require UI interaction** (no browsers, no Electron).
- **Failure mode is actionable**: logs include enough context (port, error) to diagnose.

## Enforcement
- Jest contract test: `tests/ui/server/serverStartupCheckUtility.test.js`

## Change protocol
If you need to change check behavior:
1. Update `src/ui/server/utils/serverStartupCheck.js`.
2. Update this doc.
3. Keep `--check` exit codes and the “no hang” invariant stable.
4. Extend `tests/ui/server/serverStartupCheckUtility.test.js` to cover the new behavior.
