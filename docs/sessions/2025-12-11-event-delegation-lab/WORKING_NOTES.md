# Working Notes – Event delegation lab

- 2025-12-11 — Created session and plan; md-scan found a delegation mention in JSGUI3_UI_ARCHITECTURE_GUIDE.md (section around event delegation on document).
- 2025-12-11 — Scaffolded 10 proposed experiments (005–014) covering delegation/bubbling scenarios; added stub check scripts.
- 2025-12-11 — Implemented experiment 013 custom events bubbling check: simulates root/parent/child tree; validates native click bubbles, custom non-bubbling stays at target, custom bubbling reaches ancestors (3/3 passed).
- 2025-12-11 — Implemented and ran 005–012 and 014 checks (synthetic trees, no DOM):
	- 005 Delegation baseline: delegated + direct order child→container→root (3/3 passed).
	- 006 Capture vs bubble: capture (root→target) precedes bubble (target→root) (1/1 passed).
	- 007 stopPropagation: halts at mid node when invoked (2/2 passed).
	- 008 stopImmediatePropagation: stops sibling handlers and ancestor traversal (2/2 passed).
	- 009 target vs currentTarget: target stays leaf, currentTarget climbs path (1/1 passed).
	- 010 Nested bubbling: deep chain visits each ancestor once (1/1 passed).
	- 011 Delegated selector matching: class-filtered delegation hits items, not text nodes (2/2 passed).
	- 012 Dynamic children: removed nodes stop bubbling; newly added nodes covered without rebinding (3/3 passed).
	- 014 Delegation performance batch: delegated handler count/calls remain 1 vs O(n) per-node at 10/100/1000 (6/6 passed).
