# Validation

- `node --check src/ui/server/crawlObserver/server.js`
- `node src/ui/server/crawlObserver/checks/crawlObserver.smoke.check.js`

Output:

```
[crawlObserver.smoke] OK
{
	taskId: 'mini-crawl-2025-12-25T01-32-14',
	totalEvents: 2,
	maxSeq: 2,
	eventsReturned: 2
}
```

Re-run (confirm after final wiring):

```
[crawlObserver.smoke] OK
{
  taskId: 'mini-crawl-2025-12-25T01-32-14',
  totalEvents: 2,
  maxSeq: 2,
  eventsReturned: 2
}
```
# Working Notes – Crawl Observer: SQL to DB layer + extract controls

- 2025-12-31 — Session created via CLI. Add incremental notes here.
