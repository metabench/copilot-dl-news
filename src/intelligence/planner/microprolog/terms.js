'use strict';

/**
 * MicroProlog Inner Core — Base Classes and Interfaces
 * 
 * **CRITICAL**: This module is ISOLATED and NOT in current execution path.
 * 
 * Purpose: Provide symbolic reasoning via Horn-clause logic for:
 * - Seed validation (robots.txt compliance, trap detection)
 * - Conflict detection (contradictions in allowlists)
 * - Heuristic amplification (graph novelty + strict rules)
 * - Counterfactual analysis ("what must change to admit this hub?")
 * 
 * Architecture:
 * - SLD resolution with backtracking
 * - Proof trees for explainability
 * - Time-boxed, cancelable queries
 * - No side effects in preview mode
 * 
 * Status: Design phase — DO NOT import in production code yet
 */

/**
 * Abstract base class for all Prolog terms.
 * 
 * Hierarchy:
 * - Atom: symbolic constant
 * - Variable: unbound or bound to another term
 * - NumberTerm: numeric literal (int or float)
 * - Compound: functor(arg1, arg2, ...)
 * - ListTerm: syntactic sugar [head|tail]
 */
class MicroPrologTerm {
  constructor(type) {
    this.type = type; // 'atom' | 'var' | 'number' | 'compound' | 'list'
  }

  /**
   * Check if term is ground (no unbound variables).
   * @returns {boolean}
   */
  isGround() {
    throw new Error('isGround() must be implemented by subclass');
  }

  /**
   * Get all variables in term.
   * @returns {Array<Variable>}
   */
  variables() {
    throw new Error('variables() must be implemented by subclass');
  }

  /**
   * Stringify term for display.
   * @returns {string}
   */
  toString() {
    throw new Error('toString() must be implemented by subclass');
  }

  /**
   * Deep equality check.
   * @param {MicroPrologTerm} other
   * @returns {boolean}
   */
  equals(other) {
    throw new Error('equals() must be implemented by subclass');
  }
}

/**
 * Atom: symbolic constant (e.g., 'hub', 'news', 'robots_allow')
 */
class Atom extends MicroPrologTerm {
  constructor(name) {
    super('atom');
    this.name = name;
  }

  isGround() { return true; }
  variables() { return []; }
  toString() { return this.name; }
  equals(other) {
    return other instanceof Atom && other.name === this.name;
  }
}

/**
 * Variable: unbound or bound to another term (e.g., X, URL, _)
 */
class Variable extends MicroPrologTerm {
  constructor(name) {
    super('var');
    this.name = name;
    this.binding = null; // Bound to another term, or null if unbound
  }

  isGround() {
    return this.binding !== null && this.binding.isGround();
  }

  variables() {
    if (this.binding) {
      return this.binding.variables();
    }
    return [this];
  }

  deref() {
    if (this.binding) {
      return this.binding.deref ? this.binding.deref() : this.binding;
    }
    return this;
  }

  toString() {
    if (this.binding) {
      return this.binding.toString();
    }
    return this.name;
  }

  equals(other) {
    if (this.binding) {
      return this.binding.equals(other);
    }
    return other instanceof Variable && other.name === this.name && !other.binding;
  }
}

/**
 * NumberTerm: numeric literal (int or float)
 */
class NumberTerm extends MicroPrologTerm {
  constructor(value) {
    super('number');
    this.value = value;
  }

  isGround() { return true; }
  variables() { return []; }
  toString() { return String(this.value); }
  equals(other) {
    return other instanceof NumberTerm && other.value === this.value;
  }
}

/**
 * Compound: functor(arg1, arg2, ...) or functor/arity
 * Examples: hub(URL), safe_seed(X, why(R1, F2))
 */
class Compound extends MicroPrologTerm {
  constructor(functor, args) {
    super('compound');
    this.functor = functor; // string
    this.args = args; // Array<MicroPrologTerm>
    this.arity = args.length;
  }

  isGround() {
    return this.args.every(arg => arg.isGround());
  }

  variables() {
    return this.args.flatMap(arg => arg.variables());
  }

  toString() {
    if (this.arity === 0) {
      return this.functor;
    }
    return `${this.functor}(${this.args.map(a => a.toString()).join(', ')})`;
  }

  equals(other) {
    if (!(other instanceof Compound)) return false;
    if (this.functor !== other.functor || this.arity !== other.arity) return false;
    return this.args.every((arg, i) => arg.equals(other.args[i]));
  }
}

/**
 * ListTerm: syntactic sugar for [head|tail] or []
 * Internally represented as .(head, tail) compound or [] atom
 */
class ListTerm extends MicroPrologTerm {
  constructor(elements) {
    super('list');
    this.elements = elements; // Array<MicroPrologTerm>
  }

  isGround() {
    return this.elements.every(el => el.isGround());
  }

  variables() {
    return this.elements.flatMap(el => el.variables());
  }

  toString() {
    return `[${this.elements.map(e => e.toString()).join(', ')}]`;
  }

  equals(other) {
    if (!(other instanceof ListTerm)) return false;
    if (this.elements.length !== other.elements.length) return false;
    return this.elements.every((el, i) => el.equals(other.elements[i]));
  }

  /**
   * Convert to canonical cons representation: .(head, tail)
   * @returns {MicroPrologTerm}
   */
  toCons() {
    if (this.elements.length === 0) {
      return new Atom('[]');
    }
    return this.elements.reduceRight(
      (tail, head) => new Compound('.', [head, tail]),
      new Atom('[]')
    );
  }
}

/**
 * Clause: head :- body₁, ..., bodyₙ
 * Facts are clauses with empty body.
 */
class MicroPrologClause {
  constructor(head, body = []) {
    this.head = head; // Compound term
    this.body = body; // Array<Compound>
    this.isFact = body.length === 0;
  }

  toString() {
    if (this.isFact) {
      return `${this.head.toString()}.`;
    }
    return `${this.head.toString()} :- ${this.body.map(b => b.toString()).join(', ')}.`;
  }
}

/**
 * Options for MicroProlog engine.
 */
class MicroPrologOptions {
  constructor({
    maxDepth = 100,
    maxSolutions = 100,
    maxSteps = 10000,
    budgetMs = 700,
    occursCheck = false,
    trace = false
  } = {}) {
    this.maxDepth = maxDepth;
    this.maxSolutions = maxSolutions;
    this.maxSteps = maxSteps;
    this.budgetMs = budgetMs;
    this.occursCheck = occursCheck;
    this.trace = trace;
  }
}

module.exports = {
  MicroPrologTerm,
  Atom,
  Variable,
  NumberTerm,
  Compound,
  ListTerm,
  MicroPrologClause,
  MicroPrologOptions
};
