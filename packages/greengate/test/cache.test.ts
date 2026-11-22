import { describe, expect, it } from 'vitest';
import { TtlCache } from '../src/cache.js';

describe('ttl cache', () => {
  it('serves a fresh value, then a stale value, then nothing', () => {
    let now = 0;
    const cache = new TtlCache<string>(1_000, 5_000, () => now);
    cache.set('IN-SO', 'low');

    expect(cache.get('IN-SO')).toEqual({ value: 'low', fresh: true, ageMs: 0 });

    now = 1_500;
    expect(cache.get('IN-SO')).toEqual({ value: 'low', fresh: false, ageMs: 1_500 });

    now = 5_001;
    expect(cache.get('IN-SO')).toBeNull();
  });
});
