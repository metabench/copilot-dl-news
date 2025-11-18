# Follow Ups: Crawl Output Refresh

## 🔍 Monitoring

- [ ] **Verify PAGE telemetry**: Check that `PAGE` events in production logs accurately reflect download times and cache hits.
- [ ] **Watch for swallowed logs**: Ensure the `progressAdapter` interception isn't accidentally suppressing critical errors or warnings that don't match the `PAGE` or `CACHE` prefixes.

## 🛠️ Potential Improvements

- [ ] **Rich PAGE metadata**: Add content size (bytes) and link count to the `PAGE` event payload for better visibility into crawl yield.
- [ ] **Structured JSON Output**: Consider a `--json` flag for the CLI that emits *only* JSON-formatted `PAGE` and `TELEMETRY` events for easier machine parsing.
- [ ] **Hub Freshness Config**: Expose `maxAgeHubMs` in the `crawl-runner.json` config schema explicitly, rather than just relying on CLI defaults.

## 🐛 Known Issues

- None at this time.
