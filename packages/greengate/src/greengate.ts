import { TtlCache } from './cache.js';
import { mapLevel, parseMapping, type LevelMapping } from './mapping.js';
import { ElectricityMapsProvider, SimulatedProvider, type CarbonProvider, type CarbonQuery } from './providers.js';
import { isCarbonLevel, isVariant, type CarbonLevel, type CarbonReading, type Evaluation, type FlagsmithLike, type Variant } from './types.js';
import { resolveZone, type HeaderMap } from './zone.js';

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_STALE_MS = 6 * 60 * 60 * 1000;

export interface EvaluationContext {
  zone?: string;
  lat?: number;
  lon?: number;
  headers?: HeaderMap;
  /** Dev override. Skips the network and is marked simulated. Flagsmith still chooses the variant. */
  forceLevel?: CarbonLevel;
}

export interface GreenGateOptions {
  flagsmith?: FlagsmithLike;
  electricityMapsToken?: string;
  mapping?: LevelMapping | 'strict' | 'gentle' | string;
  mode?: 'traits' | 'override';
  defaultZone?: string;
  cacheTtlMs?: number;
  staleMs?: number;
  /** When set, or when GREENGATE_MOCK_LEVEL is set, the simulated provider is used. */
  mockLevel?: CarbonLevel;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export interface GreenGate {
  evaluate(identifier: string, traits?: Record<string, string | number | boolean>, context?: EvaluationContext): Promise<Evaluation>;
}

function cacheKey(query: CarbonQuery): string {
  if (query.zone) return `zone:${query.zone}`;
  return `latlon:${query.lat},${query.lon}`;
}

function moderateFallback(zone: string): CarbonReading {
  return {
    level: 'moderate',
    zone,
    datetime: null,
    simulated: true,
    source: 'default',
  };
}

export function createGreenGate(options: GreenGateOptions = {}): GreenGate {
  const mapping = parseMapping(options.mapping);
  const mode = options.mode ?? 'traits';
  const defaultZone = options.defaultZone?.trim() || 'IN-SO';
  const cache = new TtlCache<CarbonReading>(
    options.cacheTtlMs ?? DEFAULT_TTL_MS,
    options.staleMs ?? DEFAULT_STALE_MS,
    options.now,
  );
  const provider = chooseProvider(options, defaultZone);

  async function readCarbon(query: CarbonQuery, fallbackZone: string): Promise<CarbonReading> {
    const key = cacheKey(query);
    const cached = cache.get(key);
    if (cached?.fresh) return cached.value;
    try {
      const live = await provider.getLevel(query);
      const reading = { ...live, zone: live.zone || fallbackZone };
      cache.set(key, reading);
      return reading;
    } catch {
      if (cached) return { ...cached.value, source: 'stale-cache' };
      return moderateFallback(query.zone || fallbackZone);
    }
  }

  return {
    async evaluate(identifier, traits, context) {
      const zone = resolveZone({
        explicitZone: context?.zone,
        traits,
        lat: context?.lat,
        lon: context?.lon,
        headers: context?.headers,
        defaultZone,
      });
      const fallbackZone = zone.zone || defaultZone;
      const reading = context?.forceLevel
        ? {
            level: context.forceLevel,
            zone: fallbackZone,
            datetime: null,
            simulated: true,
            source: 'simulated' as const,
          }
        : await readCarbon(
            zone.source === 'coordinates' ? { lat: zone.lat, lon: zone.lon } : { zone: zone.zone },
            fallbackZone,
          );
      const suggested = mapLevel(reading.level, mapping);
      const identityTraits: Record<string, string | number | boolean> = {
        ...(traits ?? {}),
        carbon_level: reading.level,
        grid_zone: reading.zone || fallbackZone,
        greengate_suggested_variant: suggested,
      };

      if (!options.flagsmith) {
        return result(suggested, reading, 'local', true, suggested);
      }

      let remote: Awaited<ReturnType<FlagsmithLike['getIdentityFlags']>>;
      try {
        remote = await options.flagsmith.getIdentityFlags(identifier, identityTraits);
      } catch {
        // Flagsmith is unreachable or errored. Serve the local carbon mapping instead of failing the request.
        return result(suggested, reading, 'local', true, suggested);
      }
      const enabled = remote.isFeatureEnabled('greengate_enabled');
      const remoteValue = remote.getFeatureValue('heavy_feature_mode');
      const remoteVariant: Variant = isVariant(remoteValue) ? remoteValue : suggested;
      const variant: Variant = enabled ? (mode === 'override' ? suggested : remoteVariant) : 'full';
      return result(variant, reading, mode === 'override' ? 'override' : 'flagsmith', enabled, suggested, remoteValue);
    },
  };
}

function result(
  variant: Variant,
  reading: CarbonReading,
  source: Evaluation['source'],
  enabled: boolean,
  suggested: Variant,
  remoteValue?: string | number | boolean | null,
): Evaluation {
  return {
    variant,
    carbonLevel: reading.level,
    zone: reading.zone,
    simulated: reading.simulated,
    source,
    carbonSource: reading.source,
    flags: {
      greengate_enabled: enabled,
      heavy_feature_mode: remoteValue == null ? variant : String(remoteValue),
      greengate_suggested_variant: suggested,
    },
  };
}

function chooseProvider(options: GreenGateOptions, defaultZone: string): CarbonProvider {
  const fromEnv = isCarbonLevel(process.env.GREENGATE_MOCK_LEVEL) ? process.env.GREENGATE_MOCK_LEVEL : undefined;
  const mock = options.mockLevel ?? fromEnv;
  if (mock) return new SimulatedProvider(mock, defaultZone);
  if (options.electricityMapsToken) {
    return new ElectricityMapsProvider({
      token: options.electricityMapsToken,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
    });
  }
  return new SimulatedProvider('moderate', defaultZone);
}
