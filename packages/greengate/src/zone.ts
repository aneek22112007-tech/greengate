export interface HeaderMap {
  [name: string]: string | string[] | undefined;
}

export interface ZoneInput {
  explicitZone?: string | null;
  traits?: Record<string, unknown> | null;
  lat?: number | null;
  lon?: number | null;
  headers?: HeaderMap | null;
  defaultZone?: string;
}

export type ZoneSource = 'explicit' | 'trait' | 'coordinates' | 'header' | 'default';

export interface ZoneResolution {
  zone?: string;
  lat?: number;
  lon?: number;
  source: ZoneSource;
}

/** Country codes from CDN headers, mapped to an Electricity Maps zone. */
export const COUNTRY_ZONES: Record<string, string> = {
  IN: 'IN-SO',
  DE: 'DE',
  FR: 'FR',
  GB: 'GB',
  UK: 'GB',
  US: 'US-CAL-CISO',
  NL: 'NL',
  ES: 'ES',
  IT: 'IT',
  SE: 'SE',
  NO: 'NO',
  PL: 'PL',
  PT: 'PT',
  BE: 'BE',
  AT: 'AT',
  CH: 'CH',
  DK: 'DK',
  FI: 'FI',
  IE: 'IE',
  JP: 'JP-TK',
  KR: 'KR',
  AU: 'AU-NSW',
  CA: 'CA-ON',
  BR: 'BR-CS',
  SG: 'SG',
  ZA: 'ZA',
};

const HEADER_NAMES = ['cf-ipcountry', 'x-vercel-ip-country'];

function headerValue(headers: HeaderMap | null | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    const first = Array.isArray(value) ? value[0] : value;
    const trimmed = first?.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}

/**
 * Zone order: explicit zone, `grid_zone` trait, lat/lon, CDN country header, default IN-SO.
 * An unknown country header falls through to the default instead of inventing a zone.
 */
export function resolveZone(input: ZoneInput = {}): ZoneResolution {
  const explicit = input.explicitZone?.trim();
  if (explicit) return { zone: explicit, source: 'explicit' };

  const trait = input.traits?.grid_zone;
  if (typeof trait === 'string' && trait.trim()) return { zone: trait.trim(), source: 'trait' };

  if (typeof input.lat === 'number' && Number.isFinite(input.lat) && typeof input.lon === 'number' && Number.isFinite(input.lon)) {
    return { lat: input.lat, lon: input.lon, source: 'coordinates' };
  }

  for (const name of HEADER_NAMES) {
    const country = headerValue(input.headers, name)?.toUpperCase();
    if (!country) continue;
    const zone = COUNTRY_ZONES[country];
    if (zone) return { zone, source: 'header' };
  }

  return { zone: input.defaultZone?.trim() || 'IN-SO', source: 'default' };
}
