'use strict';

/**
 * MicroProlog Engine — Core SLD Resolution
 * 
 * **CRITICAL**: This module is ISOLATED and NOT in current execution path.
 * 
 * Purpose: SLD resolution with backtracking for Horn clauses.
 * 
 * Features:
 * - Depth-first, left-to-right goal selection
 * - Backtracking on failure
 * - Time budget enforcement
 * - Step counter for infinite loop prevention
 * - Proof tree generation for explainability
 * - Cancellation support
 * 
 * Status: Design phase — DO NOT import in production code yet
 */

const { Variable, Compound } = require('./terms');

/**
 * Trail: stack of variable bindings for backtracking.
 */
class MicroPrologTrail {
  constructor() {
    this.bindings = []; // Array<{ var: Variable, oldValue: Term|null }>
  }

  bind(variable, value) {
    this.bindings.push({ var: variable, oldValue: variable.binding });
    variable.binding = value;
  }

  unwind(mark) {
    while (this.bindings.length > mark) {
      const { var: v, oldValue } = this.bindings.pop();
      v.binding = oldValue;
    }
  }

  mark() {
    return this.bindings.length;
  }
}

/**
 * Choice point: alternative clauses for backtracking.
 */
class MicroPrologChoicePoint {
  constructor(goal, clauses, depth, trail) {
    this.goal = goal; // Compound term
    this.clauses = clauses; // Remaining clauses to try
    this.depth = depth;
    this.trailMark = trail.mark();
  }
}

/**
 * Query result: bindings for a solution.
 */
class MicroPrologSolution {
  constructor(bindings, proof) {
    this.bindings = bindings; // Map<string, Term>
    this.proof = proof; // ProofTree node
  }
}

/**
 * Proof tree node for explainability.
 */
class ProofNode {
  constructor(goal, clause = null, children = []) {
    this.goal = goal; // Compound term
    this.clause = clause; // Clause used (null for built-ins)
    this.children = children; // Array<ProofNode>
  }

  toString(indent = 0) {
    const pad = '  '.repeat(indent);
    let str = `${pad}${this.goal.toString()}`;
    if (this.clause) {
      str += ` [${this.clause.head.functor}/${this.clause.head.arity}]`;
    }
    if (this.children.length > 0) {
      str += '\n' + this.children.map(c => c.toString(indent + 1)).join('\n');
    }
    return str;
  }
}

/**
 * MicroProlog Engine: SLD resolution with backtracking.
 */
class MicroPrologEngine {
  constructor(kb, options, builtins = null) {
    this.kb = kb; // MicroPrologKnowledgeBase
    this.options = options; // MicroPrologOptions
    this.builtins = builtins; // MicroPrologBuiltins
    this.trail = new MicroPrologTrail();
    this.choiceStack = [];
    this.steps = 0;
    this.startTime = null;
    this.cancelled = false;
  }

  /**
   * Query the knowledge base.
   * @param {Array<Compound>} goals - Initial goal list
   * @param {Object} [context] - Optional context { cancelled: () => boolean }
   * @returns {Array<MicroPrologSolution>} Solutions
   */
  query(goals, context = {}) {
    this.steps = 0;
    this.startTime = Date.now();
    this.cancelled = false;

    const solutions = [];
    const initialVars = this._collectVariables(goals);
    const proof = new ProofNode(new Compound('query', goals));

    try {
      this._solve(goals, 0, proof, (bindings, proofTree) => {
        const solution = new MicroPrologSolution(bindings, proofTree);
        solutions.push(solution);

        if (solutions.length >= this.options.maxSolutions) {
          return false; // Stop search
        }
        return true; // Continue search
      }, context);
    } catch (err) {
      if (err.message !== 'budget-exceeded' && err.message !== 'cancelled') {
        throw err;
      }
    }

    return solutions;
  }

