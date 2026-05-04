# Follow Ups: Electron jsgui3 Crawl Display

- Consider adding baseline image comparison for `screenshots/unified-crawl-display/*.png` once the crawl UI settles further.
- Electron `capturePage()` produced zero-byte PNGs in this environment; keep using Puppeteer for deterministic screenshot artifacts unless the Electron capture behavior is fixed separately.
- Longer-term UI polish: replace the Crawl Status iframe embedding with a first-class unified-shell jsgui3 panel when the underlying status UI is next refactored.