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

const duplicate = () => 'outer';

export const exporters = {
  duplicate,
  forward(value) {
    return value;
  }
};
