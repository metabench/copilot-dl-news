# Follow-ups: Structure Mining Implementation

## Immediate Next Steps
- [ ] **Run Full Mine**: Execute `node tools/structure-miner.js --limit 10000` (or more) to build a comprehensive map of layouts in the current database.
- [ ] **Analyze Results**: Use `sqlite3` to query `layout_signatures` and identify the most common templates.
- [ ] **Teacher Integration**: Update the "Teacher" crawler component to:
    - Compute `SkeletonHash` for incoming pages.
    - Check `layout_signatures` for known templates.
    - Skip or prioritize based on template frequency (e.g., "we have 1000 of these, skip" or "new template, prioritize").

## Future Improvements
- [ ] **Substructure Diffing**: Implement the "Level 3" analysis to compare *parts* of the tree when the global structure matches but content differs significantly.
- [ ] **Visual Debugger**: Create a jsgui3 control to visualize the `SkeletonHash` tree side-by-side with the rendered page.
- [ ] **Performance Optimization**: If hashing becomes a bottleneck during high-speed crawls, consider moving the core logic to a native module or optimizing the Cheerio traversal.

