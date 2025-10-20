let counter = 0;

export function nanoid(prefix = 'id') {
  counter += 1;
  const salt = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${salt}-${counter}`;
}
