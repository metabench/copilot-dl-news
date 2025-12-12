# Follow Ups – Art Playground: Idiomatic Activation Refactor

- Switch client hydration selectors to `data-jsgui-control` (classes are fine, but data attributes are the stable contract).
- Add an optional `deactivate()`/cleanup path for CanvasControl’s document listeners if the control can be mounted/unmounted.
- Consider consolidating hydration helpers into a small shared utility for other jsgui3 SSR + activation pages.
