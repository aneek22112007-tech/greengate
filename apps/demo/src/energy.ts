import type { Variant } from '@greengate/flagsmith';

/**
 * Estimate only. These are model assumptions, not a meter reading.
 * 0.3 Wh for a live summary, 0.05 Wh for a cached one, 0.2 Wh for the
 * autoplay hero. Grid intensity defaults to 450 gCO₂/kWh.
 */
export const ENERGY_ASSUMPTIONS = {
  liveSummaryWh: 0.3,
  cachedSummaryWh: 0.05,
  pausedSummaryWh: 0,
  videoAutoplayWh: 0.2,
  gridGco2PerKwh: {
    'IN-SO': 700,
    DE: 380,
    FR: 60,
    GB: 180,
    'US-CAL-CISO': 230,
    default: 450,
  } as Record<string, number>,
};

export interface EnergyEstimate {
  variant: Variant;
  zone: string;
  articleCount: number;
  whPerArticle: number;
  alwaysFullWh: number;
  usedWh: number;
  savedWh: number;
  intensityGPerKwh: number;
  co2eGrams: number;
  savedCo2eGrams: number;
  label: 'estimate';
}

export function intensityForZone(zone: string): number {
  return ENERGY_ASSUMPTIONS.gridGco2PerKwh[zone] ?? ENERGY_ASSUMPTIONS.gridGco2PerKwh.default;
}

export function whForVariant(variant: Variant): number {
  if (variant === 'full') return ENERGY_ASSUMPTIONS.liveSummaryWh + ENERGY_ASSUMPTIONS.videoAutoplayWh;
  if (variant === 'eco') return ENERGY_ASSUMPTIONS.cachedSummaryWh;
  return ENERGY_ASSUMPTIONS.pausedSummaryWh;
}

export function estimateEnergy(variant: Variant, zone: string, articleCount: number): EnergyEstimate {
  const count = Math.max(0, articleCount);
  const whPerArticle = whForVariant(variant);
  const alwaysFullWh = whForVariant('full') * count;
  const usedWh = whPerArticle * count;
  const savedWh = alwaysFullWh - usedWh;
  const intensityGPerKwh = intensityForZone(zone);
  const toGrams = (wh: number) => (wh / 1000) * intensityGPerKwh;
  return {
    variant,
    zone,
    articleCount: count,
    whPerArticle,
    alwaysFullWh,
    usedWh,
    savedWh,
    intensityGPerKwh,
    co2eGrams: toGrams(usedWh),
    savedCo2eGrams: toGrams(savedWh),
    label: 'estimate',
  };
}
