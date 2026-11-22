import type { GreenGate } from './greengate.js';
import type { Evaluation } from './types.js';
import type { HeaderMap } from './zone.js';

export interface GreenGateRequest {
  headers?: HeaderMap;
  cookies?: Record<string, string | undefined>;
  greengate?: Evaluation;
  header?(name: string): string | undefined;
}

export type NextFunction = (error?: unknown) => void;

function headerValue(headers: HeaderMap | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    const first = Array.isArray(value) ? value[0] : value;
    return first || undefined;
  }
  return undefined;
}

/** Express-style middleware. Attaches `req.greengate`. */
export function greengateMiddleware(gate: GreenGate) {
  return async function greengate(req: GreenGateRequest, _res: unknown, next: NextFunction): Promise<void> {
    try {
      const identifier = req.header?.('x-gg-uid') || headerValue(req.headers, 'x-gg-uid') || req.cookies?.gg_uid || 'anonymous';
      req.greengate = await gate.evaluate(identifier, undefined, { headers: req.headers });
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Framework-free helper for servers that are not using the middleware. */
export async function evaluateRequest(
  gate: GreenGate,
  input: {
    identifier: string;
    traits?: Record<string, string | number | boolean>;
    headers?: HeaderMap;
    zone?: string;
    lat?: number;
    lon?: number;
    forceLevel?: Evaluation['carbonLevel'];
  },
): Promise<Evaluation> {
  return gate.evaluate(input.identifier, input.traits, {
    headers: input.headers,
    zone: input.zone,
    lat: input.lat,
    lon: input.lon,
    forceLevel: input.forceLevel,
  });
}
