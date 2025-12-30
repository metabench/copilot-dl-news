# Follow Ups – Single UI app cohesion  next steps

- Add a cheap invariant check for unified shell API output (`GET /api/apps`) either as:
	- a small check script, or
	- an extension to `tests/ui/unifiedApp.registry.test.js` validating response schema.
- Expand `--check` coverage to additional UI servers over time (keep checks deterministic and fast).
- Where embedding is desired but messy, extract router-factory seams (`create<Feature>Router(...) -> { router, close }`) while keeping standalone servers unchanged.
