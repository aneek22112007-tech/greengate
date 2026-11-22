import { describe, expect, it } from 'vitest';
import { ElectricityMapsProvider, SimulatedProvider } from '../src/providers.js';

describe('carbon providers', () => {
  it('reads a level from a mocked Electricity Maps response', async () => {
    const calls: Array<{ url: string; auth: string | null; disable: string | null }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      calls.push({
        url: url.origin + url.pathname,
        auth: new Headers(init?.headers).get('auth-token'),
        disable: url.searchParams.get('disableCallerLookup'),
      });
      expect(url.searchParams.get('zone')).toBe('IN-SO');
      return new Response(JSON.stringify({ zone: 'IN-SO', data: [{ level: 'low', datetime: '2026-11-23T00:00:00Z' }] }), {
        status: 200,
      });
    };
    const provider = new ElectricityMapsProvider({ token: 'test-token', fetchImpl });
    const reading = await provider.getLevel({ zone: 'IN-SO' });
    expect(reading).toEqual({
      level: 'low',
      zone: 'IN-SO',
      datetime: '2026-11-23T00:00:00Z',
      simulated: false,
      source: 'electricity-maps',
    });
    expect(calls).toEqual([
      {
        url: 'https://api.electricitymaps.com/v4/carbon-intensity-level/latest',
        auth: 'test-token',
        disable: 'true',
      },
    ]);
  });

  it('rejects when the request is aborted by the timeout', async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'TimeoutError';
          reject(error);
        });
      });
    const provider = new ElectricityMapsProvider({ token: 'test-token', timeoutMs: 20, fetchImpl });
    await expect(provider.getLevel({ zone: 'DE' })).rejects.toThrow(/aborted/);
  });

  it('marks simulated readings', async () => {
    const reading = await new SimulatedProvider('high', 'FR').getLevel({});
    expect(reading.simulated).toBe(true);
    expect(reading.level).toBe('high');
    expect(reading.zone).toBe('FR');
    expect(reading.source).toBe('simulated');
  });
});
