---
name: svg-collisions
description: Create or repair SVG diagrams without overlapping text/shapes. Use when shipping new SVGs, editing WLILO-styled diagrams, or when collision checks report overlaps/clipping.
---

# SVG Collisions (Repair + Validation)

## Triggers

- "svg", "overlap", "collisions", "diagrams", "WLILO", "layout repair"

## Scope

- Detect overlaps/collisions in SVGs
- Apply safe layout fixes (move label backgrounds, adjust spacing)
- Re-run validation until clean

## Inputs

- SVG filepath
- Desired strictness (`--strict` vs normal)
- Whether collisions are *real* (text-on-rect label patterns are often intentional)

## Procedure

1. Run collision detection.
2. Inspect reported collisions by severity.
3. Fix only true problems (especially text-over-text).
4. Re-run strict mode before shipping.

## Validation

Run:

- `node tools/dev/svg-collisions.js <file> --strict`

## Anti-Patterns to Avoid

- **Ignoring Strict Mode**: Shipping an SVG that passes default validation but fails strict mode without explicit confirmation that the overlaps are intentional.
- **Manual Nudging Sandbox**: Spending hours manually guessing `<g transform="translate(...)">` values instead of generating a clean layout via templates or collision scripts.

## Escalation / Research request

Ask for dedicated research if:

- strict mode repeatedly reports false positives tied to viewBox scaling
- you need a new reusable theme/layout template under `data/svg-templates/` or `tools/dev/svg-templates/`

## References

- Tool doc: `tools/dev/README.md` (svg-collisions section)
- SVG methodology: `docs/guides/SVG_CREATION_METHODOLOGY.md`
