import { describe, expect, it } from 'vitest';
import { resolveZone } from '../src/zone.js';

describe('zone order', () => {
  const everything = {
    explicitZone: 'DE',
    traits: { grid_zone: 'FR' },
    lat: 12.9,
    lon: 77.5,
    headers: { 'cf-ipcountry': 'US' },
  };

  it('prefers an explicit zone over the trait, coordinates, and headers', () => {
    expect(resolveZone(everything)).toEqual({ zone: 'DE', source: 'explicit' });
  });

  it('uses the grid_zone trait next', () => {
    expect(resolveZone({ ...everything, explicitZone: '  ' })).toEqual({ zone: 'FR', source: 'trait' });
  });

  it('uses lat and lon before CDN headers', () => {
    expect(resolveZone({ lat: 12.9, lon: 77.5, headers: { 'x-vercel-ip-country': 'DE' } })).toEqual({
      lat: 12.9,
      lon: 77.5,
      source: 'coordinates',
    });
  });

  it('maps cf-ipcountry and x-vercel-ip-country', () => {
    expect(resolveZone({ headers: { 'CF-IPCountry': 'de' } })).toEqual({ zone: 'DE', source: 'header' });
    expect(resolveZone({ headers: { 'x-vercel-ip-country': ['FR'] } })).toEqual({ zone: 'FR', source: 'header' });
  });

  it('falls through an unknown country to the default zone', () => {
    expect(resolveZone({ headers: { 'cf-ipcountry': 'ZZ' } })).toEqual({ zone: 'IN-SO', source: 'default' });
    expect(resolveZone({ defaultZone: 'FR' })).toEqual({ zone: 'FR', source: 'default' });
  });
});
