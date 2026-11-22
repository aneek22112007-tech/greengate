# Decisions

Sensible choices made while building GreenGate, and places the Flagsmith docs disagreed with the project brief. The docs win when they disagree.

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

## Identity check

Bootstrap finishes by evaluating three identities against Development. `carbon_level` of `low`, `moderate`, and `high` must return `full`, `eco`, and `off`.
