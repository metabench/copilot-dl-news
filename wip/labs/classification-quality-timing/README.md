# Classification Quality vs Timing (Lab)

This lab measures the runtime cost of URL/content classification stages and compares their outputs against existing labels in the database.

## Benchmarks

- `benchmarks/url-vs-analysis-signals.bench.js`
  - Compares Stage 1 URL-only classification vs Stage 2 signal-based classification (from `content_analysis` metrics) vs StageAggregator.
  - Uses `content_analysis.classification` as a reference label (optionally filtered by `confidence_score`).

## Usage

```powershell
node labs/classification-quality-timing/benchmarks/url-vs-analysis-signals.bench.js --help
node labs/classification-quality-timing/benchmarks/url-vs-analysis-signals.bench.js --limit 2000
node labs/classification-quality-timing/benchmarks/url-vs-analysis-signals.bench.js --url-limit 100000
```

Results are written to `labs/classification-quality-timing/results/`.
