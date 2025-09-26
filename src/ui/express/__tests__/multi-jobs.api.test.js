const request = require('supertest');
const { EventEmitter } = require('events');
const { createApp } = require('../server');

function makePersistentFakeRunner() {
	// A deterministic runner that emits a quick PROGRESS frame and stays alive
	// until kill() is called, so we can assert multi-job behavior reliably.
	return {
		start() {
			const ee = new EventEmitter();
			ee.stdout = new EventEmitter();
			ee.stderr = new EventEmitter();
			ee.stdin = { write: () => true };
			ee.pid = Math.floor(Math.random() * 100000) + 1000;
			ee.killed = false;
			const emitProgress = () => {
				try { ee.stdout.emit('data', Buffer.from('Starting persistent fake crawler\n', 'utf8')); } catch (_) {}
				try {
					const prog = { visited: 0, downloaded: 0, found: 0, saved: 0, errors: 0, queueSize: 1, robotsLoaded: true };
					ee.stdout.emit('data', Buffer.from('PROGRESS ' + JSON.stringify(prog) + '\n', 'utf8'));
				} catch (_) {}
			};
			const interval = setInterval(emitProgress, 40);
			interval.unref?.();
			setTimeout(emitProgress, 10).unref?.();
			ee.kill = () => {
				if (ee.killed) return;
				ee.killed = true;
				try { clearInterval(interval); } catch (_) {}
				const exitTimer = setTimeout(() => { try { ee.emit('exit', 0, null); } catch (_) {} }, 10);
				exitTimer.unref?.();
			};
			return ee;
		}
	};
}

function attachSseCollector(app, jobFilter) {
	const rawFrames = [];
	const client = {
		res: {
			write(payload) {
				rawFrames.push(payload.toString('utf8'));
			},
			flush() {}
		},
		logsEnabled: true,
		jobFilter: jobFilter || null,
		heartbeat: null
	};
	app.locals._sseClients.add(client);
	return {
		getEvents() {
			const events = [];
			for (const frame of rawFrames) {
				const lines = frame.split(/\n/).filter(Boolean);
				let ev = 'message'; let data = '';
				for (const ln of lines) {
					if (ln.startsWith('event: ')) ev = ln.slice(7).trim();
					else if (ln.startsWith('data: ')) data += (data ? '\n' : '') + ln.slice(6);
				}
				let json = null; try { json = data ? JSON.parse(data) : null; } catch (_) {}
				events.push({ event: ev, data: json });
			}
			return events;
		},
		dispose() {
			app.locals._sseClients.delete(client);
		}
	};
}

async function waitForProgress(collector, jobId, timeoutMs = 800) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const event = collector.getEvents().find(e => e.event === 'progress' && e.data && e.data.jobId === jobId);
		if (event) return event;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	return null;
}

describe('Multi-job mode (flagged)', () => {
	test('can start two jobs concurrently and filter SSE per job', async () => {
		const app = createApp({ allowMultiJobs: true, runner: makePersistentFakeRunner() });
		const agent = request(app);
		let s1;
		let s2;
		try {
			// Start two crawls
			const r1 = await agent.post('/api/crawl').send({ startUrl: 'https://example.com/one', depth: 0 }).expect(202);
			const j1 = String(r1.body.jobId || '');
			s1 = attachSseCollector(app, j1);
			const r2 = await agent.post('/api/crawl').send({ startUrl: 'https://example.com/two', depth: 0 }).expect(202);
			const j2 = String(r2.body.jobId || '');
			s2 = attachSseCollector(app, j2);
			expect(j1).toBeTruthy();
			expect(j2).toBeTruthy();
			expect(j1).not.toBe(j2);

			// Wait briefly to accumulate events
			const p1 = await waitForProgress(s1, j1);
			const p2 = await waitForProgress(s2, j2);
			expect(p1).toBeTruthy();
			expect(p2).toBeTruthy();

			// Ensure cross-talk is filtered: j1 stream should not carry j2 progress and vice versa
			const cross1 = s1.getEvents().find(e => e.event === 'progress' && e.data && e.data.jobId === j2);
			const cross2 = s2.getEvents().find(e => e.event === 'progress' && e.data && e.data.jobId === j1);
			expect(cross1).toBeFalsy();
			expect(cross2).toBeFalsy();

			// With 2 running jobs, stop without jobId should return 400
			await agent.post('/api/stop').send({}).expect(400);

			// Stop job1 explicitly
			const stop1 = await agent.post('/api/stop').send({ jobId: j1 });
			expect([200,202]).toContain(stop1.status);
			await new Promise(r => setTimeout(r, 30));

			// Stop job2 explicitly
			const stop2 = await agent.post('/api/stop').send({ jobId: j2 });
			expect([200,202]).toContain(stop2.status);

		} finally {
			try { s1?.dispose?.(); } catch (_) {}
			try { s2?.dispose?.(); } catch (_) {}
		}
	});
});

