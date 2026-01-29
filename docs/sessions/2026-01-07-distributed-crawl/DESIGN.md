# Distributed Crawl (Place Hub Checks)

## Goals
- Use remote workers (e.g., OCI node 144.21.42.149) with higher bandwidth to probe place-hub URLs in parallel.
- Minimize latency for hub existence checks and return artifacts (responses + metadata) in batches to the controller.
- Keep packaging simple so a worker can be stood up via SSH with few commands.

## Constraints and Assumptions
- Nodes are disposable; we control SSH keys and can open ports 22/80/443 as needed.
- Prefer SSH/SCP for control and artifact transfer; no public HTTP endpoints required for crawl traffic.
- Node.js runtime available (22.x installed on OCI node); npm available for any worker scripts we push.
- Workload: many small HTTP GETs to candidate hub URLs; results need status code, body (optional), and timing.

## Proposed Architecture
- **Controller (local machine)**: prepares work units (host + hub path list), ships them to a worker over SSH, triggers a worker script, and pulls back a results archive.
- **Worker (remote node)**: receives a job bundle (URLs JSON + worker script), runs concurrent fetches with rate limits, writes results to NDJSON + optional bodies, tars outputs, and exposes nothing publicly.
- **Transport**: `scp` for job bundle upload and artifact download; `ssh` for execution. Optional HTTPS on 443 only for diagnostics.

## Worker Package Shape
- `worker/` (directory on remote):
  - `job.json` — list of URLs + options (concurrency, timeouts, headers, retries).
  - `fetch-worker.js` — node script that:
    - reads job.json, runs concurrent fetches (e.g., p-limit or custom semaphore),
    - records `{url,status,bytes,durationMs,redirects,error}` per URL to `results.ndjson`,
    - optionally saves bodies under `bodies/<sha1>.bin` when `saveBody=true`,
    - writes `summary.json` (counts, p50/p95 latency, failures).
  - `package.json` — minimal deps (e.g., `node-fetch` or `undici`, `p-limit`).
  - `README-remote.md` — run instructions.
- Execution command (remote):
  - `cd worker && npm install --omit=dev && node fetch-worker.js`
- Artifact bundle (remote → local):
  - `tar -czf artifacts.tar.gz results.ndjson summary.json bodies/`

## Controller Flow (one batch)
1. Build `job.json` locally from place-hub candidate list (host + path patterns).
2. Copy bundle to worker: `scp -i key -r worker opc@<ip>:/home/opc/distributed-job/`.
3. Run job: `ssh -i key opc@<ip> "cd distributed-job && npm install --omit=dev && node fetch-worker.js"`.
4. Pull artifacts: `scp -i key opc@<ip>:/home/opc/distributed-job/artifacts.tar.gz ./artifacts/<batch>.tar.gz`.
5. Post-process locally: ingest `results.ndjson` into our DB/facts pipeline.

## Hub-Check Optimizations
- **URL shaping**: pre-expand candidates per host to avoid 404 spam; include `Accept: text/html` and sane timeouts (e.g., 5s connect, 10s read).
- **Concurrency**: start with 50–100 concurrent requests on OCI A1 (ARM) node; tune based on p95 latency and drop rates.
- **Retry policy**: 1 fast retry on network errors; no retry on 4xx/5xx unless marked transient.
- **Compression**: set `Accept-Encoding: gzip,br` to reduce transfer size; record response headers.
- **Body storage**: default off; enable for a small sample or when status=200 to confirm hub content.

## Security and Operational Notes
- Stick to SSH (ingress 22) for control and artifacts; no need to expose worker HTTP.
- Use per-job working directory; clean after tarball creation to keep disk light.
- Keep secrets out of job.json; hub checks are public URLs.
- Self-signed HTTPS on 443 is optional for live checks; not required for the worker path above.

## Next Implementation Steps
- Author `worker/fetch-worker.js` and `package.json` (minimal deps) under tools/dev or session folder for promotion.
- Add a controller script (e.g., `tools/dev/distributed-crawl.js`) that prepares job.json from place-hub candidates, orchestrates SSH/SCP, and ingests results.
- Provide a sample job fixture and a dry-run mode that runs locally (no SSH) for testing.
- Add a short README in `worker/` with install/run commands and tuning knobs (concurrency, timeouts, saveBody, headers).
- Pilot run against a small host list, capture metrics in `summary.json`, and iterate concurrency/timeouts.
