'use strict';

const ServiceContainer = require('../ServiceContainer');

describe('ServiceContainer', () => {
  let container;

  beforeEach(() => {
    container = new ServiceContainer();
  });

  describe('register and get', () => {
    it('should register and retrieve a service', () => {
      container.register('config', () => ({ maxPages: 100 }));

      const config = container.get('config');

      expect(config).toEqual({ maxPages: 100 });
    });

    it('should return singleton by default', () => {
      let callCount = 0;
      container.register('counter', () => {
        callCount++;
        return { count: callCount };
      });

      const first = container.get('counter');
      const second = container.get('counter');

      expect(first).toBe(second);
      expect(callCount).toBe(1);
    });

    it('should create new instance when singleton: false', () => {
      let callCount = 0;
      container.register('counter', () => {
        callCount++;
        return { count: callCount };
      }, { singleton: false });

      const first = container.get('counter');
      const second = container.get('counter');

      expect(first).not.toBe(second);
      expect(callCount).toBe(2);
    });

    it('should throw for unregistered service', () => {
      expect(() => container.get('unknown')).toThrow(/Service not registered: 'unknown'/);
    });

    it('should pass container to factory', () => {
      container.register('config', () => ({ value: 42 }));
      container.register('service', (c) => ({
        configValue: c.get('config').value
      }));

      const service = container.get('service');

      expect(service.configValue).toBe(42);
    });
  });

  describe('tryGet', () => {
    it('should return null for unregistered service', () => {
      expect(container.tryGet('unknown')).toBeNull();
    });

    it('should return service if registered', () => {
      container.register('test', () => 'value');
      expect(container.tryGet('test')).toBe('value');
    });
  });

  describe('has and hasInstance', () => {
    it('should return true for registered service', () => {
      container.register('test', () => 'value');
      expect(container.has('test')).toBe(true);
      expect(container.has('unknown')).toBe(false);
    });

    it('should track instance creation', () => {
      container.register('test', () => 'value');

      expect(container.hasInstance('test')).toBe(false);
      container.get('test');
      expect(container.hasInstance('test')).toBe(true);
    });
  });

  describe('groups', () => {
    it('should track services by group', () => {
      container.register('robotsChecker', () => 'robots', { group: 'policy' });
      container.register('urlDecision', () => 'decisions', { group: 'policy' });
      container.register('cache', () => 'cache', { group: 'storage' });

      const policyGroup = container.getGroup('policy');

      expect(policyGroup).toEqual({
        robotsChecker: 'robots',
        urlDecision: 'decisions'
      });
    });

    it('should list group names', () => {
      container.register('a', () => 1, { group: 'first' });
      container.register('b', () => 2, { group: 'second' });

      expect(container.listGroups()).toContain('first');
      expect(container.listGroups()).toContain('second');
    });

    it('should get group names without instantiating', () => {
      let instantiated = false;
      container.register('lazy', () => {
        instantiated = true;
        return 'value';
      }, { group: 'test' });

      const names = container.getGroupNames('test');

      expect(names).toEqual(['lazy']);
      expect(instantiated).toBe(false);
    });
  });

  describe('registerAll', () => {
    it('should register multiple services', () => {
      container.registerAll({
        a: () => 1,
        b: () => 2,
        c: { factory: () => 3, options: { group: 'nums' } }
      });

      expect(container.get('a')).toBe(1);
      expect(container.get('b')).toBe(2);
      expect(container.get('c')).toBe(3);
      expect(container.getGroupNames('nums')).toEqual(['c']);
    });
  });

  describe('set', () => {
    it('should set pre-created instance', () => {
      const instance = { ready: true };
      container.set('prebuilt', instance);

      expect(container.get('prebuilt')).toBe(instance);
      expect(container.has('prebuilt')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear all instances', () => {
      container.register('test', () => ({ created: Date.now() }));
      const first = container.get('test');

      container.reset();

      const second = container.get('test');
      expect(first).not.toBe(second);
    });

    it('should clear specific instance', () => {
      container.register('a', () => ({ name: 'a' }));
      container.register('b', () => ({ name: 'b' }));

      const a1 = container.get('a');
      const b1 = container.get('b');

      container.resetInstance('a');

      const a2 = container.get('a');
      const b2 = container.get('b');

      expect(a1).not.toBe(a2);
      expect(b1).toBe(b2);
    });
  });

  describe('dispose', () => {
    it('should call dispose on services', async () => {
      let disposed = false;
      container.register('disposable', () => ({
        dispose: () => { disposed = true; }
      }));
      container.get('disposable');

      await container.dispose();

      expect(disposed).toBe(true);
      expect(container.hasInstance('disposable')).toBe(false);
    });

    it('should handle close and destroy methods', async () => {
      const closed = [];
      container.register('closer', () => ({
        close: () => { closed.push('closer'); }
      }));
      container.register('destroyer', () => ({
        destroy: () => { closed.push('destroyer'); }
      }));

      container.get('closer');
      container.get('destroyer');

      await container.dispose();

      expect(closed).toContain('closer');
      expect(closed).toContain('destroyer');
    });
  });

  describe('dependencies', () => {
    it('should track declared dependencies', () => {
      container.register('a', () => 'a');
      container.register('b', () => 'b', { dependencies: ['a'] });

      expect(container.getDependencies('b')).toEqual(['a']);
      expect(container.getDependencies('a')).toBeNull();
    });

    it('should validate dependencies', () => {
      container.register('a', () => 'a');
      container.register('b', () => 'b', { dependencies: ['a', 'missing'] });

      const validation = container.validateDependencies();

      expect(validation.valid).toBe(false);
      expect(validation.missing).toEqual([
        { service: 'b', dependency: 'missing' }
      ]);
    });
  });

  describe('createChild', () => {
    it('should inherit parent registrations', () => {
      container.register('parent', () => 'parent-value');

      const child = container.createChild();

      expect(child.get('parent')).toBe('parent-value');
    });

    it('should allow overriding in child', () => {
      container.register('shared', () => 'parent');

      const child = container.createChild();
      child.register('shared', () => 'child');

      expect(container.get('shared')).toBe('parent');
      expect(child.get('shared')).toBe('child');
    });

    it('should share parent singleton instances', () => {
      container.register('singleton', () => ({ id: Math.random() }));
      const parentInstance = container.get('singleton');

      const child = container.createChild();

      expect(child.get('singleton')).toBe(parentInstance);
    });
  });

  describe('getStatus', () => {
    it('should return container status', () => {
      container.register('a', () => 1, { group: 'nums' });
      container.register('b', () => 2);
      container.get('a');

      const status = container.getStatus();

      expect(status.registeredServices).toBe(2);
      expect(status.instantiatedServices).toBe(1);
      expect(status.groups).toContain('nums');
      expect(status.services).toContain('a');
      expect(status.services).toContain('b');
      expect(status.instantiated).toEqual(['a']);
    });
  });
});
