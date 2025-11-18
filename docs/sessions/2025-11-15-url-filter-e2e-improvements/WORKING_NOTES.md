# Working Notes: URL filter e2e
- Capture reproduction context from existing test.
- Add assertions + DOM waits for toggling back off.
- Keep logging minimal to avoid noisy test runs.
- 00:55 UTC — Added toggle reset coverage to the Puppeteer test (wait for API + DOM state, verify rows restored).
- 00:57 UTC — `npm run test:by-path tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js` failed because Jest could not find `<rootDir>/tests/jest.setup.js` (module lookup issue in script runner).
