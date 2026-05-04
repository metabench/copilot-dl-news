# Place Hub Guessing Lab

Interactive lab for testing and verifying the Place Hub Guessing matrix UI with real-time event logging.

## Features

- **5-State Matrix Display**: Visualizes place×host matrix with all 5 states (unchecked, guessed, pending, verified-present, verified-absent)
- **Event Logging**: Real-time log of all matrix events (cell clicks, state changes, verifications)
- **Verification Tests**: Automated checks that the matrix renders correctly
- **SSE Event Stream**: Events streamed back to AI agents for monitoring
- **Electron Integration**: Native desktop experience with event capture

## Quick Start

```bash
# Run with Express server (browser)
node labs/place-hub-guessing-lab/run-lab.js

# Run with Electron app
node labs/place-hub-guessing-lab/run-lab.js --electron

# Run verification tests
node labs/place-hub-guessing-lab/run-lab.js --verify
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Window                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  PlaceHubGuessingMatrixControl (jsgui3 SSR)            │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │  Matrix Grid (5 states)                          │  │ │
│  │  │  • Unchecked (empty)                             │  │ │
│  │  │  • Guessed (? - amber)                           │  │ │
│  │  │  • Pending (• - gray)                            │  │ │
│  │  │  • Verified Present (✓ - green)                  │  │ │
│  │  │  • Verified Absent (× - red)                     │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │                                                         │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │  Event Log Panel (SSE streaming)                 │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
          │                              ▲
          │ SSE /events                  │ fetch /api/*
          ▼                              │
┌─────────────────────────────────────────────────────────────┐
│                    Express Server                            │
│  • GET /           → Matrix page                             │
│  • GET /events     → SSE event stream                        │
│  • GET /api/stats  → Current matrix stats                    │
│  • POST /api/verify→ Simulate cell verification              │
│  • GET /api/logs   → Retrieve event log                      │
└─────────────────────────────────────────────────────────────┘
```

## Event Types

| Event | Description |
|-------|-------------|
| `matrix:rendered` | Matrix control rendered with stats |
| `cell:click` | User clicked a cell |
| `cell:verified` | Cell state changed to verified |
| `test:pass` | Verification test passed |
| `test:fail` | Verification test failed |

## Verification Tests

The lab runs automated tests to verify the matrix is functioning:

1. **5-State CSS Classes**: All state classes present in rendered HTML
2. **Legend Labels**: All 5 state labels in legend
3. **Stats Accuracy**: Stats match actual data distribution
4. **Cell Links**: Drilldown links correctly formatted
5. **Virtual Matrix**: Virtual scrolling mode works
