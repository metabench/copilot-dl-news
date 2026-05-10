# Decisions: Electron Cloud Crawl 10x1000

## Use Remote/Cloud Crawler For 10x1000

Context: The in-process Electron/unified-server path accepted the 10 jobs but starved the UI/API under 10 x 1000 load.

Options:
- Keep the crawl in-process and tune the job registry later.
- Move the heavy crawl to the remote/cloud crawler and keep Electron as the operator display.

Decision: Use the remote/cloud crawler for the 10x1000 run and show it through Electron Cloud Crawl.

Consequences:
- The UI stays responsive while the crawl runs on the VM.
- In-process batch launch remains useful for smaller local tests but is not the production path for this scale.

## Metadata-First Five-Second Sync

Context: Full-content export batches blocked for 19-42 seconds and sometimes timed out, which violated the request for almost immediate downloads.

Options:
- Pull full content every five seconds.
- Pull metadata (`urls` and `http_responses`) every five seconds and leave full content for a slower catch-up lane.
- Increase polling interval to match heavy payload cost.

Decision: Use metadata-first batches every five seconds with `limit=250`, `includeContent=false`, `includeLinks=false`, and no empty-round backoff.

Consequences:
- Cloud Crawl and Downloads counters update promptly from local DB rows.
- Full content parity is deferred to a separate heavier sync/backfill path.
- Deployed export benchmark confirmed the fast path at 151ms for a 250-row historical batch.

Superseded for destructive cleanup: metadata-first sync remains useful for operator visibility, but it must not be paired with remote pruning because content/link payloads are not locally confirmed.

## Exact-ID Confirmed Remote Prune

Context: The crawler node has high bandwidth but limited storage. Payload data should move into local `data/news.db` and then be removed remotely, but active crawl URL state must not be destroyed.

Options:
- Prune by watermark after each ingest.
- Prune by exact exported URL IDs after local confirmation.
- Keep metadata sync only and never prune during active crawls.

Decision: Use full payload sync with local verification and exact exported URL ID pruning. Retain remote URL state rows by default; `--prune-delete-urls` is reserved for explicit completed/manual maintenance runs.

Consequences:
- Automated pruning now removes only the batch that was actually exported and confirmed locally.
- Metadata-only sync cannot use `--prune-after-ingest`.
- The remote DB sheds response/content/link payloads without deleting the active crawl frontier.

## Restart-Safe Remote 10x1000 Config

Context: The remote API server had restarted under `crawl-domains.simple.json`, reducing health to one configured domain even while PM2 workers existed.

Options:
- Keep runtime registration only.
- Add a durable 10-domain config and restart the API server with that config.

Decision: Add `crawl-domains.news-10x1000.json` with `autoStart=false`, deploy it, and restart only `crawl-server-v4` under that config.

Consequences:
- Remote health recovers 10 configured domains after API server restarts.
- PM2 crawl workers remain online because the API config does not auto-start and does not delete workers during server boot.
