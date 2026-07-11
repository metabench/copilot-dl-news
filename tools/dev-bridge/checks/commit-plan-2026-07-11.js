'use strict';

/**
 * commit-plan-2026-07-11.js — stage and commit today's work in logical
 * groups across copilot-dl-news and news-crawler-db, then report sync state.
 * Push is a separate explicit step (pass --push).
 *
 * Excluded deliberately: .claude/settings*.json (machine-local config).
 * Runtime dirs (bridge inbox/outbox/logs/state) are gitignored.
 */

const path = require('path');
const { execFileSync } = require('child_process');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const PUSH = process.argv.includes('--push');

function git(repo, args) {
  return execFileSync('git', args, {
    cwd: path.join(WORKSPACE, repo),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 10 * 60 * 1000
  });
}

const PLAN = [
  {
    repo: 'copilot-dl-news',
    commits: [
      {
        message: 'Crawler sessions WIP: hub-loop P0-P3, ops/quality tooling, session docs\n\nHub identification pipeline (hubs/hub_members model, segmentation),\nsitemap conditional-fetch cache, quality scorecard + fixture tooling,\ncampaign runner, worker-mode crawl operations, p0-p3 proof scripts,\nand session documentation 2026-07-01 through 2026-07-11.',
        add: [
          'docs/cli/crawl.md',
          'docs/sessions/',
          'docs/plans/hub-identification-top-notch-plan.md',
          'docs/prompts/',
          'src/core/crawler/ArticleProcessor.js',
          'src/core/crawler/CrawlerTelemetry.js',
          'src/core/crawler/FetchPipeline.js',
          'src/core/crawler/NewsCrawler.js',
          'src/core/crawler/QueueManager.js',
          'src/core/crawler/RobotsAndSitemapCoordinator.js',
          'src/core/crawler/RobotsCache.js',
          'src/core/crawler/UrlEligibilityService.js',
          'src/core/crawler/WorkerRunner.js',
          'src/core/crawler/sitemap.js',
          'src/core/crawler/__tests__/',
          'src/core/crawler/operations/schemas/basicArticleCrawl.schema.js',
          'src/core/crawler/hubs/',
          'src/server/crawl-api/v1/core/crawl-operation-worker.js',
          'src/ui/server/unifiedApp/server.js',
          'src/ui/electron/__tests__/',
          'src/ui/electron/unifiedApp/__tests__/',
          'tests/tools/crawl/',
          'tests/guards/',
          'tools/crawl/',
          'start-crawler-ui.cmd'
        ],
        unstage: ['tools/crawl/guess-place-hubs.js']
      },
      {
        message: 'Remote fetch mode: coordinate crawls locally, download pages on the Oracle worker\n\nFetchPipeline fetchFn seam finally wired: createRemoteFetchFn routes\nGET/HEAD through the distributed worker POST /batch (bodies inline, so\nall storage stays in the local news.db). Off by default; enable with\nCRAWL_REMOTE_FETCH=true / WORKER_URL, or remoteFetch crawler options.\nWorker address resolution via WORKER_URL -> FLEET_HOST -> localhost\nreplaces the hardcoded Oracle IP everywhere. Worker reports redirect\nlanding URLs (finalUrl). Deploy notes in deploy/remote-fetch-worker/.',
        add: [
          'src/core/crawler/adapters/remoteFetch.js',
          'src/core/crawler/adapters/__tests__/',
          'src/core/crawler/adapters/DistributedFetchAdapter.js',
          'src/core/crawler/CrawlerServiceWiring.js',
          'src/core/crawler/services/groups/ProcessingServices.js',
          'src/core/crawler/operations/GuessPlaceHubsOperation.js',
          'tools/crawl/guess-place-hubs.js',
          'wip/labs/distributed-crawl/worker-server.js',
          'deploy/remote-fetch-worker/',
          'deploy/README.md'
        ]
      },
      {
        message: 'Live crawl telemetry end-to-end: dashboard remote-fetch strip + Electron display\n\nremoteFetch telemetry rides progress events (Crawler -> bridge -> schema\n-> SSE) into a new strip on the crawl status page. Jobs API now carries\nper-job live progress (jobProgress tracker, in-process + worker modes),\nfixing the zeroed jobs table/throughput strip. Electron unified app opens\non the crawl view with multi-jobs; isolated --user-data-dir + capture\nretry fix empty smoke screenshots. Checks: crawlDisplay (server),\ncrawlDisplay.electron (real renderer, xvfb-capable), remoteFetch strip SSR.',
        add: [
          'src/core/crawler/core/Crawler.js',
          'src/core/crawler/telemetry/CrawlTelemetryBridge.js',
          'src/core/crawler/telemetry/CrawlTelemetrySchema.js',
          'src/core/crawler/telemetry/__tests__/',
          'src/ui/server/crawlStatus/CrawlStatusPage.js',
          'src/ui/server/crawlStatus/crawl-status-client.js',
          'src/ui/server/crawlStatus/checks/crawlStatusPage.remoteFetch.check.js',
          'src/server/crawl-api/v1/core/InProcessCrawlJobRegistry.js',
          'src/server/crawl-api/v1/core/jobProgress.js',
          'src/server/crawl-api/v1/core/__tests__/',
          'src/ui/server/unifiedApp/checks/crawlDisplay.check.js',
          'src/ui/electron/unifiedApp/main.js',
          'src/ui/electron/unifiedApp/checks/crawlDisplay.electron.check.js',
          'src/ui/electron/unifiedApp/checks/crawlDisplay.electron.main.js',
          'start-crawler-app.cmd'
        ]
      },
      {
        message: 'place_hubs migration 41 tooling + crawler seed fix (copilot side)\n\nCLI wrapper for the news-crawler-db host-canonicalization/dedupe\nmigration, v1 migration shim, HubSeeder now logs (not swallows) seed\nrecording failures, db-writer-check preflight tool, and storage-invariant\ndocs. Applied to the live news.db on 2026-07-11 (507 -> 431 hub rows).',
        add: [
          'src/core/crawler/planner/HubSeeder.js',
          'tools/migrations/place-hubs-host-dedupe.js',
          'src/data/db/sqlite/v1/migrations/place_hubs_host_dedupe.js',
          'tools/dev/db-writer-check.js',
          'docs/COUNTRY_HUB_DISCOVERY_STRATEGIES.md'
        ]
      },
      {
        message: 'dev-bridge v4: consolidated file-RPC bridge for agent sessions\n\nMerged tools/dev/agent-bridge into tools/dev-bridge: .cmd spawn fix\n(Node>=18 EINVAL), start-electron HTTP-readiness probe + multi-jobs\ndefault, ui-screenshot isolated profile, workspace-guarded kill-pid,\ndiagnostic checks (db-probe, git-lock-sweep, git-ops, syntax-sweep,\nzombie hunting), README with protocol + headless-sandbox Electron recipe.\nagent-bridge entry points remain as forwarding shims.',
        add: [
          'tools/dev-bridge/',
          'tools/dev/agent-bridge/',
          'start-agent-bridge.cmd',
          '.gitignore'
        ]
      }
    ]
  },
  {
    repo: 'news-crawler-db',
    commits: [
      {
        message: 'Hub-loop P0-P3: generalized hubs/graph model, sitemap cache, crash repairs\n\nhubs/hub_members n-ary model + backfill, graph access, sitemap\nconditional-fetch cache (drizzle + raw-handle accessors), download\ntooling updates. Includes repair of files truncated by the 2026-07-11\nmorning crash (schema.ts tail restored from HEAD + additions).',
        add: [
          'src/db/schema.ts',
          'src/db/sqlite/access/coverage.ts',
          'src/db/sqlite/access/graph.ts',
          'src/db/sqlite/access/sitemapCacheRaw.ts',
          'src/db/sqlite/index.ts',
          'src/db/types.ts',
          'src/db/__tests__/helper.ts',
          'src/db/__tests__/graphAccess.test.ts',
          'src/db/__tests__/unit/sqlite/legacyDownloadTooling.test.ts',
          'src/db/__tests__/unit/sqlite/sqliteNewsDatabaseCompat.test.ts',
          'src/db/sqlite/access/legacy-ArticleOperations.ts',
          'src/db/sqlite/access/legacy-StatementManager.ts',
          'src/db/sqlite/access/legacy-downloadEvidence.ts',
          'docs/decisions/',
          'docs/ACCESS_API.md',
          'docs/README.md'
        ]
      },
      {
        message: 'Migration 41: place-hubs host canonicalization + dedupe\n\ncanonicalizeHost() shared by every place-hub write path (the www/bare\nsplit put The Guardian under two hosts with ~25% duplicate country-hub\nrows). Migration normalizes hosts across place_hubs / candidates /\npage_mappings, merges duplicates (remapping hub_id refs), and installs\npartial UNIQUE indexes (url_id; host+slug+kind+topic). recordPlaceHubSeed\nfixed to write url_id (previously referenced a nonexistent url column and\nfailed silently on every crawl); phantom-column reads fixed with joins.\nApplied to the live news.db 2026-07-11: 507 -> 431 rows, verified.',
        add: [
          'src/db/sqlite/access/hostCanonicalization.ts',
          'src/db/sqlite/access/placeHubsHostDedupeMigration.ts',
          'src/db/sqlite/access/hubGapAnalysis.ts',
          'src/db/sqlite/access/legacy-guessPlaceHubsQueries.ts',
          'src/db/sqlite/access/placeHubs.ts',
          'src/db/sqlite/access/legacy-sqlite-schema-definitions.ts',
          'src/db/index.ts',
          'src/db/__tests__/unit/sqlite/hubGapAnalysis.test.ts',
          'src/db/__tests__/unit/sqlite/placeHubs.test.ts',
          'src/db/__tests__/unit/sqlite/hostCanonicalization.test.ts',
          'src/db/__tests__/unit/sqlite/placeHubsHostDedupeMigration.test.ts',
          'docs/DATABASE_SCHEMA.md'
        ]
      }
    ]
  }
];

