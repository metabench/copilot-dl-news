# Follow Ups – Single UI app cohesion  next steps

- Expand `--check` coverage to additional UI servers over time (keep checks deterministic and fast).
- Where embedding is desired but messy, extract router-factory seams (`create<Feature>Router(...) -> { router, close }`) while keeping standalone servers unchanged.

- Next likely slice: take one of the current “placeholder” unified sub-apps (Decision Tree / Template Teacher) and either:
	- mount its server under a stable prefix, then embed via `<iframe src="/<prefix>">`, or
	- if it’s already a server, add `--check` + a deterministic `checks/*.check.js` script and wire it into unified.
