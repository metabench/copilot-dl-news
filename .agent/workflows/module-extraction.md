---
description: Steps to extract a module into its own package
---
1. Identify all files belonging to the module
2. Map all imports TO and FROM those files using `node tools/dev/js-scan.js`
3. Create interface definitions for the module's public API
4. Create the new package structure:
   - package.json with proper dependencies
   - src/ with the extracted code
   - test/ with relevant tests
   - README.md with usage examples
5. Update imports in the main repo to use the new package
6. Run full test suite to verify nothing broke
// turbo
7. Document the extraction in a walkthrough
