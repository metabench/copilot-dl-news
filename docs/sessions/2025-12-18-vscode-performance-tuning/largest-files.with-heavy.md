# Largest files report (includes heavy dirs)

Repo root: C:/Users/james/Documents/repos/copilot-dl-news
Scan time: 7.6s

## Top 40 largest files

| Rank | Size | Top folder | Path |
|---:|---:|---|---|
| 1 | 5.02 GB | migration-export | migration-export/content_storage.ndjson |
| 2 | 5.02 GB | data | data/backups/content_storage.ndjson |
| 3 | 5.01 GB | data | data/news.db |
| 4 | 4.60 GB | data | data/perf-snapshots/baseline/news.db |
| 5 | 4.60 GB | migration-temp | migration-temp/db-view-test.db |
| 6 | 4.60 GB | data | data/backups/news-20251114-035031.db |
| 7 | 4.60 GB | data | data/backups/news-20251114-034257.db |
| 8 | 4.30 GB | data | data/backups/news-backup-2025-11-03-201130.db |
| 9 | 2.65 GB | data | data/backups/news-backup-2025-10-20-010838.db |
| 10 | 1.72 GB | migration-export | migration-export/content_analysis.ndjson |
| 11 | 1.72 GB | data | data/backups/content_analysis.ndjson |
| 12 | 780.7 MB | migration-export | migration-export/links.ndjson |
| 13 | 780.7 MB | data | data/backups/links.ndjson |
| 14 | 406.2 MB | migration-export | migration-export/queue_events.ndjson |
| 15 | 406.2 MB | data | data/backups/queue_events.ndjson |
| 16 | 172.6 MB | migration-export | migration-export/urls.ndjson |
| 17 | 172.6 MB | data | data/backups/urls.ndjson |
| 18 | 168.6 MB | z-server | z-server/node_modules/electron/dist/electron.exe |
| 19 | 168.6 MB | tools | tools/ui/quick-picker/node_modules/electron/dist/electron.exe |
| 20 | 168.6 MB | crawl-widget | crawl-widget/node_modules/electron/dist/electron.exe |
| 21 | 129.1 MB | migration-export | migration-export/place_names.ndjson |
| 22 | 129.0 MB | data | data/backups/place_names.ndjson |
| 23 | 105.3 MB | gazetteer-backup | gazetteer-backup/place_names.ndjson |
| 24 | 52.7 MB | migration-export | migration-export/place_attribute_values.ndjson |
| 25 | 52.7 MB | data | data/backups/place_attribute_values.ndjson |
| 26 | 39.4 MB | gazetteer-backup | gazetteer-backup/place_attribute_values.ndjson |
| 27 | 35.9 MB | node_modules | node_modules/@swc/core-win32-x64-msvc/swc.win32-x64-msvc.node |
| 28 | 27.5 MB | src | src/data/news.db |
| 29 | 25.0 MB | full-analysis-complete.log | full-analysis-complete.log |
| 30 | 22.5 MB | migration-export | migration-export/http_responses.ndjson |
| 31 | 22.5 MB | data | data/backups/http_responses.ndjson |
| 32 | 18.2 MB | node_modules | node_modules/@img/sharp-win32-x64/lib/libvips-42.dll |
| 33 | 13.2 MB | crawl-widget | crawl-widget/node_modules/better-sqlite3/build/Release/better_sqlite3.iobj |
| 34 | 10.8 MB | node_modules | node_modules/@esbuild/win32-x64/esbuild.exe |
| 35 | 10.8 MB | crawl-widget | crawl-widget/node_modules/@esbuild/win32-x64/esbuild.exe |
| 36 | 10.8 MB | z-server | z-server/node_modules/@esbuild/win32-x64/esbuild.exe |
| 37 | 10.2 MB | z-server | z-server/node_modules/electron/dist/icudtl.dat |
| 38 | 10.2 MB | tools | tools/ui/quick-picker/node_modules/electron/dist/icudtl.dat |
| 39 | 10.2 MB | crawl-widget | crawl-widget/node_modules/electron/dist/icudtl.dat |
| 40 | 9.8 MB | crawl-widget | crawl-widget/node_modules/better-sqlite3/build/Release/better_sqlite3.pdb |

## Biggest contributors by top-level folder (sum of top 300 files)

| Folder | Size |
|---|---:|
| data | 34.07 GB |
| migration-export | 8.30 GB |
| migration-temp | 4.60 GB |
| crawl-widget | 321.4 MB |
| z-server | 257.0 MB |
| tools | 249.3 MB |
| gazetteer-backup | 158.9 MB |
| node_modules | 113.7 MB |
| src | 81.1 MB |
| full-analysis-complete.log | 25.0 MB |
| tmp | 16.4 MB |
| public | 10.1 MB |

## Notes

- This report is intended to answer: what specific *files* are biggest, and which folders they cluster in.
- Run with `--include-heavy` to include `node_modules/`, `data/`, `screenshots/`, etc (slow but useful for disk cleanup decisions).