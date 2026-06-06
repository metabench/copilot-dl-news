---
type: sample
id: graph-feedback-profile-workflow-sample
status: active
audience: crawler-operators, agents
tags:
  - crawling
  - graph-feedback
  - sample
last-reviewed: 2026-05-27
---

# Graph Feedback Profile Workflow Sample

This is a compact, bounded example of the human-facing shape from:

```bash
node tools/crawl/graph-feedback.js --profile-workflow --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-simple-distributed-smoke.json --workflow-format markdown
```

The real command may show byte size, artifact age, and caveats specific to the
artifact supplied. This sample intentionally omits candidate URLs.

```text
# Graph Feedback Profile Workflow Checklist

Profile: `simple-distributed-smoke`
Readiness: ready-for-preview
Planned hosts: `bbc.com`
Candidate count for matched hosts: 1
Artifact path: `tmp/graph-feedback-simple-distributed-smoke.json`

Action policy: no URLs are enqueued, no remote crawlers are seeded, and collect behavior is unchanged.

## Artifact Evidence

- Hosts: `bbc.com`
- Candidate count: 1
- Size: 600 bytes
- generatedAt valid: yes
- Age: 12.0h

## Host Match

- Status: ok
- Matched hosts: `bbc.com`
- Missing hosts: (none)
- Extra artifact hosts: (none)

## Checklist

1. Inspect exact profile hosts
2. Generate a bounded exact-host artifact
3. Compare artifact hosts to profile hosts
4. Strictly validate the artifact for this profile
5. Print a human preflight summary
6. Write a compact operator report
7. Preview the canonical profile dry-run

## Caveats

- Stale artifacts are warnings in read-only preview/report modes; hard freshness rejection is reserved for future explicit live seeding.
```

For the full workflow and live-seeding boundary, use
`docs/workflows/graph-feedback-artifact-planning.md`.
