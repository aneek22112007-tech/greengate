# @greengate/flagsmith

Carbon-aware modes for Flagsmith. The plugin reads a grid carbon level and lets Flagsmith segments choose `full`, `eco`, or `off`.

It has no runtime dependencies. `@flagsmith/nodejs` 9.1 or newer is an optional peer, used when you pass a client. Node 20 or newer.

The package is still marked `"private": true` in `package.json`. Remove that field before `npm publish`. `files` is `dist` and this README. `publishConfig.access` is `public`.

## Install

```bash
npm install @greengate/flagsmith @flagsmith/nodejs
```

## Evaluate

```ts
import { Flagsmith } from '@flagsmith/nodejs';
import { createGreenGate } from '@greengate/flagsmith';

const gate = createGreenGate({
  flagsmith: new Flagsmith({ environmentKey: process.env.FLAGSMITH_ENVIRONMENT_KEY_DEVELOPMENT! }),
  electricityMapsToken: process.env.ELECTRICITY_MAPS_TOKEN,
  mapping: 'strict',
  mode: 'traits',
  defaultZone: 'IN-SO',
});

const decision = await gate.evaluate('user-42');
```

`decision` is an `Evaluation`:

| Field | Meaning |
| --- | --- |
| `variant` | `full`, `eco`, or `off`. |
| `carbonLevel` | `low`, `moderate`, or `high`. |
| `zone` | Electricity Maps zone, for example `IN-SO`. |
| `simulated` | True when the carbon reading was not a live Electricity Maps call. |
| `source` | Who chose the variant: `flagsmith`, `override`, or `local`. |
| `carbonSource` | `electricity-maps`, `simulated`, `stale-cache`, or `default`. |
| `flags` | `greengate_enabled`, `heavy_feature_mode`, and `greengate_suggested_variant`. |

`greengate_enabled` off forces `variant` to `full`.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `flagsmith` | none | Object with `getIdentityFlags(identifier, traits)`. |
| `electricityMapsToken` | none | Live readings. Without it, the level is simulated. |
| `mapping` | `strict` | Preset name, `low=full,moderate=eco,high=off`, or a table. |
| `mode` | `traits` | `traits` uses the Flagsmith value. `override` uses the local map and still sends traits. |
| `defaultZone` | `IN-SO` | Used when nothing else resolves a zone. |
| `cacheTtlMs` | 15 minutes | Fresh cache window. |
| `staleMs` | 6 hours | After a failed refresh, a cached reading is reused until this age, then the level becomes `moderate` with `carbonSource: default`. Failures are not cached. |
| `mockLevel` | none | Forces the simulated provider. `GREENGATE_MOCK_LEVEL` does the same. |
| `timeoutMs` | 2000 | Electricity Maps request timeout. |
| `fetchImpl`, `now` | platform | Test hooks. |

## Mapping presets

| Preset | low | moderate | high |
| --- | --- | --- | --- |
| `strict` | full | eco | off |
| `gentle` | full | full | eco |

A custom string replaces any levels it names. Unknown pieces are ignored and the rest stay on the strict preset.

```ts
createGreenGate({ mapping: 'low=full,moderate=eco,high=off' });
```

## Zone order

Explicit `context.zone`, then the `grid_zone` trait, then `context.lat` and `context.lon`, then `cf-ipcountry` or `x-vercel-ip-country` through `COUNTRY_ZONES`, then `defaultZone`.

## Express

```ts
import { greengateMiddleware } from '@greengate/flagsmith';

app.use(greengateMiddleware(gate));
// req.greengate is the Evaluation.
// Identifier: x-gg-uid header, then the gg_uid cookie, then "anonymous".
```

`evaluateRequest(gate, { identifier, headers })` is the same helper without Express. The demo server mints its own UUID. The middleware does not.

## Flags the bootstrap creates

| Flag | Role |
| --- | --- |
| `heavy_feature_mode` | Multivariate string. Control `full`. Variations `full`, `eco`, `off`, each with a key. |
| `greengate_enabled` | Boolean kill switch. Default on. |

Segments, when routing is on: `carbon_level = high` serves `off`, `carbon_level = moderate` serves `eco`, anything else stays on the control value `full`.
