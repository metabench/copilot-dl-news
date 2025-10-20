// src/ui/public/index/domUtils.js
function showElement(element) {
  if (!element) return;
  element.classList.remove("is-hidden");
}
function hideElement(element) {
  if (!element) return;
  element.classList.add("is-hidden");
}
function setElementVisibility(element, isVisible) {
  if (!element) return;
  if (isVisible) {
    showElement(element);
  } else {
    hideElement(element);
  }
}

export {
  showElement,
  hideElement,
  setElementVisibility
};
