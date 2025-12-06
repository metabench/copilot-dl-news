/**
 * Tests for the pipeline module - runPipeline, createStep, composePipelines
 */
const { runPipeline, createStep, composePipelines } = require('../../../src/crawler/pipeline/runPipeline');

describe('runPipeline', () => {
  describe('basic execution', () => {
    it('should execute steps in order', async () => {
      const executionOrder = [];
      
      const steps = [
        createStep('step1', async () => {
          executionOrder.push(1);
          return { ok: true, value: 'one' };
        }),
        createStep('step2', async () => {
          executionOrder.push(2);
          return { ok: true, value: 'two' };
        }),
        createStep('step3', async () => {
          executionOrder.push(3);
          return { ok: true, value: 'three' };
        })
      ];
      
      const result = await runPipeline(steps, { url: 'https://example.com' }, {});
      
      expect(result.ok).toBe(true);
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should pass context between steps', async () => {
      const steps = [
        createStep('set-value', async (ctx) => {
          ctx.computed = ctx.url.toUpperCase();
          return { ok: true };
        }),
        createStep('read-value', async (ctx) => {
          return { ok: true, value: ctx.computed };
        })
      ];
      
      const result = await runPipeline(steps, { url: 'test' }, {});
      
      expect(result.ok).toBe(true);
      expect(result.ctx.computed).toBe('TEST');
    });

    it('should stop on first non-optional failure', async () => {
      const executionOrder = [];
      
      const steps = [
        createStep('step1', async () => {
          executionOrder.push(1);
          return { ok: true };
        }),
        createStep('step2', async () => {
          executionOrder.push(2);
          return { ok: false, reason: 'blocked' };
        }),
        createStep('step3', async () => {
          executionOrder.push(3);
          return { ok: true };
        })
      ];
      
      const result = await runPipeline(steps, { url: 'test' }, {});
      
      expect(result.ok).toBe(false);
      expect(result.abortedAt).toBe('step2');
      expect(executionOrder).toEqual([1, 2]);
    });

    it('should continue past optional step failures', async () => {
      const executionOrder = [];
      
      const steps = [
        createStep('step1', async () => {
          executionOrder.push(1);
          return { ok: true };
        }),
        createStep('optional', async () => {
          executionOrder.push(2);
          return { ok: false, reason: 'optional-fail' };
        }, { optional: true }),
        createStep('step3', async () => {
          executionOrder.push(3);
          return { ok: true };
        })
      ];
      
      const result = await runPipeline(steps, { url: 'test' }, {});
      
      expect(result.ok).toBe(true);
      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });

  describe('shouldRun predicate', () => {
    it('should skip steps when shouldRun returns false', async () => {
      const executionOrder = [];
      
      const steps = [
        createStep('always', async () => {
          executionOrder.push(1);
          return { ok: true };
        }),
        createStep('conditional', async () => {
          executionOrder.push(2);
          return { ok: true };
        }, { shouldRun: (ctx) => ctx.runSecond }),
        createStep('always2', async () => {
          executionOrder.push(3);
          return { ok: true };
        })
      ];
      
      const result = await runPipeline(steps, { url: 'test', runSecond: false }, {});
      
      expect(result.ok).toBe(true);
      expect(executionOrder).toEqual([1, 3]);
    });

    it('should run steps when shouldRun returns true', async () => {
      const executionOrder = [];
      
      const steps = [
        createStep('conditional', async () => {
          executionOrder.push(1);
          return { ok: true };
        }, { shouldRun: (ctx) => ctx.enabled })
      ];
      
      const result = await runPipeline(steps, { url: 'test', enabled: true }, {});
      
      expect(result.ok).toBe(true);
      expect(executionOrder).toEqual([1]);
    });
  });

  describe('timing and metrics', () => {
    it('should record duration for pipeline', async () => {
      const steps = [
        createStep('wait', async () => {
          await new Promise(r => setTimeout(r, 10));
          return { ok: true };
        })
      ];
      
      const result = await runPipeline(steps, { url: 'test' }, {});
      
      expect(result.durationMs).toBeGreaterThanOrEqual(10);
    });

    it('should record per-step results', async () => {
      const steps = [
        createStep('step1', async () => ({ ok: true, value: 'a' })),
        createStep('step2', async () => ({ ok: true, value: 'b' }))
      ];
      
      const result = await runPipeline(steps, { url: 'test' }, {});
      
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults[0].stepId).toBe('step1');
      expect(result.stepResults[0].ok).toBe(true);
      expect(result.stepResults[1].stepId).toBe('step2');
    });

    it('should record skipped steps', async () => {
      const steps = [
        createStep('skipped', async () => ({ ok: true }), { 
          shouldRun: () => false 
        })
      ];
      
      const result = await runPipeline(steps, { url: 'test' }, {});
      
      expect(result.stepResults[0].skipped).toBe(true);
    });
  });

  describe('timeout handling', () => {
    it('should timeout long-running pipelines', async () => {
      const steps = [
        createStep('slow', async () => {
          await new Promise(r => setTimeout(r, 100));
          return { ok: true };
        })
      ];
      
      const result = await runPipeline(steps, { url: 'test' }, {}, { timeoutMs: 10 });
      
      expect(result.ok).toBe(false);
      // When timeout occurs, err message indicates timeout
      expect(result.err).toBeDefined();
      expect(result.err.message).toMatch(/timeout/i);
    });
  });

  describe('error handling', () => {
    it('should catch thrown errors and convert to result', async () => {
      const steps = [
        createStep('throws', async () => {
          throw new Error('kaboom');
        })
      ];
      
      const result = await runPipeline(steps, { url: 'test' }, {});
      
      expect(result.ok).toBe(false);
      expect(result.abortedAt).toBe('throws');
      expect(result.err.message).toBe('kaboom');
    });
  });
});

describe('createStep', () => {
  it('should create step with required fields', () => {
    const execute = async () => ({ ok: true });
    const step = createStep('my-step', execute);
    
    expect(step.id).toBe('my-step');
    expect(step.execute).toBe(execute);
    expect(step.label).toBe('my-step');
    expect(step.optional).toBe(false);
  });

  it('should accept optional configuration', () => {
    const step = createStep('custom', async () => ({ ok: true }), {
      label: 'Custom Step',
      optional: true,
      shouldRun: () => false
    });
    
    expect(step.label).toBe('Custom Step');
    expect(step.optional).toBe(true);
    expect(step.shouldRun).toBeDefined();
  });
});

describe('composePipelines', () => {
  it('should flatten multiple step arrays', () => {
    const pipeline1 = [
      createStep('a', async () => ({ ok: true })),
      createStep('b', async () => ({ ok: true }))
    ];
    const pipeline2 = [
      createStep('c', async () => ({ ok: true }))
    ];
    
    const combined = composePipelines(pipeline1, pipeline2);
    
    expect(combined).toHaveLength(3);
    expect(combined.map(s => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('should handle empty arrays', () => {
    const pipeline1 = [createStep('a', async () => ({ ok: true }))];
    
    const combined = composePipelines(pipeline1, [], []);
    
    expect(combined).toHaveLength(1);
  });

  it('should execute composed pipeline in order', async () => {
    const order = [];
    
    const p1 = [createStep('a', async () => { order.push('a'); return { ok: true }; })];
    const p2 = [createStep('b', async () => { order.push('b'); return { ok: true }; })];
    
    const combined = composePipelines(p1, p2);
    await runPipeline(combined, { url: 'test' }, {});
    
    expect(order).toEqual(['a', 'b']);
  });
});
