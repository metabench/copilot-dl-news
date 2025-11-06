'use strict';

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const appendError = (errors, path, message) => {
  errors.push({ path, message });
};

const validateStepObject = (step, index, errors) => {
  const path = `steps[${index}]`;

  if (!isPlainObject(step)) {
    appendError(errors, path, 'Step object must be a plain object');
    return;
  }

  const op = step.operation || step.name;
  if (typeof op !== 'string' || op.trim().length === 0) {
    appendError(errors, `${path}.operation`, 'Step operation must be a non-empty string');
  }

  if (step.id !== undefined && (typeof step.id !== 'string' || step.id.trim().length === 0)) {
    appendError(errors, `${path}.id`, 'Step id must be a non-empty string when provided');
  }

  if (step.label !== undefined && (typeof step.label !== 'string' || step.label.trim().length === 0)) {
    appendError(errors, `${path}.label`, 'Step label must be a non-empty string when provided');
  }

  if (step.startUrl !== undefined && (typeof step.startUrl !== 'string' || step.startUrl.trim().length === 0)) {
    appendError(errors, `${path}.startUrl`, 'Step startUrl must be a non-empty string when provided');
  }

  if (step.overrides !== undefined && !isPlainObject(step.overrides)) {
    appendError(errors, `${path}.overrides`, 'Step overrides must be an object when provided');
  }

  if (step.continueOnError !== undefined && typeof step.continueOnError !== 'boolean') {
    appendError(errors, `${path}.continueOnError`, 'Step continueOnError must be a boolean when provided');
  }
};

const validateSequenceConfig = (config) => {
  const errors = [];

  if (!isPlainObject(config)) {
    appendError(errors, '', 'Configuration must be an object');
    return { valid: false, errors };
  }

  if (config.version !== undefined && (typeof config.version !== 'string' || config.version.trim().length === 0)) {
    appendError(errors, 'version', 'Version must be a non-empty string when provided');
  }

  if (config.host !== undefined && (typeof config.host !== 'string' || config.host.trim().length === 0)) {
    appendError(errors, 'host', 'Host must be a non-empty string when provided');
  }

  if (config.startUrl !== undefined && (typeof config.startUrl !== 'string' || config.startUrl.trim().length === 0)) {
    appendError(errors, 'startUrl', 'startUrl must be a non-empty string when provided');
  }

  if (config.sharedOverrides !== undefined && !isPlainObject(config.sharedOverrides)) {
    appendError(errors, 'sharedOverrides', 'sharedOverrides must be an object when provided');
  }

  if (!Array.isArray(config.steps) || config.steps.length === 0) {
    appendError(errors, 'steps', 'steps must be a non-empty array');
  } else {
    config.steps.forEach((step, index) => {
      if (typeof step === 'string') {
        if (step.trim().length === 0) {
          appendError(errors, `steps[${index}]`, 'Step string entries must be non-empty');
        }
        return;
      }

      validateStepObject(step, index, errors);
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

module.exports = {
  validateSequenceConfig
};
