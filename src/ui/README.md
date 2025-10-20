# UI v2 - New Data-Focused Interface

**Status**: Planned - Not yet implemented

## Overview

The new UI (v2) will be a much simpler, data-focused interface compared to the deprecated UI in `src/deprecated-ui/`. The focus will be on rendering focused views of data from the database rather than complex interactive features.

## Goals

- **Simplicity**: Minimal, clean interface focused on data presentation
- **Performance**: Fast rendering of database queries and results
- **Data-Centric**: Primary purpose is viewing and exploring crawled data
- **Maintainable**: Much simpler codebase than the current deprecated UI

## Planned Structure

```
src/ui/
├── README.md              # This file
├── server.js              # Simple Express server for data views
├── routes/
│   ├── data.js           # API routes for database queries
│   └── views.js          # Routes for HTML views
├── views/
│   ├── layout.html       # Simple HTML layout
│   ├── articles.html     # Article listing/search
│   ├── crawls.html       # Crawl status and results
│   └── analysis.html     # Analysis results
├── public/
│   ├── styles.css        # Minimal CSS
│   └── app.js            # Simple client-side JavaScript
└── db/
    └── queries.js        # Database query helpers
```

## Key Differences from Deprecated UI

| Aspect | Deprecated UI (v1) | New UI (v2) |
|--------|-------------------|-------------|
| Complexity | Complex Express app with many routes | Simple server with few routes |
| Features | Interactive crawling, real-time updates | Static data views, basic search |
| Dependencies | Many UI libraries, complex build process | Minimal dependencies, simple build |
| Testing | Extensive E2E and integration tests | Basic integration tests only |
| Maintenance | High maintenance burden | Low maintenance |

## Development Status

- [ ] Plan detailed requirements
- [ ] Design database query APIs
- [ ] Implement basic server structure
- [ ] Create simple HTML views
- [ ] Add basic CSS styling
- [ ] Implement search/filtering
- [ ] Add pagination for large datasets
- [ ] Write basic tests
- [ ] Documentation

## Getting Started

When ready to implement:

1. Review the deprecated UI in `src/deprecated-ui/` for reference
2. Start with simple database query endpoints
3. Build HTML views that render data from those endpoints
4. Keep the implementation minimal and focused

## Migration Notes

The deprecated UI in `src/deprecated-ui/` contains many features that will NOT be carried forward:

- Real-time crawl monitoring
- Interactive crawl controls
- Complex state management
- Advanced UI components
- Puppeteer-based testing

The new UI will focus solely on viewing and exploring the data that has been collected.