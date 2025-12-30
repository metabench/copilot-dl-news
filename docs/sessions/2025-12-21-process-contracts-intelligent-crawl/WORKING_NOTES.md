# Working Notes – Process Contracts for Intelligent Crawl

- 2025-12-21 — Goal: make intelligent crawl place-hub prioritisation predictable via deterministic “process contract” tests.

## Key discoveries
- Place hub “verification” is already a first-class planning stage in IntelligentPlanRunner: `verify-place-hubs`.
- “Highest priority” is encoded as a positive number (e.g. 250) at enqueue time, but QueueManager converts priority overrides to negative numbers (`-abs(maxOverride)`) so they float to the top of the MinHeap.

## Implemented contracts
- IntelligentPlanRunner contract: missing country hubs are enqueued at priority 250 with `type.kind='place-hub-verification'` and these enqueues occur before hub seeding enqueues.
	- File: src/crawler/__tests__/IntelligentPlanRunner.placeHubVerification.contract.test.js
- QueueManager contract: explicit priority overrides are served first (higher requestedPriority => earlier dequeue).
	- File: src/crawler/__tests__/QueueManager.priorityOverride.contract.test.js

## Commands / evidence
- npm run test:by-path src/crawler/__tests__/IntelligentPlanRunner.placeHubVerification.contract.test.js
- npm run test:by-path src/crawler/__tests__/QueueManager.priorityOverride.contract.test.js

## Notes
- The Jest runner logs a non-fatal warning about `--localstorage-file` being provided without a valid path.
