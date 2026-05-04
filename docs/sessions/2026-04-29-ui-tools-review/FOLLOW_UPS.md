# Follow Ups: UI Tools Review

- Replace remaining raw embedded panel markup in the unified app registry with reusable jsgui3 controls when those panels need functional changes.
- Add a fuller Domain Registry control/router pass if domain enablement becomes editable from the UI; the restored router is intentionally minimal and read-oriented.
- Plan a cleanup pass for existing jsgui3 deprecation warnings: `FormField` -> `Form_Field` and `PropertyEditor` -> `Property_Editor`.
- Consider a shared check-mode route helper for unified app checks so future lightweight server contracts do not drift from production shell routes.