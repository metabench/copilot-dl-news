# Follow Ups – Data Explorer WLILO Theme + Shared Controls

- Extract shared “app header / action bar” control (Data Explorer has repeated header/action patterns that other servers could reuse).
- Extract shared pagination summary + controls (currently app-specific; good cross-app candidate).
- Add/extend a screenshot capture workflow for Data Explorer routes to validate WLILO contrast + spacing (quick visual regression check).
- Audit other UI pages for any remaining inline styling that blocks themeability; convert to token-driven classes.
