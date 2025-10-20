export function showElement(element) {
  if (!element) return;
  element.classList.remove('is-hidden');
}

export function hideElement(element) {
  if (!element) return;
  element.classList.add('is-hidden');
}

export function setElementVisibility(element, isVisible) {
  if (!element) return;
  if (isVisible) {
    showElement(element);
  } else {
    hideElement(element);
  }
}
