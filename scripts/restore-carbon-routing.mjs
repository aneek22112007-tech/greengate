#!/usr/bin/env node
/**
 * Put Development carbon routing back after the experiment.
 * Zeros nothing by leaving the rollout segment in place: the feature-segment
 * override is deleted, then the experiment is completed, then carbon_high
 * and carbon_moderate are recreated. Safe to re-run.
 */
import {
  EXPERIMENT_NAME,
  deleteRolloutOverrides,
  developmentContext,
  experimentPath,
  listExperiments,
  log,
  request,
  restoreCarbonOverrides,
  verifyCarbonRouting,
} from './flagsmith-admin.mjs';

async function zeroRollout(ctx, experiment) {
  if (experiment.status === 'completed') return;
  const detail = await request('GET', experimentPath(ctx, experiment.id, '/'), { token: ctx.token });
  const rollout = detail.json?.experiment_rollout;
  if (!rollout) {
    log('experiment has no rollout payload to shrink');
    return;
  }
  if (Number(rollout.rollout_percentage) === 0) {
    log('rollout percentage is already 0');
    return;
  }
  const updated = await request('PATCH', experimentPath(ctx, experiment.id, '/rollout/'), {
    token: ctx.token,
    tolerate: [400],
    body: {
      enabled: true,
      rollout_percentage: 0,
      feature_state_value: rollout.feature_state_value,
      multivariate_feature_state_values: rollout.multivariate_feature_state_values,
    },
  });
  if (updated.status === 400) {
    log('rollout patch was rejected; the feature-segment delete below is the fallback');
    return;
  }
  log(`set rollout percentage to 0 (was ${rollout.rollout_percentage})`);
}

async function completeExperiment(ctx, experiment) {
  if (experiment.status === 'completed') {
    log(`experiment id=${experiment.id} already completed`);
    return experiment;
  }
  if (experiment.status !== 'running' && experiment.status !== 'paused') {
    log(`experiment id=${experiment.id} status=${experiment.status}; not completing`);
    return experiment;
  }
  const done = await request('POST', experimentPath(ctx, experiment.id, '/complete/'), { token: ctx.token });
  log(`completed experiment id=${experiment.id} status=${done.json?.status}`);
  return done.json || experiment;
}

async function main() {
  const ctx = await developmentContext();
  const experiments = await listExperiments(ctx);
  const experiment = experiments.find((item) => item.name === EXPERIMENT_NAME);
  if (!experiment) {
    log('no full-vs-eco experiment found; restoring carbon overrides only');
  } else {
    await zeroRollout(ctx, experiment);
    await deleteRolloutOverrides(ctx);
    await completeExperiment(ctx, experiment);
  }
  await restoreCarbonOverrides(ctx);
  await verifyCarbonRouting(ctx);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
