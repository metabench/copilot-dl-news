import { tof } from 'lang-tools';

let counter = 0;

function nextCounter() {
  counter = (counter + 1) % 0x7fffffff;
  return counter || nextCounter();
}

export function createTx(prefix = 'tx') {
  const stamp = Date.now().toString(36);
  const id = nextCounter().toString(36);
  return `${prefix}-${stamp}-${id}`;
}

export function withTx(options = {}, tx) {
  if (options && tof(options) === 'object') {
    return { ...options, tx };
  }
  return { tx };
}
