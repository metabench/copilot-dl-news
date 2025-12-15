"use strict";

function unwrapDataValue(value) {
	if (value && typeof value === "object" && value.__data_value) return value.value;
	return value;
}

function getModelValue(model, key, fallback) {
	if (!model || typeof model.get !== "function") return fallback;
	const raw = unwrapDataValue(model.get(key));
	return raw === undefined ? fallback : raw;
}

function setModelValue(model, key, value) {
	if (!model) return;
	if (typeof model.set === "function") {
		model.set(key, value);
		return;
	}
	model[key] = value;
}

function listenModelChange(model, handler) {
	if (!model || typeof model.on !== "function") return () => {};
	model.on("change", handler);
	return () => {
		if (typeof model.off === "function") model.off("change", handler);
	};
}

function resolveElement({ el, rootEl, selector }) {
	if (el) return el;
	if (rootEl && selector) {
		try {
			return rootEl.querySelector(selector);
		} catch {
			return null;
		}
	}
	return null;
}

function createBindingManager() {
	const disposers = [];
	return {
		add(dispose) {
			if (typeof dispose === "function") disposers.push(dispose);
		},
		dispose() {
			while (disposers.length) {
				const fn = disposers.pop();
				try {
					fn();
				} catch {
					// ignore
				}
			}
		}
	};
}

function bindModelToModel({
	sourceModel,
	sourceProp,
	targetModel,
	targetProp,
	transform,
	immediate = true
}) {
	const apply = () => {
		const value = getModelValue(sourceModel, sourceProp, undefined);
		setModelValue(targetModel, targetProp, transform ? transform(value) : value);
	};

	if (immediate) apply();

	const dispose = listenModelChange(sourceModel, e => {
		if (!e || e.name === sourceProp) apply();
	});

	return { apply, dispose };
}

function bindText({ model, prop, el, rootEl, selector, format, immediate = true }) {
	const target = resolveElement({ el, rootEl, selector });

	const render = () => {
		if (!target) return;
		const value = getModelValue(model, prop, "");
		const next = format ? format(value) : value;
		target.textContent = next == null ? "" : String(next);
	};

	if (immediate) render();

	const dispose = listenModelChange(model, e => {
		if (!e || e.name === prop) render();
	});

	return { render, dispose };
}

function bindAttribute({ model, prop, el, rootEl, selector, attrName, format, immediate = true }) {
	const target = resolveElement({ el, rootEl, selector });

	const render = () => {
		if (!target || typeof target.setAttribute !== "function") return;
		const value = getModelValue(model, prop, "");
		const next = format ? format(value) : value;
		target.setAttribute(attrName, next == null ? "" : String(next));
	};

	if (immediate) render();

	const dispose = listenModelChange(model, e => {
		if (!e || e.name === prop) render();
	});

	return { render, dispose };
}

function bindToggleClass({ model, prop, el, rootEl, selector, className, truthy, immediate = true }) {
	const target = resolveElement({ el, rootEl, selector });
	const isTruthy = truthy || ((v) => !!v);

	const render = () => {
		if (!target || !target.classList) return;
		const value = getModelValue(model, prop, false);
		if (isTruthy(value)) target.classList.add(className);
		else target.classList.remove(className);
	};

	if (immediate) render();

	const dispose = listenModelChange(model, e => {
		if (!e || e.name === prop) render();
	});

	return { render, dispose };
}

module.exports = {
	createBindingManager,
	bindModelToModel,
	bindText,
	bindAttribute,
	bindToggleClass,
	getModelValue,
	setModelValue
};
