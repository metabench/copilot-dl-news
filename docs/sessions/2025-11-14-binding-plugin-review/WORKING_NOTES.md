# Working Notes

## 2025-11-14
- Captured Puppeteer error showing `Data_Model_View_Model_Control` accessed `data_model.on` without guarding missing models pulled from `context.map_controls`.
- Reviewed `src/ui/jsgui/bindingPlugin.js` to understand binding defaults; plugin already ensures models exist on controls but legacy server-rendered DOM paths still rely on context lookups.
- Located the offending code in `vendor/jsgui3-client/node_modules/jsgui3-html/html-core/Data_Model_View_Model_Control.js` where `data_model.on("change")` executed even when no matching control existed.
- Added a presence check so change listeners register only when `data_model` is resolved, preventing undefined `.on` calls during activation.
- Rebuilt the bundle via `npm run ui:client-build` and re-ran `node scripts/ui/puppeteer-console.js`; no TypeErrors surfaced (only expected `favicon.ico` 404 and legacy `&&& no corresponding control` logs remain).
- Investigated the noisy `&&& no corresponding control` logs: they originate in `html-core/control-enh.js` when `pre_activate_content_controls` encounters DOM text nodes without matching `Text_Node` controls (e.g., whitespace introduced by server rendering). Removed the diagnostic `console.log` along with the unused "adding Text_Node control" log to keep console output clean.
- Dropped the `console.log('Data_Model_View_Model_Control pre_activate complete')` line in `html-core/Data_Model_View_Model_Control.js`; the message added no signal and removing it only requires editing the vendored copy inside this repo (no external upstream change yet).
- After rebuilding the UI bundle and re-running `scripts/ui/puppeteer-console.js`, the only remaining logs are the expected activation traces (`jsgui html-core pre_activate/activate`, missing control type fallbacks) plus the favicon 404.
