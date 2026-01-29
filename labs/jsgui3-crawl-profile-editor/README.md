# jsgui3 Crawl Profile Editor Lab

**Lab Type**: Implementation experiment  
**Created**: 2026-01-07  
**Session**: [docs/sessions/2026-01-07-jsgui3-crawl-profile-editor/](../../docs/sessions/2026-01-07-jsgui3-crawl-profile-editor/)

## Objective

Port the Crawl Profile Editor to use the full jsgui3 stack:
- `jsgui3-server` for serving with automatic CSS extraction
- `jsgui3-client` for client-side activation and interactivity
- `Active_HTML_Document` as the base class
- SASS/CSS co-located with controls
- Data model bindings for form state

## Why This Matters

Current implementation issues:
1. Manual CSS injection via `_composeStyles()` method
2. No automatic client-side activation
3. "Show Advanced Options" toggle doesn't work (no JS)
4. Not using jsgui3's built-in form controls

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    jsgui3-server                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Server.serve({                                                     │
│    page: { content: CrawlProfileEditorApp },                       │
│    api: { profiles: profilesAPI }                                   │
│  })                                                                 │
│                                                                     │
│  Automatic:                                                         │
│  - CSS extraction from Control.css / Control.scss                  │
│  - JS bundling for client activation                                │
│  - SSR with hydration                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Patterns to Apply

### From jsgui3-server/docs/jsgui3-sass-patterns-book:

1. **Control-local styles** (Chapter 3)
   ```javascript
   class Profile_Editor extends Control {
     // ...
   }
   Profile_Editor.scss = `
   .profile-editor {
     display: flex;
     // ...
   }
   `;
   ```

2. **Activate pattern** for client interactivity
   ```javascript
   activate() {
     if (!this.__active) {
       super.activate();
       // Bind event listeners here
       this.advancedToggle.on('click', () => this.toggleAdvanced());
     }
   }
   ```

3. **Data model bindings** for form state
   ```javascript
   this.computed(view_model, ['operationName'], (name) => {
     return this.operations.find(op => op.name === name);
   }, { propertyName: 'selectedOperation' });
   ```

## Running the Lab

```powershell
# Start the lab server
node labs/jsgui3-crawl-profile-editor/server.js

# Open in browser
# http://localhost:3105
```

## Files

| File | Purpose |
|------|---------|
| `client.js` | Client controls with CSS, activate(), data bindings |
| `server.js` | jsgui3-server setup with pages and API |
| `README.md` | This file |
| `FINDINGS.md` | Discoveries and learnings |

## Success Criteria

1. ✅ CSS automatically extracted and bundled
2. ✅ "Show Advanced Options" toggle works
3. ✅ Form fields update data model
4. ✅ Save button submits via API
5. ✅ No manual CSS injection in server routes
6. ✅ Client-side validation feedback

## Integration Path

After validating patterns in this lab:
1. Port controls to `src/ui/controls/crawl/`
2. Create client entry point at `src/ui/client/crawlStrategies.js`
3. Update server to use jsgui3-server or integrate with unified app
