import { describe, expect, it } from 'vitest';
import { estimateEnergy, intensityForZone, whForVariant } from '../src/energy.js';

describe('energy model', () => {
  it('uses the documented watt-hours and the 450 default', () => {
    expect(whForVariant('full')).toBeCloseTo(0.5);
    expect(whForVariant('eco')).toBeCloseTo(0.05);
    expect(whForVariant('off')).toBe(0);
    expect(intensityForZone('nowhere')).toBe(450);
  });

  it('shows a smaller bill for eco and a full saving for off', () => {
    const full = estimateEnergy('full', 'IN-SO', 8);
    const eco = estimateEnergy('eco', 'IN-SO', 8);
    const off = estimateEnergy('off', 'IN-SO', 8);
    expect(eco.usedWh).toBeLessThan(full.usedWh);
    expect(eco.savedWh).toBeGreaterThan(0);
    expect(off.usedWh).toBe(0);
    expect(off.savedWh).toBe(full.alwaysFullWh);
    expect(off.savedCo2eGrams).toBeGreaterThan(eco.savedCo2eGrams);
    expect(full.label).toBe('estimate');
  });
});
