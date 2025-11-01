export function alpha() {
  return 'alpha';
}

function beta() {
  const inner = () => 'beta';
  return inner();
}

export default function defaultHandler() {
  return beta();
}

const gamma = () => {
  return 'gamma';
};
