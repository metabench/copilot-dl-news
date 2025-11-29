# Plan – Fix gazetteer context menu events

## Objective
Make importer context menu usable with jsgui events

## Done When
- [ ] Gazetteer database context menu opens on right-click and closes via outside click/Escape using jsgui control events.
- [ ] Database selector DOM is discoverable by the client script and interactions work again.
- [ ] Geo-import client bundle updated to include the new behavior (rebuilt asset).
- [ ] Notes/tests captured in `WORKING_NOTES.md`; follow-ups (if any) in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/ui/controls/DatabaseSelector.js` (ensure correct class marker + jsgui event wiring).
- `src/ui/client/geoImport/index.js` (hydrate database selector, wire context menu with jsgui body control).
- `public/assets/geo-import.js` (rebuilt bundle).
- Session docs in this folder (notes/summary/follow-ups).

## Risks & Mitigations
- jsgui client context may not be available in geo-import bundle → import `jsgui3-client` directly and guard for fallback.
- Event wiring could conflict with existing handlers → isolate to database selector elements and clean up listeners.
- Bundle drift → rebuild `geo-import.js` after code changes.

## Tests / Validation
- Manual: right-click a non-new database row shows context menu; clicking outside or pressing Escape hides it.
- Manual: verify selector buttons still respond (quick actions, selection) after class fix.
- Build: `node scripts/build-geo-import-client.js` to refresh bundled asset.
