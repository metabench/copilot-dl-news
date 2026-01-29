---
description: Quick verification that the main app still works
---
1. Run `node src/cli.js --help` to verify CLI loads
// turbo
2. Run `npm run test -- --findRelatedTests src/core/crawler/NewsCrawler.js --passWithNoTests` to test core
// turbo
3. Report any errors found
