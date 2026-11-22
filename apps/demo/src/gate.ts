import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Flagsmith } from '@flagsmith/nodejs';
import { createGreenGate, isCarbonLevel, type FlagsmithLike, type GreenGate } from '@greengate/flagsmith';

export function loadDotEnv(): void {
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export interface DemoRuntime {
  gate: GreenGate;
  flagsmith: Flagsmith | null;
}

export function createDemoRuntime(): DemoRuntime {
  const environmentKey = process.env.FLAGSMITH_ENVIRONMENT_KEY_DEVELOPMENT?.trim();
  const usableKey = environmentKey && !environmentKey.includes('replace-me') ? environmentKey : undefined;
  const flagsmith = usableKey
    ? new Flagsmith({
        environmentKey: usableKey,
        apiUrl: process.env.FLAGSMITH_API_URL || 'http://localhost:8100/api/v1/',
        enableEvents: true,
        eventProcessorConfig: {
          eventsApiUrl: process.env.FLAGSMITH_EVENTS_URL || 'http://localhost:8100/api/',
        },
      })
    : null;

  const client: FlagsmithLike | undefined = flagsmith
    ? {
        async getIdentityFlags(identifier, traits) {
          const flags = await flagsmith.getIdentityFlags(identifier, traits);
          return {
            isFeatureEnabled: (name) => flags.isFeatureEnabled(name),
            getFeatureValue: (name) => {
              const value = flags.getFeatureValue(name);
              if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
              return null;
            },
          };
        },
      }
    : undefined;

  const mockLevel = isCarbonLevel(process.env.GREENGATE_MOCK_LEVEL) ? process.env.GREENGATE_MOCK_LEVEL : undefined;
  const gate = createGreenGate({
    flagsmith: client,
    electricityMapsToken: process.env.ELECTRICITY_MAPS_TOKEN?.trim() || undefined,
    mockLevel,
    mapping: process.env.GREENGATE_MAPPING || 'strict',
    mode: 'traits',
    defaultZone: process.env.GREENGATE_DEFAULT_ZONE || 'IN-SO',
  });
  return { gate, flagsmith };
}
