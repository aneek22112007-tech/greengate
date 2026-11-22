import { describe, expect, it } from 'vitest';
import { mapLevel, parseMapping, PRESETS } from '../src/mapping.js';

describe('mapping presets', () => {
  it('uses strict by default', () => {
    expect(parseMapping()).toEqual(PRESETS.strict);
    expect(parseMapping('strict')).toEqual({ low: 'full', moderate: 'eco', high: 'off' });
  });

  it('uses the gentle preset', () => {
    expect(parseMapping('gentle')).toEqual(PRESETS.gentle);
    expect(mapLevel('moderate', parseMapping('gentle'))).toBe('full');
    expect(mapLevel('high', parseMapping('gentle'))).toBe('eco');
  });

  it('parses a custom low=full,moderate=eco,high=off string', () => {
    const mapping = parseMapping('low=off,moderate=full,high=eco');
    expect(mapping).toEqual({ low: 'off', moderate: 'full', high: 'eco' });
  });

  it('keeps strict defaults for unknown pairs', () => {
    expect(parseMapping('low=eco,nope=off')).toEqual({ low: 'eco', moderate: 'eco', high: 'off' });
  });
});
