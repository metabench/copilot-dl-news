'use strict';

const { PlacesInfoClient } = require('../PlacesInfoClient');

function createOkResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    async json() {
      return body;
    }
  };
}

function createErrorResponse({ status = 500, statusText = 'Internal Server Error', body = 'error' } = {}) {
  return {
    ok: false,
    status,
    statusText,
    async text() {
      return body;
    }
  };
}

describe('PlacesInfoClient', () => {
  test('fetchAdminAreas builds query parameters and returns JSON payload', async () => {
    const fetchMock = jest.fn(async () => createOkResponse({ features: [] }));
    const client = new PlacesInfoClient({
      baseUrl: 'http://example.test/api/',
      fetchImpl: fetchMock,
      defaultTimeoutMs: 0
    });

    const result = await client.fetchAdminAreas({
      country: 'GB',
      level: 1,
      minFeatures: 10,
      batchSize: 250,
      includeGeometry: true
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('http://example.test/v1/admin-areas?country=GB&level=1&minFeatures=10&batchSize=250&includeGeometry=true');
    expect(options.headers).toMatchObject({ Accept: 'application/json' });
    expect(result).toEqual({ features: [] });
  });

  test('fetchAdminAreas converts boolean flags and omits undefined values', async () => {
    const fetchMock = jest.fn(async () => createOkResponse({ features: [] }));
    const client = new PlacesInfoClient({
      baseUrl: 'http://example.test',
      fetchImpl: fetchMock,
      defaultTimeoutMs: 0
    });

    await client.fetchAdminAreas({ country: 'FR', includeGeometry: false });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://example.test/v1/admin-areas?country=FR&includeGeometry=false');
  });

  test('fetchAdminAreas requires a country parameter', async () => {
    const fetchMock = jest.fn();
    const client = new PlacesInfoClient({ fetchImpl: fetchMock, defaultTimeoutMs: 0 });

    await expect(client.fetchAdminAreas()).rejects.toThrow('country is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('fetchAdminAreas surfaces HTTP errors', async () => {
    const fetchMock = jest.fn(async () => createErrorResponse({ status: 502, statusText: 'Bad Gateway', body: 'upstream failed' }));
    const client = new PlacesInfoClient({ fetchImpl: fetchMock, defaultTimeoutMs: 0 });

    await expect(client.fetchAdminAreas({ country: 'DE' })).rejects.toThrow(/502/);
  });
});
