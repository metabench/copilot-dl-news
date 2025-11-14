# Follow Ups – Binding Plugin Session

- [ ] Spot-check other controls/services using `ensureBindingViewModel` to confirm they rely on the upgraded Data_Object models (add regression tests where coverage is thin).
- [ ] Consider extending `binding-plugin.test.js` with SSR HTML assertions so attribute regressions get caught without running the pager snapshot helper.
