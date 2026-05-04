# Lab Experiment Execution Prompt

## Context

You are the **🌍 Place Disambiguation Singularity 🌍** agent. A previous session has set up a benchmark lab at `labs/db-access-patterns/` with experiments ready for execution.

## Your Task

Execute the experiments defined in `labs/db-access-patterns/EXPERIMENTS.md` in the specified order:

1. **Experiment 1**: Candidate vs Filter benchmark
2. **Experiment 2**: Content Decompression benchmark
3. **Experiment 4**: Title Boost Quality benchmark (do before #3)
4. **Experiment 3**: Body Text Backfill test (DRY RUN only, no `--fix`)

## Instructions

For each experiment:

1. **Read the full experiment spec** from `EXPERIMENTS.md`
2. **Create the benchmark file** in `labs/db-access-patterns/benchmarks/`
3. **Run the benchmark** and verify it completes without errors
4. **Save results** to `labs/db-access-patterns/results/<name>-YYYY-MM-DD.json`
5. **Document key findings** - append to `FINDINGS.md` under a new dated section

## Key Resources

- **Fixture**: `labs/db-access-patterns/fixtures/urls-with-content-2000.json` (2000 URLs)
- **Template**: Use existing `url-place-detection.bench.js` as reference for structure
- **DB path**: `data/news.db` (readonly mode recommended)
- **Compression**: `src/utils/compression.js` has `decompress(blob, algorithm)`
- **Text extraction**: `src/utils/HtmlArticleExtractor.js`

## Constraints

- DO NOT modify production code in `src/` except temporarily exporting functions if needed for Experiment 1
- DO NOT run body text backfill with `--fix` flag (dry run only)
- Use `--json` flag to verify JSON output works for each benchmark
- Close DB connections in `finally` blocks

## Expected Outputs

After completion, these files should exist:
```
labs/db-access-patterns/
├── benchmarks/
│   ├── candidate-vs-filter.bench.js
│   ├── content-decompression.bench.js
│   ├── title-boost-quality.bench.js
│   └── body-text-backfill.bench.js
├── results/
│   ├── candidate-vs-filter-2026-01-04.json
│   ├── content-decompression-2026-01-04.json
│   ├── title-boost-quality-2026-01-04.json
│   └── body-text-backfill-2026-01-04.json
└── FINDINGS.md (updated with new sections)
```

## Quality Checklist

For each benchmark verify:
- [ ] Runs without errors
- [ ] Produces meaningful metrics
- [ ] JSON output is valid (`--json` flag)
- [ ] Results file is saved
- [ ] DB connection is closed properly

Start by reading `labs/db-access-patterns/EXPERIMENTS.md` in full, then proceed with Experiment 1.
