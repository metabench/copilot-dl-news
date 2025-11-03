export class NewsSummary {
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