  /**
   * Solve goals recursively with backtracking.
   * @private
   */
  _solve(goals, depth, proof, onSolution, context) {
    this.steps++;

    // Budget checks
    if (this.steps > this.options.maxSteps) {
      throw new Error('budget-exceeded');
    }
    if (Date.now() - this.startTime > this.options.budgetMs) {
      throw new Error('budget-exceeded');
    }
    if (context.cancelled && context.cancelled()) {
      this.cancelled = true;
      throw new Error('cancelled');
    }
    if (depth > this.options.maxDepth) {
      return false; // Depth limit
    }

    // Base case: all goals solved
    if (goals.length === 0) {
      const bindings = this._extractBindings();
      const shouldContinue = onSolution(bindings, proof);
      return shouldContinue;
    }

    // Select first goal (left-to-right)
    const [currentGoal, ...restGoals] = goals;

    // Check built-ins first
    if (this.builtins && this.builtins.isBuiltin(currentGoal.functor)) {
      const result = this.builtins.call(currentGoal, this.trail);
      if (result) {
        const child = new ProofNode(currentGoal, null);
        proof.children.push(child);
        return this._solve(restGoals, depth, proof, onSolution, context);
      }
      return false; // Built-in failed
    }

    // Fetch matching clauses from KB
    const clauses = this.kb.getClauses(currentGoal.functor, currentGoal.arity);

    for (const clause of clauses) {
      const trailMark = this.trail.mark();
      const renamedClause = this._renameClause(clause, depth);

      // Try to unify goal with clause head
      if (this._unify(currentGoal, renamedClause.head)) {
        const child = new ProofNode(currentGoal, renamedClause);
        proof.children.push(child);

        // Add clause body goals before rest
        const newGoals = [...renamedClause.body, ...restGoals];
        const success = this._solve(newGoals, depth + 1, child, onSolution, context);

        if (success === false) {
          return false; // Propagate "stop search" signal
        }

        // Backtrack: undo bindings
        this.trail.unwind(trailMark);
        proof.children.pop();
      } else {
        // Unification failed: try next clause
        this.trail.unwind(trailMark);
      }
    }

    return true; // Exhausted clauses, continue search
  }

  /**
   * Unify two terms.
   * @private
   */
  _unify(term1, term2) {
    const t1 = term1 instanceof Variable ? term1.deref() : term1;
    const t2 = term2 instanceof Variable ? term2.deref() : term2;

    // Both variables
    if (t1 instanceof Variable && t2 instanceof Variable) {
      if (t1 === t2) return true;
      this.trail.bind(t1, t2);
      return true;
    }

    // One variable
    if (t1 instanceof Variable) {
      if (this.options.occursCheck && this._occurs(t1, t2)) {
        return false;
      }
      this.trail.bind(t1, t2);
      return true;
    }
    if (t2 instanceof Variable) {
      if (this.options.occursCheck && this._occurs(t2, t1)) {
        return false;
      }
      this.trail.bind(t2, t1);
      return true;
    }

    // Both ground: structural equality
    if (t1.type !== t2.type) return false;

    if (t1.type === 'atom' || t1.type === 'number') {
      return t1.equals(t2);
    }

    if (t1.type === 'compound') {
      if (t1.functor !== t2.functor || t1.arity !== t2.arity) {
        return false;
      }
      for (let i = 0; i < t1.arity; i++) {
        if (!this._unify(t1.args[i], t2.args[i])) {
          return false;
        }
      }
      return true;
    }

    if (t1.type === 'list') {
      // Convert to cons representation and unify
      const cons1 = t1.toCons();
      const cons2 = t2.toCons();
      return this._unify(cons1, cons2);
    }

    return false;
  }

  /**
   * Occurs check: does var appear in term?
   * @private
   */
  _occurs(variable, term) {
    const t = term instanceof Variable ? term.deref() : term;
    if (t === variable) return true;
    if (t instanceof Variable) return false;
    if (t.type === 'compound') {
      return t.args.some(arg => this._occurs(variable, arg));
    }
    if (t.type === 'list') {
      return t.elements.some(el => this._occurs(variable, el));
    }
    return false;
  }

  /**
   * Rename clause variables for standardization-apart.
   * @private
   */
  _renameClause(clause, depth) {
    const varMap = new Map();
    const renameVar = (v) => {
      if (!varMap.has(v.name)) {
        varMap.set(v.name, new Variable(`${v.name}_${depth}`));
      }
      return varMap.get(v.name);
    };

    const renameTerm = (term) => {
      if (term instanceof Variable) {
        return renameVar(term);
      }
      if (term.type === 'compound') {
        return new Compound(term.functor, term.args.map(renameTerm));
      }
      return term; // Atoms, numbers unchanged
    };

    const newHead = renameTerm(clause.head);
    const newBody = clause.body.map(renameTerm);
    return { head: newHead, body: newBody };
  }

  /**
   * Collect all variables from goals.
   * @private
   */
  _collectVariables(goals) {
    const vars = new Set();
    for (const goal of goals) {
      for (const v of goal.variables()) {
        vars.add(v);
      }
    }
    return Array.from(vars);
  }

  /**
   * Extract current bindings for variables.
   * @private
   */
  _extractBindings() {
    const bindings = new Map();
    for (const binding of this.trail.bindings) {
      const v = binding.var;
      if (v.binding) {
        bindings.set(v.name, v.binding);
      }
    }
    return bindings;
  }
}

module.exports = {
  MicroPrologEngine,
  MicroPrologTrail,
  MicroPrologChoicePoint,
  MicroPrologSolution,
  ProofNode
};
