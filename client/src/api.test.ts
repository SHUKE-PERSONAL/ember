import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('API-key client wrappers', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('projects list responses to safe metadata at runtime', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      apiKeys: [{
        id: 'key-id',
        name: 'Agent sync',
        scopes: 'posts:write',
        expiresAt: null,
        lastUsedAt: null,
        createdAt: '2026-08-22T00:00:00.000Z',
        key: 'emb_should-not-leak',
        keyHash: 'hash-should-not-leak',
      }],
    }));

    const result = await api.apiKeys();

    expect(result).toEqual({
      apiKeys: [{
        id: 'key-id',
        name: 'Agent sync',
        scopes: 'posts:write',
        expiresAt: null,
        lastUsedAt: null,
        createdAt: '2026-08-22T00:00:00.000Z',
      }],
    });
    expect(result.apiKeys[0]).not.toHaveProperty('key');
    expect(result.apiKeys[0]).not.toHaveProperty('keyHash');
    expect(fetchMock).toHaveBeenCalledWith('/api/apikeys', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('creates with the supported fields and revokes by encoded id', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        id: 'key/id',
        name: 'Agent sync',
        scopes: 'posts:write',
        expiresAt: '2027-01-01T00:00:00.000Z',
        lastUsedAt: null,
        createdAt: '2026-08-22T00:00:00.000Z',
        key: 'emb_one-time-secret',
        keyHash: 'hash-should-not-leak',
      }))
      .mockResolvedValueOnce(jsonResponse(undefined, 204));

    const created = await api.createApiKey({
      name: 'Agent sync',
      scopes: 'posts:write',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    await api.revokeApiKey('key/id');

    expect(created).toEqual({
      id: 'key/id',
      name: 'Agent sync',
      scopes: 'posts:write',
      expiresAt: '2027-01-01T00:00:00.000Z',
      lastUsedAt: null,
      createdAt: '2026-08-22T00:00:00.000Z',
      key: 'emb_one-time-secret',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/apikeys', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({
        name: 'Agent sync',
        scopes: 'posts:write',
        expiresAt: '2027-01-01T00:00:00.000Z',
      }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/apikeys/key%2Fid', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'DELETE',
    });
  });
});
