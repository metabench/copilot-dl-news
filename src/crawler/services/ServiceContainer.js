'use strict';

/**
 * ServiceContainer - Lightweight DI container for crawler services.
 *
 * Consolidates service instantiation previously scattered across:
 * - CrawlerServiceWiring.js (manual wiring of 30+ services)
 * - NewsCrawler constructor (inline service creation)
 * - Various ad-hoc factory functions
 *
 * Features:
 * - Lazy instantiation (services created on first access)
 * - Singleton by default (reuse same instance)
 * - Dependency resolution (services can depend on other services)
 * - Service groups (logical grouping for facades)
 * - Lifecycle management (dispose pattern)
 *
 * @example
 * const container = new ServiceContainer();
 * container.register('config', () => ({ maxPages: 100 }));
 * container.register('context', (c) => new CrawlContext(c.get('config')));
 * const ctx = container.get('context');
 */
class ServiceContainer {
  constructor() {
    /** @type {Map<string, { factory: Function, options: Object }>} */
    this._factories = new Map();

    /** @type {Map<string, any>} */
    this._instances = new Map();

    /** @type {Map<string, Set<string>>} */
    this._groups = new Map();

    /** @type {Map<string, string[]>} */
    this._dependencies = new Map();
  }

  /**
   * Register a service factory.
   *
   * @param {string} name - Unique service name
   * @param {Function} factory - Factory function: (container) => serviceInstance
   * @param {Object} [options] - Registration options
   * @param {boolean} [options.singleton=true] - Reuse same instance on each get()
   * @param {string} [options.group] - Logical group name (e.g., 'policy', 'storage')
   * @param {string[]} [options.dependencies] - Names of services this depends on (for documentation/validation)
   * @returns {ServiceContainer} this (for chaining)
   */
  register(name, factory, options = {}) {
    if (typeof factory !== 'function') {
      throw new Error(`Factory for service '${name}' must be a function`);
    }

    this._factories.set(name, { factory, options });

    // Track group membership
    if (options.group) {
      if (!this._groups.has(options.group)) {
        this._groups.set(options.group, new Set());
      }
      this._groups.get(options.group).add(name);
    }

    // Track dependencies for validation/debugging
    if (options.dependencies) {
      this._dependencies.set(name, options.dependencies);
    }

    return this;
  }

  /**
   * Get a service instance.
   * Creates the instance on first access (lazy instantiation).
   *
   * @param {string} name - Service name
   * @returns {any} The service instance
   * @throws {Error} If service is not registered
   */
  get(name) {
    // Return cached singleton
    if (this._instances.has(name)) {
      return this._instances.get(name);
    }

    const registration = this._factories.get(name);
    if (!registration) {
      throw new Error(`Service not registered: '${name}'. Available: ${[...this._factories.keys()].join(', ')}`);
    }

    const { factory, options } = registration;

    // Create instance
    const instance = factory(this);

    // Cache singletons (default behavior)
    if (options.singleton !== false) {
      this._instances.set(name, instance);
    }

    return instance;
  }

