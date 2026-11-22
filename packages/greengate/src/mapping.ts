import { isVariant, type CarbonLevel, type Variant } from './types.js';

export interface LevelMapping {
  low: Variant;
  moderate: Variant;
  high: Variant;
}

export const PRESETS = {
  strict: { low: 'full', moderate: 'eco', high: 'off' },
  gentle: { low: 'full', moderate: 'full', high: 'eco' },
} as const satisfies Record<string, LevelMapping>;

export type MappingPreset = keyof typeof PRESETS;

const LEVELS: CarbonLevel[] = ['low', 'moderate', 'high'];

/** Accepts "strict", "gentle", a custom "low=full,moderate=eco,high=off" string, or a table. */
export function parseMapping(mapping?: MappingPreset | LevelMapping | string | null): LevelMapping {
  if (!mapping || mapping === 'strict') return { ...PRESETS.strict };
  if (mapping === 'gentle') return { ...PRESETS.gentle };
  if (typeof mapping === 'object') {
    return {
      low: isVariant(mapping.low) ? mapping.low : PRESETS.strict.low,
      moderate: isVariant(mapping.moderate) ? mapping.moderate : PRESETS.strict.moderate,
      high: isVariant(mapping.high) ? mapping.high : PRESETS.strict.high,
    };
  }
  const parsed: LevelMapping = { ...PRESETS.strict };
  for (const part of mapping.split(',')) {
    const [rawLevel, rawVariant] = part.split('=').map((piece) => piece.trim());
    if (!LEVELS.includes(rawLevel as CarbonLevel) || !isVariant(rawVariant)) continue;
    parsed[rawLevel as CarbonLevel] = rawVariant;
  }
  return parsed;
}

export function mapLevel(level: CarbonLevel, mapping: LevelMapping): Variant {
  return mapping[level];
}
