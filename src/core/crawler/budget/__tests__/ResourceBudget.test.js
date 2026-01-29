'use strict';

const ResourceBudget = require('../ResourceBudget');
const { BudgetExhaustedError } = require('../index');

describe('ResourceBudget', () => {
  describe('constructor', () => {
    test('creates budget with no limits (Infinity) by default', () => {
      const budget = new ResourceBudget();

      expect(budget.getRemaining('pages')).toBe(Infinity);
      expect(budget.getRemaining('bytes')).toBe(Infinity);
      expect(budget.getRemaining('time')).toBe(Infinity);
      expect(budget.getRemaining('errors')).toBe(Infinity);
      expect(budget.isUnlimited('pages')).toBe(true);
    });

    test('creates budget with custom limits', () => {
      const budget = new ResourceBudget({
        limits: {
          pages: 500,
          bytes: 50 * 1024 * 1024,
          time: 300000
        }
      });

      expect(budget.getRemaining('pages')).toBe(500);
      expect(budget.getRemaining('bytes')).toBe(50 * 1024 * 1024);
      expect(budget.getRemaining('time')).toBe(300000);
    });

    test('accepts unlimited as Infinity', () => {
      const budget = new ResourceBudget({
        limits: { pages: Infinity }
      });

      expect(budget.getRemaining('pages')).toBe(Infinity);
      expect(budget.isUnlimited('pages')).toBe(true);
    });
  });

  describe('spending', () => {
    test('spend decreases remaining', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      budget.spend('pages', 10);
      expect(budget.getRemaining('pages')).toBe(90);
      expect(budget.getSpent('pages')).toBe(10);
    });

    test('spend tracks multiple resources independently', () => {
      const budget = new ResourceBudget({
        limits: { pages: 100, bytes: 1000, errors: 50 }
      });

      budget.spend('pages', 10);
      budget.spend('bytes', 500);
      budget.spend('errors', 5);

      expect(budget.getRemaining('pages')).toBe(90);
      expect(budget.getRemaining('bytes')).toBe(500);
      expect(budget.getRemaining('errors')).toBe(45);
    });

    test('spend allows negative amounts (refunds)', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      budget.spend('pages', 50);
      budget.spend('pages', -10);

      expect(budget.getSpent('pages')).toBe(40);
      expect(budget.getRemaining('pages')).toBe(60);
    });

    test('spend returns remaining amount', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      const remaining = budget.spend('pages', 40);
      expect(remaining).toBe(60);
    });
  });

  describe('canAfford', () => {
    test('returns true when budget available', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      expect(budget.canAfford('pages', 50)).toBe(true);
      expect(budget.canAfford('pages', 100)).toBe(true);
    });

    test('returns false when budget insufficient', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      expect(budget.canAfford('pages', 101)).toBe(false);
    });

    test('returns true for unlimited resources', () => {
      const budget = new ResourceBudget({ limits: { pages: Infinity } });

      expect(budget.canAfford('pages', 999999)).toBe(true);
    });

    test('canAffordAll checks multiple resources', () => {
      const budget = new ResourceBudget({
        limits: { pages: 100, bytes: 1000 }
      });

      expect(budget.canAffordAll({ pages: 50, bytes: 500 })).toBe(true);
      expect(budget.canAffordAll({ pages: 50, bytes: 1500 })).toBe(false);
    });
  });

  describe('reservations', () => {
    test('reserve returns reservation object', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      const reservation = budget.reserve('pages', 50);

      expect(reservation).toBeDefined();
      expect(reservation.resource).toBe('pages');
      expect(reservation.amount).toBe(50);
      expect(reservation.commit).toBeInstanceOf(Function);
      expect(reservation.release).toBeInstanceOf(Function);
    });

    test('reservation reduces remaining', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      budget.reserve('pages', 50);

      expect(budget.getRemaining('pages')).toBe(50);
      expect(budget.getReserved('pages')).toBe(50);
    });

    test('commit finalizes reservation', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      const reservation = budget.reserve('pages', 50);
      reservation.commit();

      expect(budget.getSpent('pages')).toBe(50);
      expect(budget.getReserved('pages')).toBe(0);
    });

    test('release returns reserved amount', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      const reservation = budget.reserve('pages', 50);
      reservation.release();

      expect(budget.getRemaining('pages')).toBe(100);
      expect(budget.getReserved('pages')).toBe(0);
      expect(budget.getSpent('pages')).toBe(0);
    });

    test('reserve returns null when insufficient', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      const reservation = budget.reserve('pages', 150);

      expect(reservation).toBeNull();
    });

    test('commit can be called only once', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      const reservation = budget.reserve('pages', 50);
      reservation.commit();

      expect(() => reservation.commit()).not.toThrow();
      expect(budget.getSpent('pages')).toBe(50); // Not doubled
    });
  });

  describe('warning thresholds', () => {
    test('emits warning at threshold', () => {
      const budget = new ResourceBudget({
        limits: { pages: 100 },
        warningThreshold: 0.8
      });

      const warnings = [];
      budget.onWarning('pages', (remaining, limit) => {
        warnings.push({ remaining, limit });
      });

      budget.spend('pages', 80);

      expect(warnings).toHaveLength(1);
      expect(warnings[0].remaining).toBe(20);
    });

    test('warning only fires once', () => {
      const budget = new ResourceBudget({
        limits: { pages: 100 },
        warningThreshold: 0.8
      });

      const warnings = [];
      budget.onWarning('pages', () => warnings.push(true));

      budget.spend('pages', 80);
      budget.spend('pages', 5);
      budget.spend('pages', 5);

      expect(warnings).toHaveLength(1);
    });

    test('isWarning returns true after threshold', () => {
      const budget = new ResourceBudget({
        limits: { pages: 100 },
        warningThreshold: 0.8
      });

      expect(budget.isWarning('pages')).toBe(false);

      budget.spend('pages', 85);

      expect(budget.isWarning('pages')).toBe(true);
    });
  });

  describe('exhaustion', () => {
    test('emits exhausted event at zero', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      const exhausted = [];
      budget.onExhausted('pages', (spent, limit) => {
        exhausted.push({ spent, limit });
      });

      budget.spend('pages', 100);

      expect(exhausted).toHaveLength(1);
      expect(exhausted[0].spent).toBe(100);
    });

    test('isExhausted returns true at zero', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      expect(budget.isExhausted('pages')).toBe(false);

      budget.spend('pages', 100);

      expect(budget.isExhausted('pages')).toBe(true);
    });

    test('anyExhausted returns true if any resource exhausted', () => {
      const budget = new ResourceBudget({
        limits: { pages: 100, bytes: 1000 }
      });

      expect(budget.anyExhausted()).toBe(false);

      budget.spend('pages', 100);

      expect(budget.anyExhausted()).toBe(true);
    });
  });

  describe('enforcement modes', () => {
    test('warn mode logs but allows overspend', () => {
      const budget = new ResourceBudget({
        limits: { pages: 100 },
        enforcement: 'warn'
      });

      const result = budget.spend('pages', 150);

      expect(result).toBe(-50); // Negative remaining
      expect(budget.getSpent('pages')).toBe(150);
    });

    test('error mode throws on overspend', () => {
      const budget = new ResourceBudget({
        limits: { pages: 100 },
        enforcement: 'error'
      });

      budget.spend('pages', 50);

      expect(() => budget.spend('pages', 100)).toThrow(BudgetExhaustedError);
    });

    test('BudgetExhaustedError contains resource info', () => {
      const budget = new ResourceBudget({
        limits: { pages: 100 },
        enforcement: 'error'
      });

      try {
        budget.spend('pages', 150);
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BudgetExhaustedError);
        expect(err.resource).toBe('pages');
        expect(err.requested).toBe(150);
        expect(err.available).toBe(100);
      }
    });

    test('silent mode allows overspend silently', () => {
      const budget = new ResourceBudget({
        limits: { pages: 100 },
        enforcement: 'silent'
      });

      expect(() => budget.spend('pages', 150)).not.toThrow();
      expect(budget.getSpent('pages')).toBe(150);
    });
  });

  describe('child budgets', () => {
    test('allocate creates child budget', () => {
      const parent = new ResourceBudget({
        limits: { pages: 100, bytes: 1000 }
      });

      const child = parent.allocate({ pages: 50, bytes: 500 });

      expect(child).toBeInstanceOf(ResourceBudget);
      expect(child.getRemaining('pages')).toBe(50);
      expect(parent.getReserved('pages')).toBe(50);
    });

    test('child spending affects parent on commit', () => {
      const parent = new ResourceBudget({ limits: { pages: 100 } });
      const child = parent.allocate({ pages: 50 });

      child.spend('pages', 20);
      child.commit();

      expect(parent.getSpent('pages')).toBe(20);
      expect(parent.getReserved('pages')).toBe(0);
    });

    test('release returns unspent allocation to parent', () => {
      const parent = new ResourceBudget({ limits: { pages: 100 } });
      const child = parent.allocate({ pages: 50 });

      child.spend('pages', 20);
      child.release();

      expect(parent.getSpent('pages')).toBe(20);
      expect(parent.getRemaining('pages')).toBe(80);
    });

    test('child cannot exceed allocation', () => {
      const parent = new ResourceBudget({ limits: { pages: 100 } });
      const child = parent.allocate({ pages: 50 });

      expect(child.canAfford('pages', 50)).toBe(true);
      expect(child.canAfford('pages', 51)).toBe(false);
    });
  });

  describe('presets', () => {
    test('default preset has standard limits', () => {
      const budget = ResourceBudget.preset('default');

      expect(budget.getRemaining('pages')).toBe(1000);
      expect(budget.getRemaining('errors')).toBe(100);
    });

    test('light preset has reduced limits', () => {
      const budget = ResourceBudget.preset('light');

      expect(budget.getRemaining('pages')).toBe(100);
      expect(budget.getRemaining('time')).toBe(60000);
    });

    test('heavy preset has increased limits', () => {
      const budget = ResourceBudget.preset('heavy');

      expect(budget.getRemaining('pages')).toBe(10000);
      expect(budget.getRemaining('bytes')).toBe(1024 * 1024 * 1024);
    });

    test('unlimited preset has infinite limits', () => {
      const budget = ResourceBudget.preset('unlimited');

      expect(budget.isUnlimited('pages')).toBe(true);
      expect(budget.isUnlimited('bytes')).toBe(true);
      expect(budget.isUnlimited('time')).toBe(true);
    });

    test('unknown preset returns default', () => {
      const budget = ResourceBudget.preset('unknown-preset');

      expect(budget.getRemaining('pages')).toBe(1000);
    });
  });

  describe('percentage calculations', () => {
    test('getPercentUsed returns usage percentage', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      budget.spend('pages', 25);

      expect(budget.getPercentUsed('pages')).toBe(25);
    });

    test('getPercentRemaining returns remaining percentage', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      budget.spend('pages', 25);

      expect(budget.getPercentRemaining('pages')).toBe(75);
    });
  });

  describe('serialization', () => {
    test('toJSON returns comprehensive snapshot', () => {
      const budget = new ResourceBudget({
        limits: { pages: 100, bytes: 1000 }
      });

      budget.spend('pages', 30);
      budget.reserve('bytes', 200);

      const json = budget.toJSON();

      expect(json.pages.limit).toBe(100);
      expect(json.pages.spent).toBe(30);
      expect(json.pages.remaining).toBe(70);
      expect(json.pages.percentUsed).toBe(30);

      expect(json.bytes.reserved).toBe(200);
    });

    test('summary returns one-line status', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });
      budget.spend('pages', 50);

      const summary = budget.summary;

      expect(summary).toContain('pages');
      expect(summary).toContain('50');
    });
  });

  describe('reset', () => {
    test('reset clears all spending', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      budget.spend('pages', 50);
      budget.reset();

      expect(budget.getSpent('pages')).toBe(0);
      expect(budget.getRemaining('pages')).toBe(100);
    });

    test('reset clears reservations', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      budget.reserve('pages', 50);
      budget.reset();

      expect(budget.getReserved('pages')).toBe(0);
      expect(budget.getRemaining('pages')).toBe(100);
    });

    test('reset clears warning flags', () => {
      const budget = new ResourceBudget({
        limits: { pages: 100 },
        warningThreshold: 0.8
      });

      budget.spend('pages', 85);
      expect(budget.isWarning('pages')).toBe(true);

      budget.reset();

      expect(budget.isWarning('pages')).toBe(false);
    });
  });

  describe('events', () => {
    test('emits spend event', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      const events = [];
      budget.on('spend', (resource, amount, remaining) => {
        events.push({ resource, amount, remaining });
      });

      budget.spend('pages', 30);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ resource: 'pages', amount: 30, remaining: 70 });
    });

    test('emits warning event', () => {
      const budget = new ResourceBudget({
        limits: { pages: 100 },
        warningThreshold: 0.8
      });

      const events = [];
      budget.on('warning', (resource, remaining, limit) => {
        events.push({ resource, remaining, limit });
      });

      budget.spend('pages', 85);

      expect(events).toHaveLength(1);
      expect(events[0].resource).toBe('pages');
    });

    test('emits exhausted event', () => {
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      const events = [];
      budget.on('exhausted', (resource, spent, limit) => {
        events.push({ resource, spent, limit });
      });

      budget.spend('pages', 100);

      expect(events).toHaveLength(1);
      expect(events[0].resource).toBe('pages');
    });
  });
});
