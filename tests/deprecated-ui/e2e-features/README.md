# Deprecated UI E2E Feature Tests

**Status**: These tests exercise the legacy Express UI (SSR routes, background task dashboards, crawl controls, etc.). The UI has been retired and the suite is frozen for historical reference. The main Jest configuration excludes this directory so the tests never run as part of regular automation.

## Purpose

This directory preserves the specialised end-to-end feature tests that formerly validated:

1. **Precise performance requirements** (response times, throughput)
2. **Detailed telemetry flow verification**
3. **Sequential step-by-step validation**
4. **Concise, actionable output**

They are retained only to document past behaviour. Do **not** extend them for new development.

## Layout

```
tests/deprecated-ui/e2e-features/
├── instant-feedback/       # Response time and instant feedback tests
│   └── crawl-start-response.test.js
├── telemetry-flow/         # Telemetry and SSE stream tests
│   └── preparation-stages.test.js
├── geography-crawl/        # Geography-specific crawl tests
└── README.md
```

## Running (reference only)

Running these tests is not part of any supported workflow. If you need to reproduce legacy behaviour, invoke them explicitly:

```powershell
npm run test:file "tests/deprecated-ui/e2e-features/instant-feedback/crawl-start-response.test.js"
```

> ⚠️ Expect failures: the modern codebase no longer guarantees support for these flows.

## Writing New Tests

Do **not** add new tests here. Any fresh UI work belongs in the new UI stack described in `src/ui/README.md`.
