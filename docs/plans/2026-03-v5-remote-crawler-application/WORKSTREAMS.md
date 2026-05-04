# Workstreams – V5 Remote Crawler Application

## WS-1 Boundary and Versioning

### Purpose
Create a real v5 subsystem boundary for the remote crawler application.

### Deliverables
- v5 namespace/location decision
- compatibility adapters to reused assets
- migration map: reused, wrapped, replaced

### Exit Criteria
- future sessions can implement against v5 without mutating unrelated legacy paths by default

## WS-2 Runtime and Storage

### Purpose
Stabilize the crawl backend and define its persistent model.

### Deliverables
- bootable runtime
- normalized status/health/control model
- persisted crawl runs, domains, bundle jobs, and bundle artifacts
- persisted place/topic hub candidates, decisions, and learned-pattern hooks
- worker/process model that keeps heavy crawl execution off the UI/gateway event loop

### Exit Criteria
- backend can run locally and on a remote host with repeatable startup/shutdown behavior
- crawl load does not meaningfully degrade UI/API responsiveness
- intelligent hub suggestions can survive process restart and remain usable for crawl planning

## WS-3 Gateway and Contracts

### Purpose
Present one external API for UI, CLI, and downloads.

### Deliverables
- `/api/v5/...` namespace or equivalent
- contract docs for runs, hub suggestions, articles, bundles, events, auth
- SSE or WS event model

### Exit Criteria
- shell and CLI can both rely on the same documented gateway

## WS-4 Operator Shell

### Purpose
Make the app directly operable in the browser.

### Deliverables
- Control Room
- Discovery Intelligence surfaces for place/topic hub review
- Monitoring
- Settings/Auth chrome
- navigation and action feedback
- responsiveness budget and visible degraded-state handling under load

### Exit Criteria
- routine crawl operations are UI-first, not CLI-only
- operators can review hub suggestions and launch crawl work from accepted candidates

## WS-5 Article Library and Reader

### Purpose
Make the remote app directly useful for reading and reviewing harvested content.

### Deliverables
- article list with filters
- article reader
- host/date/run pivots

### Exit Criteria
- operators can browse and read downloaded news without exporting first

## WS-6 Bundle Manager

### Purpose
Give operators a strong export/download workflow.

### Deliverables
- create bundle job
- progress state
- manifest details
- download link/history
- integrity metadata and operator-safe retry semantics
- retention policy hooks
- background archive execution model with request-time job enqueue only

### Exit Criteria
- operators can request and retrieve large compressed exports reliably

## WS-7 Monitoring and Recovery

### Purpose
Improve confidence and operability under failure.

### Deliverables
- restart/recovery actions
- error and event views
- anomaly indicators
- job failure visibility
- disk pressure, queue pressure, and backpressure indicators

### Exit Criteria
- operator can detect, explain, and recover common failure cases

## WS-8 Deployment and Security

### Purpose
Make v5 safe and practical to host remotely.

### Deliverables
- deployment packaging
- reverse proxy guidance
- auth posture
- secrets/config model
- always-on restart/supervision model
- no public unauthenticated control surface

### Exit Criteria
- v5 can be deployed on a remote host without exposing raw unsafe control endpoints

## WS-9 Sync and Federation

### Purpose
Preserve external consumption and local workflows.

### Deliverables
- optional local sync
- import/export compatibility
- future multi-node seams

### Exit Criteria
- remote-first product works, while local/offline workflows remain possible

## WS-10 Testing and Perfection

### Purpose
Prevent v5 from becoming another drifted partially-restored subsystem.

### Deliverables
- targeted test suites
- smoke workflows
- performance budgets
- recovery drills
- operator polish backlog
- hub-guessing regression coverage
- explicit UI/API latency budgets during active crawl and bundle generation

### Exit Criteria
- v5 can be improved safely with evidence instead of guesswork
