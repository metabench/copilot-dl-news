# Follow Ups – Geo Import Plan Preview: Wikidata + OSM

- Consider adding a “Use DB-selected source” affordance (click a SourceCard to set plan picker).
- Improve Wikidata plan estimates by detecting cached SPARQL discovery results in the HTTP cache (still no network).
- Expose tunables in plan preview (freshness window, OSM batch size) and mirror the runtime defaults used by ingestors.
- Add a small server-side check script under `src/ui/server/geoImport/checks/` to snapshot plan preview HTML rendering.