  /**
   * Try to get a service, returning null if not registered.
   *
   * @param {string} name - Service name
   * @returns {any|null} The service instance or null
   */
  tryGet(name) {
    if (!this.has(name)) return null;
    try {
      return this.get(name);
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if a service is registered.
   *
   * @param {string} name - Service name
   * @returns {boolean}
   */
  has(name) {
    return this._factories.has(name);
  }

  /**
   * Check if a service instance exists (has been created).
   *
   * @param {string} name - Service name
   * @returns {boolean}
   */
  hasInstance(name) {
    return this._instances.has(name);
  }

  /**
   * Get all services in a named group.
   *
   * @param {string} groupName - Group name
   * @returns {Object} Object with service names as keys
   */
  getGroup(groupName) {
    const names = this._groups.get(groupName);
    if (!names) return {};

    const services = {};
    for (const name of names) {
      services[name] = this.get(name);
    }
    return services;
  }

  /**
   * Get names of services in a group (without instantiating them).
   *
   * @param {string} groupName - Group name
   * @returns {string[]}
   */
  getGroupNames(groupName) {
    const names = this._groups.get(groupName);
    return names ? [...names] : [];
  }

  /**
   * List all registered group names.
   *
   * @returns {string[]}
   */
  listGroups() {
    return [...this._groups.keys()];
  }

  /**
   * Register multiple services at once.
   *
   * @param {Object} registrations - { name: factory } or { name: { factory, options } }
   * @returns {ServiceContainer} this (for chaining)
   */
  registerAll(registrations) {
    for (const [name, config] of Object.entries(registrations)) {
      if (typeof config === 'function') {
        this.register(name, config);
      } else if (config && typeof config.factory === 'function') {
        this.register(name, config.factory, config.options || {});
      } else {
        throw new Error(`Invalid registration for '${name}': expected function or { factory, options }`);
      }
    }
    return this;
  }

  /**
   * Set a pre-created instance directly (useful for testing or external services).
   *
   * @param {string} name - Service name
   * @param {any} instance - Pre-created instance
   * @returns {ServiceContainer} this (for chaining)
   */
  set(name, instance) {
    // Register a simple factory that returns the instance
    this._factories.set(name, { factory: () => instance, options: { singleton: true } });
    this._instances.set(name, instance);
    return this;
  }

  /**
   * Clear all cached instances (services will be recreated on next get()).
   * Useful for testing.
   */
  reset() {
    this._instances.clear();
  }

  /**
   * Clear a specific cached instance.
   *
   * @param {string} name - Service name
   */
  resetInstance(name) {
    this._instances.delete(name);
  }

  /**
   * Dispose all services that have dispose/close/destroy methods.
   * Called during shutdown.
   *
   * @returns {Promise<void>}
   */
  async dispose() {
    const errors = [];

    for (const [name, instance] of this._instances) {
      if (!instance) continue;

      const disposeMethod = instance.dispose || instance.close || instance.destroy;
      if (typeof disposeMethod === 'function') {
        try {
          await disposeMethod.call(instance);
        } catch (e) {
          errors.push({ service: name, error: e });
        }
      }
    }

    this._instances.clear();

    if (errors.length > 0) {
      const messages = errors.map(e => `${e.service}: ${e.error.message}`).join('; ');
      throw new Error(`Errors during dispose: ${messages}`);
    }
  }

  /**
   * List all registered service names.
   *
   * @returns {string[]}
   */
  listServices() {
    return [...this._factories.keys()];
  }

  /**
   * Get dependency information for a service.
   *
   * @param {string} name - Service name
   * @returns {string[]|null}
   */
  getDependencies(name) {
    return this._dependencies.get(name) || null;
  }

  /**
   * Validate that all declared dependencies are registered.
   *
   * @returns {{ valid: boolean, missing: Array<{ service: string, dependency: string }> }}
   */
  validateDependencies() {
    const missing = [];

    for (const [name, deps] of this._dependencies) {
      for (const dep of deps) {
        if (!this._factories.has(dep)) {
          missing.push({ service: name, dependency: dep });
        }
      }
    }

    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Create a child container that inherits registrations.
   * Child registrations override parent; parent instances are shared.
   *
   * @returns {ServiceContainer}
   */
  createChild() {
    const child = new ServiceContainer();

    // Copy factories (child can override)
    for (const [name, registration] of this._factories) {
      child._factories.set(name, registration);
    }

    // Copy groups
    for (const [groupName, names] of this._groups) {
      child._groups.set(groupName, new Set(names));
    }

    // Track which services the child has overridden
    child._overridden = new Set();

    // Share parent instances (singletons are truly shared)
    // Child can still override by re-registering
    child._parentInstances = this._instances;

    // Override register to track overrides
    const originalRegister = child.register.bind(child);
    child.register = (name, factory, options = {}) => {
      child._overridden.add(name);
      return originalRegister(name, factory, options);
    };

    // Override get to check parent instances only if not overridden
    const originalGet = child.get.bind(child);
    child.get = (name) => {
      // Child's own instance takes priority
      if (child._instances.has(name)) {
        return child._instances.get(name);
      }
      // If child overrode the service, use child's factory
      if (child._overridden && child._overridden.has(name)) {
        return originalGet(name);
      }
      // Fall back to parent instance
      if (child._parentInstances && child._parentInstances.has(name)) {
        return child._parentInstances.get(name);
      }
      return originalGet(name);
    };

    return child;
  }

  /**
   * Get a summary of container state (for debugging).
   *
   * @returns {Object}
   */
  getStatus() {
    return {
      registeredServices: this._factories.size,
      instantiatedServices: this._instances.size,
      groups: [...this._groups.keys()],
      services: this.listServices(),
      instantiated: [...this._instances.keys()]
    };
  }
}

module.exports = ServiceContainer;