for (const { repo, commits } of PLAN) {
  console.log(`\n===== ${repo} =====`);
  console.log(git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).trim() + ' @ ' + git(repo, ['rev-parse', '--short', 'HEAD']).trim());
  for (const c of commits) {
    const title = c.message.split('\n')[0];
    try {
      git(repo, ['add', '--', ...c.add]);
      if (c.unstage) git(repo, ['restore', '--staged', '--', ...c.unstage]);
      const staged = git(repo, ['diff', '--cached', '--stat']).trim().split('\n').pop();
      if (!staged || staged.includes('(no output)')) {
        console.log(`SKIP (nothing staged): ${title}`);
        continue;
      }
      git(repo, ['commit', '-m', c.message]);
      console.log(`COMMIT ${git(repo, ['rev-parse', '--short', 'HEAD']).trim()}: ${title} — ${staged}`);
    } catch (err) {
      console.log(`FAILED at "${title}": ${(err.stderr || err.stdout || err.message).toString().slice(0, 500)}`);
      process.exit(1);
    }
  }
  if (PUSH) {
    try {
      const out = git(repo, ['push']);
      console.log(`PUSH ok: ${out.trim() || '(quiet)'}`);
    } catch (err) {
      console.log(`PUSH FAILED: ${(err.stderr || err.stdout || err.message).toString().slice(0, 500)}`);
      process.exit(1);
    }
  }
  console.log(git(repo, ['status', '-sb']).split('\n')[0]);
}
console.log('\nplan complete');
