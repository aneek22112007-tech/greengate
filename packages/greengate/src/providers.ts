import { isCarbonLevel, type CarbonLevel, type CarbonReading } from './types.js';

export interface CarbonQuery {
  zone?: string;
  lat?: number;
  lon?: number;
}

export interface CarbonProvider {
  getLevel(query: CarbonQuery): Promise<CarbonReading>;
}

export interface ElectricityMapsOptions {
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class ElectricityMapsProvider implements CarbonProvider {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ElectricityMapsOptions) {
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getLevel(query: CarbonQuery): Promise<CarbonReading> {
    const params = new URLSearchParams();
    if (query.zone) params.set('zone', query.zone);
    if (typeof query.lat === 'number') params.set('lat', String(query.lat));
    if (typeof query.lon === 'number') params.set('lon', String(query.lon));
    params.set('disableCallerLookup', 'true');
    const response = await this.fetchImpl(
      `https://api.electricitymaps.com/v4/carbon-intensity-level/latest?${params.toString()}`,
      {
        headers: { 'auth-token': this.options.token },
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    );
    if (!response.ok) {
      throw new Error(`Electricity Maps HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      zone?: string;
      data?: Array<{ level?: string; datetime?: string }>;
    };
    const point = body.data?.[0];
    if (!isCarbonLevel(point?.level)) {
      throw new Error('Electricity Maps returned no carbon level');
    }
    return {
      level: point.level,
      zone: body.zone || query.zone || 'unknown',
      datetime: point.datetime ?? null,
      simulated: false,
      source: 'electricity-maps',
    };
  }
}

export class SimulatedProvider implements CarbonProvider {
  constructor(
    private readonly level: CarbonLevel = 'moderate',
    private readonly zone = 'IN-SO',
  ) {}

  async getLevel(query: CarbonQuery = {}): Promise<CarbonReading> {
    return {
      level: this.level,
      zone: query.zone || this.zone,
      datetime: null,
      simulated: true,
      source: 'simulated',
    };
  }
}
