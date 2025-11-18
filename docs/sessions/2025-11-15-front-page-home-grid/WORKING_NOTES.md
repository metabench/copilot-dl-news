# Working Notes — 2025-11-15 Front Page Home Grid

## Tooling + Commands
- `node tools/dev/js-edit.js --locate buildCss --json` to capture guard metadata before replacing the CSS block.
- `node tools/dev/js-edit.js --replace buildCss --with tmp/buildCss.new.js --json` followed by `--fix` to ship the refreshed styles (new `.home-grid` / `.home-card` selectors).
- Used `Remove-Item tmp\buildCss.new.js` after the guarded swap to keep `tmp/` tidy.

## Decisions
- Added dedicated `createHomeCard`/`createHomeGrid` helpers so the server can pass structured card data without duplicating markup.
- `buildHomeCards` reuses existing domain/crawl/error queries with conservative limits; failures fall back to the URLs card so the landing page always renders.
- Cards highlight metric freshness (cached vs live) to keep the dashboard honest without adding another legend.

## Next Steps
- Manually load `/urls` once the express server restarts to verify the cards + counts.
- Consider adding lightweight tests or checks for `createHomeGrid` output if we expand the component further.
