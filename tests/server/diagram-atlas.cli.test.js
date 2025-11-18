const { parseServerArgs } = require('../../src/ui/server/diagramAtlasServer');

describe('parseServerArgs', () => {

  it('uses defaults when no args are provided', () => {
    const result = parseServerArgs([], {});
    expect(result.host).toBe('0.0.0.0');
    expect(result.port).toBe(4620);
    expect(result.explicitHost).toBe(false);
    expect(result.explicitPort).toBe(false);
  });

  it('accepts CLI flags for host and port', () => {
    const result = parseServerArgs(['--host', 'localhost', '--port', '5555']);
    expect(result.host).toBe('localhost');
    expect(result.port).toBe(5555);
    expect(result.explicitHost).toBe(true);
    expect(result.explicitPort).toBe(true);
  });

  it('accepts positional host and port arguments', () => {
    const result = parseServerArgs(['localhost', '6001']);
    expect(result.host).toBe('localhost');
    expect(result.port).toBe(6001);
    expect(result.explicitHost).toBe(true);
    expect(result.explicitPort).toBe(true);
  });

  it('overrides defaults when env vars are present', () => {
    const env = {
      PORT: '7001',
      HOST: '127.0.0.1'
    };
    const result = parseServerArgs([], env);
    expect(result.host).toBe('127.0.0.1');
    expect(result.port).toBe(7001);
    expect(result.explicitHost).toBe(true);
    expect(result.explicitPort).toBe(true);
  });
});
