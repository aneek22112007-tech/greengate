#!/usr/bin/env node
/**
 * Create the full-vs-eco experiment in Development and start it.
 * Safe to re-run. Disables carbon segment overrides first so they cannot
 * replace the 50/50 split. Does not print secrets.
 */
import {
  API,
  EXPERIMENT_NAME,
  HYPOTHESIS,
  METRICS,
  deleteCarbonOverrides,
  developmentContext,
  experimentPath,
  flagValue,
  listExperiments,
  log,
  request,
} from './flagsmith-admin.mjs';

async function ensureMetrics(ctx) {
  const existing = await request('GET', `${API}/environments/${ctx.environment.api_key}/experiment-metrics/?page_size=100`, {
    token: ctx.token,
  });
  const rows = Array.isArray(existing.json) ? existing.json : existing.json?.results || [];
  const ids = [];
  for (const spec of METRICS) {
    const found = rows.find((item) => item.name === spec.name && item.definition?.event === spec.event);
    if (found) {
      log(`reused metric ${spec.name} id=${found.id}`);
      ids.push({ id: found.id, expected: spec.expected });
      continue;
    }
    const created = await request('POST', `${API}/environments/${ctx.environment.api_key}/experiment-metrics/`, {
      token: ctx.token,
      body: {
        name: spec.name,
        description: spec.description,
        aggregation: spec.aggregation,
        direction: spec.direction,
        definition: { version: 1, event: spec.event },
      },
    });
    log(`created metric ${spec.name} id=${created.json?.id} aggregation=${spec.aggregation}`);
    ids.push({ id: created.json.id, expected: spec.expected });
  }
  return ids;
}

function activeExperiment(experiments) {
  return experiments.find(
    (item) => item.name === EXPERIMENT_NAME && item.status !== 'completed',
  );
}

async function createExperiment(ctx, metrics) {
  const created = await request('POST', `${API}/environments/${ctx.environment.api_key}/experiments/`, {
    token: ctx.token,
    body: {
      feature: ctx.feature.id,
      name: EXPERIMENT_NAME,
      hypothesis: HYPOTHESIS,
      metrics: metrics.map((metric) => ({
        metric: metric.id,
        expected_direction: metric.expected,
      })),
      experiment_rollout: {
        enabled: true,
        rollout_percentage: 100,
        feature_state_value: { type: 'string', value: 'full' },
        // This image rejects a rollout that omits a variation. Control is the
        // unallocated remainder (the flag value `full`). Eco takes 50. The
        // full and off options stay at 0 so they are not a third arm.
        multivariate_feature_state_values: ctx.options.map((option) => ({
          multivariate_feature_option: option.id,
          percentage_allocation: option.id === ctx.ecoOption.id ? 50 : 0,
        })),
      },
    },
  });
  log(`created experiment id=${created.json?.id} status=${created.json?.status}`);
  return created.json;
}

async function startExperiment(ctx, experiment) {
  if (experiment.status === 'running') {
    log(`experiment id=${experiment.id} already running`);
    return experiment;
  }
  if (experiment.status === 'completed') {
    log(`experiment id=${experiment.id} is completed and cannot be restarted`);
    return experiment;
  }
  const started = await request('POST', experimentPath(ctx, experiment.id, '/start/'), {
    token: ctx.token,
  });
  log(`started experiment id=${experiment.id} status=${started.json?.status}`);
  return started.json || experiment;
}

async function probeSplit(ctx) {
  const serverKey = ctx.env.FLAGSMITH_ENVIRONMENT_KEY_DEVELOPMENT;
  const counts = {};
  for (let index = 1; index <= 24; index += 1) {
    const { json } = await request('POST', `${API}/identities/`, {
      envKey: serverKey,
      body: {
        identifier: `sim-probe-${String(index).padStart(2, '0')}`,
        traits: [{ trait_key: 'carbon_level', trait_value: 'moderate' }],
      },
    });
    const value = flagValue(json?.flags, 'heavy_feature_mode') || 'missing';
    counts[value] = (counts[value] || 0) + 1;
  }
  log(`probe split ${JSON.stringify(counts)} (carbon_level=moderate, overrides off)`);
  if (!counts.full || !counts.eco) {
    throw new Error('Expected both full and eco while carbon overrides are off. The random split is not being served.');
  }
}

async function main() {
  const ctx = await developmentContext();
  const experiments = await listExperiments(ctx);
  const completed = experiments.find((item) => item.name === EXPERIMENT_NAME && item.status === 'completed');
  const current = activeExperiment(experiments);
  if (!current && completed) {
    log(`experiment id=${completed.id} is already completed. Not starting another, and carbon overrides were left as they are.`);
    log('Run scripts/restore-carbon-routing.mjs if routing is still off.');
    return;
  }
  const metrics = await ensureMetrics(ctx);
  let experiment = current;
  if (!experiment) {
    experiment = await createExperiment(ctx, metrics);
  } else {
    log(`reused experiment id=${experiment.id} status=${experiment.status}`);
  }
  log('disabling carbon_high and carbon_moderate in Development so they cannot override the split');
  await deleteCarbonOverrides(ctx);
  experiment = await startExperiment(ctx, experiment);
  if (experiment.status === 'running') await probeSplit(ctx);
  log(`dashboard project=${ctx.projectId} experiment=${experiment.id} environment=Development`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
