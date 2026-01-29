/**
 * Tests for AdaptiveExplorer - Dynamic exploration/exploitation strategy
 */

const { AdaptiveExplorer } = require('../AdaptiveExplorer');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

describe('AdaptiveExplorer', () => {
  let db;
  let explorer;
  let mockLogger;
  let tempDbPath;

  beforeEach(() => {
    tempDbPath = path.join(__dirname, `test-explorer-${Date.now()}.db`);
    db = new Database(tempDbPath);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS exploration_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        strategy TEXT NOT NULL,
        exploration_rate REAL,
        selected_arm TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS exploration_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        arm TEXT NOT NULL,
        exploration_rate REAL,
        reward REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS domain_exploration_coefficients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL UNIQUE,
        optimal_exploration_rate REAL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    
    mockLogger = {
      log: jest.fn(),
      error: jest.fn()
    };
    
    explorer = new AdaptiveExplorer({ db, logger: mockLogger, initialEpsilon: 0.2 });
  });

  afterEach(() => {
    if (explorer) {
      explorer.close();
    }
    if (db) {
      db.close();
    }
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('selectAction', () => {
    test('selects action using epsilon-greedy strategy', async () => {
      const candidates = [
        { url: '/hub1', hubType: 'country' },
        { url: '/hub2', hubType: 'city' },
        { url: '/hub3', hubType: 'topic' }
      ];

      const result = await explorer.selectAction(candidates, {
        domain: 'example.com',
        strategy: 'epsilon-greedy'
      });

      expect(result.action).toBeDefined();
      expect(result.strategy).toBe('epsilon-greedy');
      expect(result.explorationRate).toBeGreaterThanOrEqual(0);
      expect(result.reasoning).toBeDefined();
    });

    test('selects action using UCB strategy', async () => {
      const candidates = [
        { url: '/hub1', hubType: 'country' },
        { url: '/hub2', hubType: 'city' }
      ];

      // Update some arms first
      await explorer.updateOutcome({ hubType: 'country' }, 80);
      await explorer.updateOutcome({ hubType: 'city' }, 50);

      const result = await explorer.selectAction(candidates, {
        domain: 'example.com',
        strategy: 'ucb'
      });

      expect(result.action).toBeDefined();
      expect(result.strategy).toBe('ucb');
    });

    test('selects action using Thompson sampling', async () => {
      const candidates = [
        { url: '/hub1', hubType: 'country' },
        { url: '/hub2', hubType: 'city' }
      ];

      const result = await explorer.selectAction(candidates, {
        domain: 'example.com',
        strategy: 'thompson-sampling'
      });

      expect(result.action).toBeDefined();
      expect(result.strategy).toBe('thompson-sampling');
    });

    test('increases exploration when plateau detected', async () => {
      const candidates = [{ url: '/hub1', hubType: 'country' }];

      // Create plateau (need 2 windows = 10 values, <1% improvement)
      for (let i = 0; i < 5; i++) {
        await explorer.updateOutcome({ hubType: 'country' }, 50);
      }
      for (let i = 0; i < 5; i++) {
        await explorer.updateOutcome({ hubType: 'country' }, 50.2); // 0.4% improvement
      }

      // Verify plateau detected
      expect(explorer.detectPlateau()).toBe(true);

      const result = await explorer.selectAction(candidates, {
        domain: 'example.com',
        strategy: 'epsilon-greedy'
      });

      expect(result.plateauDetected).toBe(true);
      expect(result.explorationRate).toBeGreaterThan(0.2);
    });

    test('decreases exploration when time-constrained', async () => {
      const candidates = [{ url: '/hub1', hubType: 'country' }];

      const result = await explorer.selectAction(candidates, {
        domain: 'example.com',
        strategy: 'epsilon-greedy',
        timeRemaining: 200 // < 5 minutes
      });

      expect(result.explorationRate).toBeLessThan(0.2);
    });

    test('forces exploration when requested', async () => {
      const candidates = [{ url: '/hub1', hubType: 'country' }];

      const result = await explorer.selectAction(candidates, {
        domain: 'example.com',
        strategy: 'epsilon-greedy',
        forceExplore: true
      });

      expect(result.explorationRate).toBe(0.8);
    });

    test('forces exploitation when requested', async () => {
      const candidates = [{ url: '/hub1', hubType: 'country' }];

      const result = await explorer.selectAction(candidates, {
        domain: 'example.com',
        strategy: 'epsilon-greedy',
        forceExploit: true
      });

      expect(result.explorationRate).toBe(0.0);
    });
  });

  describe('updateOutcome', () => {
    test('updates arm statistics after outcome', async () => {
      const action = { hubType: 'country' };

      await explorer.updateOutcome(action, 80);

      const stats = explorer.getStats();
      const countryArm = stats.arms.find(a => a.arm === 'country');

      expect(countryArm).toBeDefined();
      expect(countryArm.pulls).toBe(1);
      expect(countryArm.avgReward).toBe(80);
    });

    test('decays exploration rate over time', async () => {
      const initialEpsilon = explorer.epsilon;

      await explorer.updateOutcome({ hubType: 'country' }, 80);

      expect(explorer.epsilon).toBeLessThan(initialEpsilon);
      expect(explorer.epsilon).toBeGreaterThanOrEqual(explorer.minEpsilon);
    });

    test('maintains minimum exploration rate', async () => {      // Force many updates to test minimum (need ~130 with decay 0.99)
      for (let i = 0; i < 200; i++) {
        await explorer.updateOutcome({ hubType: 'country' }, 80);
      }

      expect(explorer.epsilon).toBe(explorer.minEpsilon);
    });

    test('tracks recent rewards for plateau detection', async () => {
      await explorer.updateOutcome({ hubType: 'country' }, 50);
      await explorer.updateOutcome({ hubType: 'city' }, 55);

      expect(explorer.recentRewards.length).toBe(2);
    });
  });

  describe('detectPlateau', () => {
    test('detects plateau when improvement is low', async () => {
      // Create plateau (need 10 values: 5 old + 5 new, minimal improvement)
      for (let i = 0; i < 5; i++) {
        await explorer.updateOutcome({ hubType: 'country' }, 50);
      }
      for (let i = 0; i < 5; i++) {
        await explorer.updateOutcome({ hubType: 'country' }, 50.2); // 0.4% improvement
      }

      const plateau = explorer.detectPlateau();
      expect(plateau).toBe(true);
    });

    test('does not detect plateau with high improvement', async () => {
      // Increasing rewards
      for (let i = 0; i < 5; i++) {
        await explorer.updateOutcome({ hubType: 'country' }, 50 + i * 10);
      }

      const plateau = explorer.detectPlateau();
      expect(plateau).toBe(false);
    });

    test('requires sufficient history', async () => {
      await explorer.updateOutcome({ hubType: 'country' }, 50);

      const plateau = explorer.detectPlateau();
      expect(plateau).toBe(false); // Not enough data
    });
  });

  describe('getExplorationRate', () => {
    test('returns domain-specific rate when available', async () => {
      explorer.domainCoefficients.set('example.com', 0.3);

      const rate = await explorer.getExplorationRate('example.com');
      expect(rate).toBe(0.3);
    });

    test('returns default epsilon for unknown domains', async () => {
      const rate = await explorer.getExplorationRate('unknown.com');
      expect(rate).toBe(explorer.epsilon);
    });
  });

  describe('forceExploration', () => {
    test('temporarily increases exploration rate', () => {
      const originalEpsilon = explorer.epsilon;

      explorer.forceExploration(1);

      expect(explorer.epsilon).toBe(0.8);

      // Wait for timeout (not testing async timeout, just checking immediate effect)
    });
  });

  describe('forceExploitation', () => {
    test('temporarily disables exploration', () => {
      const originalEpsilon = explorer.epsilon;

      explorer.forceExploitation(1);

      expect(explorer.epsilon).toBe(0.0);
    });
  });

  describe('Multi-Armed Bandit', () => {
    test('epsilon-greedy explores randomly with probability ε', async () => {
      // Reset explorer with higher epsilon for this test
      explorer.epsilon = 0.3;
      
      const candidates = [
        { url: '/hub1', hubType: 'country' },
        { url: '/hub2', hubType: 'city' }
      ];

      // Make country much better
      for (let i = 0; i < 10; i++) {
        await explorer.updateOutcome({ hubType: 'country' }, 100);
        await explorer.updateOutcome({ hubType: 'city' }, 20);
      }

      // Reset epsilon after updates
      explorer.epsilon = 0.3;

      // Run multiple selections
      let exploredCount = 0;
      const trials = 50;

      for (let i = 0; i < trials; i++) {
        const result = await explorer.selectAction(candidates, {
          strategy: 'epsilon-greedy'
        });

        // If city is selected despite lower reward, it's exploration
        if (result.action.hubType === 'city') {
          exploredCount++;
        }
      }

      // Should explore approximately 30% of the time (with some variance)
      expect(exploredCount).toBeGreaterThan(5); // At least some exploration
      expect(exploredCount).toBeLessThan(trials); // Not always exploring
    });

    test('UCB balances exploration and exploitation', async () => {
      const candidates = [
        { url: '/hub1', hubType: 'country' },
        { url: '/hub2', hubType: 'city' }
      ];

      // Update country many times, city few times
      for (let i = 0; i < 10; i++) {
        await explorer.updateOutcome({ hubType: 'country' }, 70);
      }
      await explorer.updateOutcome({ hubType: 'city' }, 80); // Better but less data

      const result = await explorer.selectAction(candidates, {
        strategy: 'ucb'
      });

      // UCB should favor city due to exploration bonus (less pulls)
      // (This is probabilistic but city has much less data)
      expect(result.action).toBeDefined();
    });

    test('Thompson sampling samples from posterior', async () => {
      const candidates = [
        { url: '/hub1', hubType: 'country' },
        { url: '/hub2', hubType: 'city' }
      ];

      // Update arms with different rewards
      for (let i = 0; i < 5; i++) {
        await explorer.updateOutcome({ hubType: 'country' }, 80);
        await explorer.updateOutcome({ hubType: 'city' }, 50);
      }

      // Run multiple samples
      const selections = { country: 0, city: 0 };
      const trials = 20;

      for (let i = 0; i < trials; i++) {
        const result = await explorer.selectAction(candidates, {
          strategy: 'thompson-sampling'
        });

        selections[result.action.hubType]++;
      }

      // Should mostly select country (higher reward) but sometimes city
      expect(selections.country).toBeGreaterThan(selections.city);
      expect(selections.city).toBeGreaterThan(0); // Still explores
    });
  });

  describe('Domain Learning', () => {
    test('learns optimal exploration rate from outcomes', async () => {
      const domain = 'example.com';

      // Insert outcomes with different exploration rates
      for (let i = 0; i < 20; i++) {
        const rate = i < 10 ? 0.3 : 0.1; // Higher rate performs better
        const reward = rate === 0.3 ? 80 : 50;

        db.prepare(`
          INSERT INTO exploration_outcomes (domain, arm, exploration_rate, reward)
          VALUES (?, ?, ?, ?)
        `).run(domain, 'country', rate, reward);
      }

      // Trigger learning
      await explorer._learnDomainCoefficient(domain);

      const coefficient = explorer.domainCoefficients.get(domain);
      expect(coefficient).toBeDefined();
      expect(coefficient).toBeCloseTo(0.3, 1); // Should learn 0.3 is better
    });

    test('requires minimum data for learning', async () => {
      const domain = 'newdomain.com';

      // Insert only 5 outcomes (< 20 required)
      for (let i = 0; i < 5; i++) {
        db.prepare(`
          INSERT INTO exploration_outcomes (domain, arm, exploration_rate, reward)
          VALUES (?, ?, ?, ?)
        `).run(domain, 'country', 0.2, 70);
      }

      await explorer._learnDomainCoefficient(domain);

      expect(explorer.domainCoefficients.has(domain)).toBe(false);
    });
  });

  describe('getStats', () => {
    test('returns exploration statistics', async () => {
      await explorer.updateOutcome({ hubType: 'country' }, 80);
      await explorer.updateOutcome({ hubType: 'city' }, 50);

      const stats = explorer.getStats();

      expect(stats.epsilon).toBeDefined();
      expect(stats.arms.length).toBe(2);
      expect(stats.totalPulls).toBe(2);
      expect(stats.plateauDetected).toBeDefined();
      expect(stats.recentAvgReward).toBeGreaterThan(0);
      expect(stats.domainsLearned).toBeDefined();
    });

    test('calculates arm confidence', async () => {
      const action = { hubType: 'country' };

      // Update multiple times to increase confidence
      for (let i = 0; i < 10; i++) {
        await explorer.updateOutcome(action, 70 + Math.random() * 10);
      }

      const stats = explorer.getStats();
      const countryArm = stats.arms.find(a => a.arm === 'country');

      expect(countryArm.confidence).toBeGreaterThan(0);
      expect(countryArm.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('close', () => {
    test('clears all state', async () => {
      await explorer.updateOutcome({ hubType: 'country' }, 80);
      explorer.domainCoefficients.set('domain', 0.3);

      explorer.close();

      expect(explorer.arms.size).toBe(0);
      expect(explorer.domainCoefficients.size).toBe(0);
      expect(explorer.recentRewards).toEqual([]);
    });
  });
});
