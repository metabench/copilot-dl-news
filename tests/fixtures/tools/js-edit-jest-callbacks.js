const setupSandbox = () => true;

describe('mission timers', () => {
  beforeEach(() => {
    setupSandbox();
  });

  afterAll(function teardownSuite() {
    return undefined;
  });

  it('captures arrow callbacks', () => {
    return 'arrow-callback';
  });

  test('captures function expressions', function callbackFn() {
    return 'function-callback';
  });

  describe('nested block', () => {
    it('propagates nested callbacks', () => {
      return 'nested-arrow';
    });
  });
});
