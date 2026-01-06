# Gazetteer Loading Lab

This lab explores gazetteer data loading, instrumentation, and observability patterns.

## Experiments

### 001 - Matcher Building Performance

Measures time to build in-memory matchers from database.

```bash
node experiments/001-matcher-performance/run.js
```

### 002 - Incremental Loading

Tests incremental loading of places with progress events.

```bash
node experiments/002-incremental-loading/run.js
```

### 003 - Query Patterns

Benchmarks different query patterns for place lookups.

```bash
node experiments/003-query-patterns/run.js
```

## Running All Experiments

```bash
node run-all.js
```
