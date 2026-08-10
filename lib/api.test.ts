import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('browser API client', () => {
  it('uses the same-origin API with credentials and no-store caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api<{ ok: boolean }>('/health')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/health', expect.objectContaining({
      cache: 'no-store',
      credentials: 'include',
    }));
  });

  it('aborts a request that would otherwise leave the mobile UI loading forever', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));

    const request = expect(api('/slow', { timeoutMs: 50 }))
      .rejects.toThrow('The server took too long to respond');
    await vi.advanceTimersByTimeAsync(50);
    await request;
  });
});
