# SVG Tooling Improvements Session

## Objective
Improve existing SVG CLI tools (`svg-collisions.js`, `svg-validate.js`) and then apply them to improve the `decision-tree-engine-deep-dive.svg`.

## Done When
- [ ] `svg-validate.js` enhanced with structural checks (well-formedness, attribute validation)
- [ ] `svg-collisions.js` has better overlap categorization and fix suggestions
- [ ] Both tools run successfully on decision-tree-engine-deep-dive.svg
- [ ] Any identified issues in the SVG are fixed

## Current State Analysis

### svg-collisions.js
**Strengths:**
- Uses Puppeteer for accurate bounding boxes with transform handling
- Smart collision classification (text-overlap, shape-overlap, text-clipped)
- Filters out intentional overlaps (text in containers, connectors near text)
- Severity levels (high/medium/low)
- JSON output mode for agent integration

**Opportunities:**
- Add `--fix-suggestions` flag with specific coordinate adjustments
- Add `--categories` flag to filter by overlap type
- Add quick text-only analysis (no browser needed)

### svg-validate.js
**Strengths:**
- Basic ampersand escaping check
- Duplicate ID detection

**Opportunities:**
- Add XML well-formedness validation using xmldom
- Add viewBox/dimensions validation
- Add text bounding box estimation (for quick overlap detection)
- Add font/style attribute validation
- Add `--json` output mode

## Change Set
- `tools/dev/svg-validate.js` - Enhance with more validations
- `tools/dev/svg-collisions.js` - Minor improvements
- `docs/diagrams/decision-tree-engine-deep-dive.svg` - Fix issues found

## Risks/Assumptions
- xmldom already in dependencies (used elsewhere in project)
- Puppeteer available for collision detection

## Tests
- Run improved tools on multiple SVGs in docs/diagrams/
- Verify JSON output parses correctly

## Docs to Update
- `docs/INDEX.md` if new doc created
- `tools/dev/README.md` if CLI signature changes
