# Follow Ups – 2025-11-14 jsgui transform fix

- When bumping `jsgui3-client` or `jsgui3-gfx-core`, ensure the helper declaration patch is carried forward or upstreamed so future vendor refreshes do not reintroduce the ReferenceError.
- Keep an eye on bundler warnings from `htmlparser`; if the package is updated or replaced, reapply the `globalThis` guard so `Tautologistics` remains defined in browsers.
- Investigate the `Data_Model_View_Model_Control` TypeError surfaced after fixing the globals—likely missing context data/model wiring once activation proceeds.
