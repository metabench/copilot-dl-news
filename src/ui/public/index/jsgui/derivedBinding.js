import { createTx } from './tx.js';

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function readValues(model, props) {
  const snapshot = {};
  for (const prop of props) {
    snapshot[prop] = typeof model.get === 'function' ? model.get(prop) : undefined;
  }
  return snapshot;
}

export function createDerivedBinding({
  source,
  inputs,
  derive,
  target,
  targetProp,
  targetOptions,
  apply,
  immediate = true,
  txFactory = createTx
}) {
  if (!source || typeof source.onChange !== 'function') {
    throw new TypeError('createDerivedBinding requires a source DataModel with onChange');
  }
  if (typeof derive !== 'function') {
    throw new TypeError('createDerivedBinding requires a derive function');
  }

  const props = ensureArray(inputs);
  if (props.length === 0) {
    throw new Error('createDerivedBinding requires at least one input property');
  }

  let currentTx = null;
  let stopped = false;

  const writer = (() => {
    if (typeof apply === 'function') {
      return apply;
    }
    if (!target || typeof target.set !== 'function') {
      return null;
    }
    return (value, meta) => {
      const tx = meta.tx;
      const baseOptions = { force: true, ...(targetOptions || {}), tx };
      if (typeof targetProp === 'string') {
        target.set(targetProp, value, baseOptions);
      } else if (typeof target.replace === 'function' && value && typeof value === 'object') {
        target.replace(value, baseOptions);
      } else {
        target.set('value', value, baseOptions);
      }
    };
  })();

  function evaluate(payload = {}) {
    if (stopped) return;
    if (payload && payload.tx && payload.tx === currentTx) {
      return;
    }
    const tx = txFactory();
    currentTx = tx;
    const values = readValues(source, props);
    const result = derive({ values, payload, source, tx });
    if (result !== undefined && writer) {
      writer(result, { tx, payload });
    }
    currentTx = null;
  }

  const unsubscribes = props.map((prop) => {
    if (typeof source.onChange === 'function') {
      return source.onChange(prop, (payload) => evaluate(payload));
    }
    return () => {};
  });

  if (immediate) {
    evaluate({ initial: true });
  }

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const unsubscribe of unsubscribes) {
        try {
          if (typeof unsubscribe === 'function') unsubscribe();
        } catch (err) {
          console.error('[derivedBinding] failed to unsubscribe', err);
        }
      }
    }
  };
}
