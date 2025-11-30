# Follow Ups – Art Playground Resize Investigation

## Priority 1: Root Cause Analysis
- [ ] Check if CanvasControl has listeners for `resize-start`, `resize-move`, `resize-end`
- [ ] Add console logging to SelectionHandlesControl to verify events are firing
- [ ] Verify handle DOM elements are visible and correctly positioned

## Priority 2: Event Wiring
- [ ] In CanvasControl, implement `resize-move` handler that updates component bounds
- [ ] Calculate delta from initial mouse position to current
- [ ] Apply bounds change based on which handle is being dragged (nw, n, ne, etc.)

## Priority 3: Validation
- [ ] Run art playground in browser and manually test resize
- [ ] Create Puppeteer scenario to automate resize testing
- [ ] Add jsgui3-event-lab scenario for resize events
