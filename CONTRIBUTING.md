# Contributing

GreenGate is a small monorepo: `packages/greengate` is the plugin, `apps/demo` is the news reader, `flagsmith/` is the official Compose file plus a port override.

## Setup

```bash
npm ci
docker compose up -d
node scripts/bootstrap-flagsmith.mjs
docker compose up -d --force-recreate demo
```

Copy nothing by hand. Bootstrap writes `.env` and leaves it gitignored. Do not commit that file, and do not print the server keys or the admin password.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/). Keep each commit small enough to describe in one sentence. Add a `Signed-off-by` trailer. Do not set a repo-local `user.name` or `user.email`.

## Flagsmith

`scripts/bootstrap-flagsmith.mjs` is safe to run again. It looks up each object before creating it. Experiment scripts live next to it. `scripts/setup-experiment.mjs` turns carbon routing off in Development. `scripts/restore-carbon-routing.mjs` turns it back on. Run the restore script before you leave a session if you started an experiment.
