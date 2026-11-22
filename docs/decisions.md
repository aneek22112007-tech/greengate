# Decisions

Sensible choices made while building GreenGate, and places the Flagsmith docs disagreed with the project brief. The docs win when they disagree.

Sections: stack, bootstrap, API differences, identity check, plugin, demo, experiment, sources.

## Sources

On 23 November 2026, `https://www.iea.org/reports/key-questions-on-energy-and-ai` and `https://www.iea.org/news/data-centre-electricity-use-surged-in-2025-even-with-tightening-bottlenecks-driving-a-scramble-for-solutions` both returned an IP-recognition sign-in wall. The README quotes carbon and electricity figures only from the Guardian article of 19 November 2026, which did load. The report’s executive summary was readable at a child URL and is not quoted, so the README does not add numbers from a page the brief did not name.

## Stack

- npm workspaces, TypeScript, Node 20+. Conda is not used.
- Flagsmith is self-hosted with the official `flagsmith/docker-compose.yml`, downloaded unchanged from `https://raw.githubusercontent.com/Flagsmith/flagsmith/main/docker-compose.yml`.
- `flagsmith/docker-compose.override.yml` publishes the dashboard and API on host port **8100** (container port 8000) and the task processor on **8101** (container port 8000). Port 8000 is often already taken. `FLAGSMITH_DOMAIN` is set to `localhost:8100` in the override so generated links match the published port.
- The official Compose file already sets `EXPERIMENTATION_ENABLED=true` and `USE_POSTGRES_FOR_ANALYTICS=true`. No extra experimentation flag was required. See [Self-hosting experimentation](https://docs.flagsmith.com/experimentation/self-hosting).

## Bootstrap

- Admin user: `greengate-admin@example.com`. The password is generated on first run and stored only in the gitignored `.env`.
- Organisation and project are both named GreenGate. Environments are Development and Production.
- `heavy_feature_mode` is a multivariate flag. The control value is `full`. Variations are `full`, `eco`, and `off`, each with a stable key and a default weight of 0. Weights stay at 0 so segment overrides, not a random split, decide the variant. Keys are required later: Flagsmith drops exposures for a variation that has no key ([Run an experiment](https://docs.flagsmith.com/experimentation/run-an-experiment)).
- `greengate_enabled` is a boolean flag, default on. The plugin treats off as "always full".
- Segments `carbon_high` (`carbon_level == high` → `off`) and `carbon_moderate` (`carbon_level == moderate` → `eco`). Any other trait, including `low`, falls through to the control value `full`.
- Each environment gets a server-side SDK key named "GreenGate server" and an organisation admin API key. Both are written to `.env` and never printed.
- Each environment is connected to the Flagsmith Postgres warehouse (`warehouse_type: postgres`, `source: flagsmith_database`) so experimentation can store events. This follows the [local coding-agent setup](https://docs.flagsmith.com/getting-started/run-locally-with-a-coding-agent). The brief's step 1 did not mention the warehouse; the experimentation docs require it.

## API differences found on this image

- `GET /api/v1/environments/<numeric id>/` and `.../api-keys/` return 403 or 404. The working paths use the environment API key: `/api/v1/environments/<api_key>/` and `/api/v1/environments/<api_key>/api-keys/`.
- Feature states are listed the same way: `/api/v1/environments/<api_key>/featurestates/`.
- Warehouse connections need the admin user token (`Authorization: Token ...`). Calling them with only `X-Environment-Key` returns 401. A connected row comes back with `"status": "connected"`.
- Multivariate options accept a `key` field. Bootstrap sets `full`, `eco`, and `off` so later exposures are counted.
- The admin password is written to `.env` as soon as the user is created, so a later failure can still log in on the next run.

## Identity check

Bootstrap finishes by evaluating three identities against Development. `carbon_level` of `low`, `moderate`, and `high` must return `full`, `eco`, and `off`.

## Plugin

- `@greengate/flagsmith` has no runtime dependencies. `@flagsmith/nodejs` is an optional peer. The plugin takes a small `FlagsmithLike` client so tests do not import the SDK.
- `evaluate` returns `source` for who chose the variant (`flagsmith`, `override`, or `local`) and `carbonSource` for the reading (`electricity-maps`, `simulated`, `stale-cache`, or `default`). The brief listed a single `source` field. Both are returned so the demo can show the grid source and prove the decision came from Flagsmith.
- No `ELECTRICITY_MAPS_TOKEN` is configured on this machine. The simulated provider is the fallback, and `scripts/print-carbon-levels.mjs` says so. A token in the environment switches the same script to live IN-SO, DE, and FR calls.
- Cache: 15 minutes fresh, then stale up to 6 hours on provider failure, then carbon level `moderate` with `carbonSource: default`.
- Zone order: explicit zone, `grid_zone` trait, lat/lon, `cf-ipcountry` or `x-vercel-ip-country`, then `IN-SO`. Unknown country codes fall through to the default.

## Demo

- The news reader is Express plus a static page, not Next.js. One process is enough, and the variant decision stays on the server.
- Full mode uses an animated hero placeholder instead of a video file. Eco mode uses a still. Off mode shows the sentence "Paused because the grid is dirty right now".
- Summaries are a local extractive stand-in unless `LLM_API_KEY` and `LLM_BASE_URL` are both set. Eco summaries are cached. The label says which one you are reading.
- Energy figures are estimates: 0.3 Wh live, 0.05 Wh cached, 0.2 Wh autoplay, default 450 gCO₂/kWh. Zone intensities in `energy.ts` are assumptions for the meter.
- The dev panel is hidden when `NODE_ENV=production`. Forcing a level still sends `carbon_level` to Flagsmith. The server log line `greengate.decision` records `from: flagsmith`.
- Root `docker-compose.yml` includes the Flagsmith stack under the project name `flagsmith` and adds the demo on port 3000. Inside the compose network the API URL is `http://flagsmith:8000/api/v1/`. Compose `include` concatenated the official ports with the override, so the root file sets `ports: !override` again. Host port 8000 is already taken by another local stack and is left alone.

## Experiment

- Hypothesis: eco mode does not reduce session completion compared with full. Flag `heavy_feature_mode`, control value `full`, eco at 50%, rollout 100% in Development only.
- Carbon segment overrides win over the experiment rollout segment (they are created at priority 0 and 1; the rollout segment takes the next priority). Both `carbon_high` and `carbon_moderate` are deleted in Development for the run. Keeping only the high override would still pull every moderate identity (the demo's simulated default) out of the random split. Production is untouched.
- The demo calls `getExperimentFlag` on `@flagsmith/nodejs` after `evaluate`, with the same identity and the same carbon traits, so an enrolled reader records one exposure. Conversions use that same id on `article_completed`.
- Ending the experiment is `POST /experiments/<id>/complete/` on this image. The coding-agent doc's start and `results/refresh` paths match. A completed experiment cannot be restarted.
- The coding-agent example lists only the treatment variation and lets control take the rest. This image returns 400 `Must include all feature's variants` unless every multivariate option is in the rollout. Setup sends full=0, eco=50, off=0. Control remains the flag value `full` (variant key `control` in Flagsmith). The demo still renders the flag value, so readers see `full` or `eco`.
- Feature states on this image return 405 for DELETE. Removing the feature-segment is what clears an override.
- Restore sets the experiment rollout to 0% and completes the experiment, then recreates the two carbon overrides and rechecks low → full, moderate → eco, high → off. After the percentage was set to 0, the rollout feature-segment was already gone.
- Traffic from `scripts/simulate-traffic.mjs` is labelled `SIMULATED` on the API, in the page banner for those ids, in the README, and in `docs/experiment-results.md`. A normal browser session is not labelled that way. The event response field `simulated` is true only for that traffic.
