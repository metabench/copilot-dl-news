# Working Notes – User-terminated banner for checks

## What we can/can't detect

- Node scripts can usually detect Ctrl+C via `SIGINT` and task-stop via `SIGTERM`.
- They **cannot** reliably detect hard kills (e.g. kill -9 / power loss).
- Copilot tool cancellation is visible to the agent UI, but the underlying Node process typically only sees a termination signal (if any).

## Pattern implemented

- Added `src/utils/userTerminationBanner.js` which prints a red `[USER TERMINATED]` banner on `SIGINT`/`SIGTERM` and exits with conventional codes.
- Wired into the streaming/virtual lab checks so the banner is always active.

## Quick usage

- Preload for any script: `node -r ./src/utils/userTerminationBanner <script.js>`
- Disable temporarily: set `USER_TERMINATED_BANNER=0`

- 2025-12-11 — Session created via CLI. Add incremental notes here.
