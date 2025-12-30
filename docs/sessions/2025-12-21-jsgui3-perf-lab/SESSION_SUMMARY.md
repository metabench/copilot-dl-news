# Session Summary – jsgui3 Live Update Performance Lab

## Accomplishments
- Added a dedicated perf lab: `src/ui/lab/experiments/041-jsgui3-live-graph-perf/`.
- Implements a Canvas “graph-like” renderer that can absorb high-rate discovery updates using a queue + requestAnimationFrame draining.
- Added a Puppeteer check that captures a browser-emitted `PERF_SUMMARY` JSON line.

## Metrics / Evidence
- Run: `node src/ui/lab/experiments/041-jsgui3-live-graph-perf/check.js`
- Paste the resulting `PERF_SUMMARY` output here (or link to captured logs):
	- `{"totalNodes":1000,"received":1000,"applied":1000,"dropped":0,"firstNodeMs":null,"finishedMs":1023,"maxFrameMs":1,"frameSamples":[0.7001000000010245,0.8004000000032596,0.8000999999994092,0.8999999999941792,0.6999999999970896,0.6999999999970896,0.7003999999985106,0.7997999999969732,0.799999999995634,1.4000000000014552,0.7000000000043656,0.6999999999970896,0.6999999999970896,0.7000000000043656,0.6999999999970896,0.8999999999941792,0.7000000000043656,0.6999999999970896,0.6999999999970896,0.6999999999970896,0.6999999999970896,0.799999999995634,0.6999999999970896,0.6999999999970896,0.7000000000043656,0.6999999999970896,0.6999999999970896,0.8000000000029104,0.7000000000043656,0.7000000000043656,0.8999999999941792,0.6999999999970896,0.6999999999970896,0.6999999999970896,0.6999999999970896,0.7000000000043656,0.6999999999970896,0.7000000000043656,0.7000000000043656,0.8999999999941792,0.7000000000043656,0.6999999999970896,0.6999999999970896,0.6999999999970896,0.6999999999970896,0.8000000000029104,0.6999999999970896,0.6999999999970896,0.7000000000043656,0.6999999999970896,0.6999999999970896,0.6999999999970896,0.799999999995634,0.7000000000043656,0.6999999999970896,0.6999999999970896,0.6999999999970896,0.7000000000043656,0.6999999999970896,0.6999999999970896]}`

- Transport comparison (1000 nodes in 1000ms, tick=20ms):
	- Batch (`node …/check.js --mode batch`): `received=1000`, `applied=1000`, `firstNodeMs=141`, `finishedMs=1122`, `maxFrameMs=0` (server `done` at `seq=40`).
	- Single (`node …/check.js --mode single`): `received=1000`, `applied=1000`, `firstNodeMs=162`, `finishedMs=1152`, `maxFrameMs=0` (server `done` at `seq=1006`).

## Decisions
- Render path for high-rate updates starts with Canvas + batching; DOM/SVG variants can be added later for feature parity.

## Next Steps
- Stress test transports (payload size + higher volume) and record breakpoints where single-message becomes unstable.
- Add a DOM+SVG renderer variant to measure “pretty graph” cost vs Canvas.
