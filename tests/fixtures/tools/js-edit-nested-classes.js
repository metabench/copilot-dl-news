class BaseSummary {
  constructor() {
    this.items = [];
  }
}

export class NewsSummary extends BaseSummary {
  constructor(title, url = null) {
    super();
    this.title = title;
    this.url = url;
  }

  render() {
    function helper() {
      return 'helper';
    }

    const annotate = () => helper();
    return annotate();
  }

  static initialize(config) {
    return config ?? {};
  }

  get total() {
    return this.items?.length ?? 0;
  }
}

export class SecretBox {
  #counter = 0;

  constructor(initial = 0) {
    this.#counter = initial;
  }

  #increment() {
    this.#counter += 1;
    return this.#counter;
  }

  touch() {
    return this.#increment();
  }

  get value() {
    return this.#counter;
  }

  set value(next) {
    this.#counter = next;
  }
}

const duplicate = () => 'outer';

export const exporters = {
  duplicate,
  forward(value) {
    return value;
  }
};
