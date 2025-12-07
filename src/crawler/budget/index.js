'use strict';

/**
 * Budget module - Resource tracking and enforcement.
 *
 * @module crawler/budget
 */

const ResourceBudget = require('./ResourceBudget');
const { BudgetExhaustedError } = ResourceBudget;

module.exports = {
  ResourceBudget,
  BudgetExhaustedError,

  // Re-export constants for convenience
  RESOURCES: ResourceBudget.RESOURCES
};
