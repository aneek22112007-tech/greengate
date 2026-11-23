import { describe, expect, it } from 'vitest';
import { evaluateRequest, greengateMiddleware } from '../src/express.js';
import { createGreenGate } from '../src/greengate.js';
import type { CarbonLevel, FlagsmithFlags, FlagsmithLike } from '../src/types.js';

function fakeFlagsmith(value: string, enabled = true, seen?: { traits?: Record<string, string | number | boolean> }): FlagsmithLike {
  return {
    async getIdentityFlags(_identifier, traits) {
      if (seen) seen.traits = traits;
      const flags: FlagsmithFlags = {
        isFeatureEnabled: (name) => (name === 'greengate_enabled' ? enabled : true),
        getFeatureValue: () => value,
      };
      return flags;
    },
  };
}

function jsonResponse(level: CarbonLevel, zone: string): Response {
  return new Response(JSON.stringify({ zone, data: [{ level, datetime: '2026-11-23T00:00:00Z' }] }), { status: 200 });
}

describe('createGreenGate', () => {
  it('asks Flagsmith with carbon traits and uses the returned variant', async () => {
    const seen: { traits?: Record<string, string | number | boolean> } = {};
    const gate = createGreenGate({
      flagsmith: fakeFlagsmith('eco', true, seen),
      mockLevel: 'moderate',
      mode: 'traits',
    });
    const evaluation = await gate.evaluate('user-1', { plan: 'free' });
    expect(evaluation.variant).toBe('eco');
    expect(evaluation.source).toBe('flagsmith');
    expect(evaluation.simulated).toBe(true);
    expect(evaluation.carbonSource).toBe('simulated');
    expect(seen.traits).toMatchObject({
      plan: 'free',
      carbon_level: 'moderate',
      grid_zone: 'IN-SO',
      greengate_suggested_variant: 'eco',
    });
  });

  it('falls back to the local mapping when Flagsmith is unreachable', async () => {
    const gate = createGreenGate({
      flagsmith: {
        async getIdentityFlags() {
          throw new Error('connect ECONNREFUSED');
        },
      },
      mockLevel: 'high',
      mode: 'traits',
    });
    const evaluation = await gate.evaluate('user-down');
    expect(evaluation.variant).toBe('off');
    expect(evaluation.source).toBe('local');
    expect(evaluation.flags.greengate_suggested_variant).toBe('off');
  });

  it('forces full when the kill switch is off', async () => {
    const gate = createGreenGate({
      flagsmith: fakeFlagsmith('off', false),
      mockLevel: 'high',
      mode: 'traits',
    });
    const evaluation = await gate.evaluate('user-2');
    expect(evaluation.variant).toBe('full');
    expect(evaluation.flags.greengate_enabled).toBe(false);
    expect(evaluation.source).toBe('flagsmith');
  });

  it('forces the mapped variant in override mode, unless the kill switch is off', async () => {
    const overridden = createGreenGate({
      flagsmith: fakeFlagsmith('full', true),
      mockLevel: 'high',
      mode: 'override',
    });
    expect((await overridden.evaluate('user-3')).variant).toBe('off');

    const killed = createGreenGate({
      flagsmith: fakeFlagsmith('off', false),
      mockLevel: 'low',
      mode: 'override',
    });
    expect((await killed.evaluate('user-4')).variant).toBe('full');
    expect((await killed.evaluate('user-4')).source).toBe('override');
  });

  it('falls back locally when no Flagsmith client is configured', async () => {
    const gate = createGreenGate({ mockLevel: 'low' });
    const evaluation = await gate.evaluate('user-5');
    expect(evaluation).toMatchObject({ variant: 'full', source: 'local', carbonLevel: 'low' });
  });

  it('walks the cache fallback chain: fresh, stale, then moderate', async () => {
    let now = 0;
    let fail = false;
    const fetchImpl: typeof fetch = async () => {
      if (fail) throw new Error('upstream down');
      return jsonResponse('low', 'DE');
    };
    const gate = createGreenGate({
      electricityMapsToken: 'token',
      fetchImpl,
      now: () => now,
      cacheTtlMs: 1_000,
      staleMs: 5_000,
      defaultZone: 'DE',
    });

    const fresh = await gate.evaluate('user', undefined, { zone: 'DE' });
    expect(fresh).toMatchObject({ carbonLevel: 'low', carbonSource: 'electricity-maps', simulated: false });

    now = 2_000;
    fail = true;
    const stale = await gate.evaluate('user', undefined, { zone: 'DE' });
    expect(stale).toMatchObject({ carbonLevel: 'low', carbonSource: 'stale-cache', simulated: false });

    now = 6_000;
    const fallback = await gate.evaluate('user', undefined, { zone: 'DE' });
    expect(fallback).toMatchObject({ carbonLevel: 'moderate', carbonSource: 'default', simulated: true, zone: 'DE' });
  });

  it('does not call the network when the level is forced', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('should not be called');
    };
    const seen: { traits?: Record<string, string | number | boolean> } = {};
    const gate = createGreenGate({
      flagsmith: fakeFlagsmith('off', true, seen),
      electricityMapsToken: 'token',
      fetchImpl,
    });
    const evaluation = await gate.evaluate('user', undefined, { forceLevel: 'high', zone: 'FR' });
    expect(evaluation.carbonLevel).toBe('high');
    expect(evaluation.variant).toBe('off');
    expect(seen.traits?.carbon_level).toBe('high');
  });
});

describe('express helpers', () => {
  it('attaches req.greengate from the cookie', async () => {
    const gate = createGreenGate({ mockLevel: 'moderate' });
    const middleware = greengateMiddleware(gate);
    const req: { cookies: Record<string, string>; headers: Record<string, string>; greengate?: unknown } = {
      cookies: { gg_uid: 'cookie-user' },
      headers: {},
    };
    await new Promise<void>((resolve, reject) => {
      void middleware(req, {}, (error) => (error ? reject(error) : resolve()));
    });
    expect(req.greengate).toMatchObject({ variant: 'eco', source: 'local' });
  });

  it('evaluates a framework-free request', async () => {
    const gate = createGreenGate({ mockLevel: 'low' });
    const evaluation = await evaluateRequest(gate, {
      identifier: 'reader',
      headers: { 'cf-ipcountry': 'FR' },
    });
    expect(evaluation.zone).toBe('FR');
    expect(evaluation.variant).toBe('full');
  });
});
