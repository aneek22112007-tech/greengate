# GreenGate

Carbon-aware feature flags for [Flagsmith](https://www.flagsmith.com/). The grid's carbon level becomes an identity trait, and Flagsmith segments choose how heavy a feature is allowed to be.

This repository is a work in progress for the Toggle Wars hackathon (Track 03). See `docs/decisions.md` for setup choices. The judge-facing guide lands in a later step.

## Layout

- `packages/greengate` — `@greengate/flagsmith`
- `apps/demo` — GreenGate News Reader
- `flagsmith/` — official self-hosted Compose file, plus a port override
- `scripts/` — bootstrap and experiment tooling
- `docs/` — decisions and results

## Experiment

The full-versus-eco run is **SIMULATED**. `scripts/simulate-traffic.mjs` sends stable ids to the real demo and labels every request `SIMULATED`. It is not live reader traffic. Results live in `docs/experiment-results.md` after the report script runs. A person using the news reader is a live session.
