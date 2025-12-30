# Follow Ups – Tech Dashboard UIs

## High Priority

- [ ] **Add dashboards to central launcher** – Update admin dashboard or create unified tech ops index
- [ ] **Client-side activation** – Enable real-time updates for rate limit resets and plugin state changes
- [ ] **Add to package.json scripts** – `"ui:rate-limit": "node src/ui/server/rateLimitDashboard/server.js"` etc.

## Medium Priority

- [ ] **Webhook test functionality** – Implement actual POST to test webhook URLs
- [ ] **Plugin dependency tracking** – Show which plugins depend on others
- [ ] **Rate limit history chart** – Time-series visualization of throttle events

## Low Priority (Future)

- [ ] **Caching service** – Create central cache abstraction if caching UI needed
- [ ] **Dark mode toggle** – WLILO theme already dark, but toggle for light mode
- [ ] **Export/Import config** – Allow exporting webhook/plugin configs as JSON

## Notes

Subscription/billing UI was explicitly deprioritized per user request (confidentiality)._
