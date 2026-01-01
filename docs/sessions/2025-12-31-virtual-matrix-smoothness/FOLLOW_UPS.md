# Follow Ups – Virtual Matrix Smoothness

- Add an npm script for the new lab check:
	- `lab:046` → `node src/ui/lab/experiments/046-virtual-matrix-control-smoothness/check.js`
- ✅ Wired into lab discovery:
	- Added to `src/ui/lab/manifest.json`
	- Added to `src/ui/lab/README.md`
- ✅ Added to default lab batch:
	- `npm run lab:check` now includes 046
- Optional: extend Place Hub Guessing Puppeteer check to assert `renderSeq` stability on tiny scrolls (mirrors Lab 046 invariant, catches regressions closer to production).
- Investigate why `git status -sb` is reporting many core files as untracked (may indicate repo checkout/index issue in this environment).
