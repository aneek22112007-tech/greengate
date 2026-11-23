export type Level = 'low' | 'moderate' | 'high';
export type Variant = 'full' | 'eco' | 'off';

export const LEVEL_COLORS: Record<Level, string> = {
  low: '#4ef0a0',
  moderate: '#ffc24b',
  high: '#ff5d6c',
};

export const PRESETS: Record<'strict' | 'gentle', Record<Level, Variant>> = {
  strict: { low: 'full', moderate: 'eco', high: 'off' },
  gentle: { low: 'full', moderate: 'full', high: 'eco' },
};

/** Zone levels here are illustrative for the animation. They are not live readings. */
export interface Zone {
  id: string;
  lat: number;
  lon: number;
  level: Level;
}

export const ZONES: Zone[] = [
  { id: 'IN-SO', lat: 13.08, lon: 80.27, level: 'high' },
  { id: 'FR', lat: 46.6, lon: 2.3, level: 'low' },
  { id: 'DE', lat: 51.2, lon: 10.4, level: 'moderate' },
  { id: 'GB', lat: 52.5, lon: -1.5, level: 'moderate' },
  { id: 'US-CAL-CISO', lat: 36.8, lon: -119.4, level: 'low' },
  { id: 'NO-NO1', lat: 60.5, lon: 9.5, level: 'low' },
  { id: 'BR-CS', lat: -15.8, lon: -47.9, level: 'low' },
  { id: 'ZA', lat: -26.2, lon: 28.0, level: 'high' },
  { id: 'AU-NSW', lat: -33.9, lon: 151.2, level: 'high' },
  { id: 'JP-TK', lat: 35.7, lon: 139.7, level: 'moderate' },
  { id: 'PL', lat: 52.2, lon: 21.0, level: 'high' },
  { id: 'SG', lat: 1.35, lon: 103.8, level: 'moderate' },
];

/** The HUD cycles through these, in order. */
export const HUD_SEQUENCE = [0, 1, 4, 3, 7, 6, 9];
