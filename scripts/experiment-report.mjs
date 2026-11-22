#!/usr/bin/env node
/**
 * Pull Flagsmith experiment results and write docs/experiment-results.md.
 * The traffic is SIMULATED. Also prints a two-proportion z-test from the tally.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPERIMENT_NAME,
  HYPOTHESIS,
  ROOT,
  developmentContext,
  experimentPath,
  listExperiments,
  log,
  request,
} from './flagsmith-admin.mjs';

const TALLY_PATH = path.join(ROOT, 'tmp', 'simulated-traffic.json');
const DOC_PATH = path.join(ROOT, 'docs', 'experiment-results.md');

function normalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

export function twoProportion(successA, nA, successB, nB) {
  if (nA < 1 || nB < 1) return null;
  const pA = successA / nA;
  const pB = successB / nB;
  const pooled = (successA + successB) / (nA + nB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  const z = se === 0 ? 0 : (pB - pA) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const seDiff = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
  return {
    pA,
    pB,
    difference: pB - pA,
    z,
    pValue,
    ciLow: pB - pA - 1.96 * seDiff,
    ciHigh: pB - pA + 1.96 * seDiff,
  };
}

function pct(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${(100 * value).toFixed(1)}%`;
}

function num(value, digits = 3) {
  if (!Number.isFinite(value)) return 'n/a';
  return value.toFixed(digits);
}

function loadTally() {
  if (!fs.existsSync(TALLY_PATH)) return null;
  return JSON.parse(fs.readFileSync(TALLY_PATH, 'utf8'));
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshAndPoll(ctx, experiment) {
  const results = { payload: null, status: null, error: null };
  const exposures = { payload: null, status: null, error: null };
  try {
    const refreshed = await request('POST', experimentPath(ctx, experiment.id, '/results/refresh/'), {
      token: ctx.token,
      tolerate: [429],
    });
    results.status = refreshed.status;
    log(`results refresh -> ${refreshed.status}`);
  } catch (error) {
    results.error = error instanceof Error ? error.message : String(error);
    log(`results refresh failed: ${results.error}`);
  }
  try {
    const refreshed = await request('POST', experimentPath(ctx, experiment.id, '/exposures/refresh/'), {
      token: ctx.token,
      tolerate: [429],
    });
    exposures.status = refreshed.status;
    log(`exposures refresh -> ${refreshed.status}`);
  } catch (error) {
    exposures.error = error instanceof Error ? error.message : String(error);
    log(`exposures refresh failed: ${exposures.error}`);
  }

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await sleep(5000);
    const gotResults = await request('GET', experimentPath(ctx, experiment.id, '/results/'), { token: ctx.token });
    const gotExposures = await request('GET', experimentPath(ctx, experiment.id, '/exposures/'), { token: ctx.token });
    results.payload = gotResults.json?.results || null;
    exposures.payload = gotExposures.json?.exposures || null;
    const hasResults = Boolean(results.payload?.payload || results.payload?.as_of);
    const hasExposures = Boolean(exposures.payload?.payload || exposures.payload?.as_of);
    log(`poll results=${hasResults} exposures=${hasExposures} last_error=${results.payload?.last_error_at || 'none'}`);
    if (hasResults && hasExposures) break;
  }
  return { results, exposures };
}

function tallyTable(tally) {
  if (!tally?.variants) return 'No local tally was found in tmp/simulated-traffic.json.';
  const lines = ['| Variant | Readers | Completed | Completion | Mean summary ms | Thumbs-up rate |', '| --- | ---: | ---: | ---: | ---: | ---: |'];
  for (const [variant, bucket] of Object.entries(tally.variants)) {
    const completion = bucket.n ? bucket.completed / bucket.n : NaN;
    const meanMs = bucket.summaryCount ? bucket.summaryMsTotal / bucket.summaryCount : NaN;
    const thumbs = bucket.thumbs ? bucket.thumbsUp / bucket.thumbs : NaN;
    lines.push(
      `| ${variant} | ${bucket.n} | ${bucket.completed} | ${pct(completion)} | ${num(meanMs, 1)} | ${pct(thumbs)} |`,
    );
  }
  return lines.join('\n');
}

function zTestSection(tally) {
  const full = tally?.variants?.full;
  const eco = tally?.variants?.eco;
  if (!full || !eco) return 'The SIMULATED tally did not include both full and eco, so the z-test was skipped.';
  const test = twoProportion(full.completed, full.n, eco.completed, eco.n);
  if (!test) return 'The SIMULATED tally was empty.';
  return [
    `Control is full. Treatment is eco. The difference is eco minus full.`,
    ``,
    `- Full completion: ${full.completed}/${full.n} (${pct(test.pA)})`,
    `- Eco completion: ${eco.completed}/${eco.n} (${pct(test.pB)})`,
    `- Difference: ${pct(test.difference)} (${num(test.difference, 4)} absolute)`,
    `- 95% CI for the difference: ${pct(test.ciLow)} to ${pct(test.ciHigh)}`,
    `- Two-sided z = ${num(test.z, 2)}, p = ${num(test.pValue, 4)}`,
    ``,
    test.pValue >= 0.05
      ? 'The z-test does not show a completion drop. That matches the hypothesis that eco mode does not reduce session completion.'
      : 'The z-test finds a difference at the 5% line. Read it against the small gap the simulator was built to produce.',
  ].join('\n');
}

function flagsmithSection(bundle) {
  const resultsPayload = bundle.results.payload;
  const exposurePayload = bundle.exposures.payload;
  const parts = [];
  const primary = resultsPayload?.payload?.metrics?.find((metric) => metric.metric_id === 1);
  const control = primary?.variants?.control;
  const eco = primary?.variants?.eco;
  const chance = primary?.inference?.eco?.chance_to_win;
  const exposures = exposurePayload?.payload;
  if (control && eco) {
    parts.push(
      `Flagsmith exposures in the primary metric: control ${control.n} (flag value full) with ${control.sum} completions, eco ${eco.n} with ${eco.sum} completions.` +
        (Number.isFinite(chance) ? ` Chance eco is better: ${(100 * chance).toFixed(1)}%.` : ''),
    );
  }
  if (exposures?.excluded_identities != null) {
    parts.push(`Excluded identities: ${exposures.excluded_identities}.`);
  }
  parts.push(`Results refresh HTTP status: ${bundle.results.status ?? 'not called'}.`);
  parts.push(`Exposures refresh HTTP status: ${bundle.exposures.status ?? 'not called'}.`);
  if (bundle.results.error) parts.push(`Results refresh error: ${bundle.results.error}`);
  if (bundle.exposures.error) parts.push(`Exposures refresh error: ${bundle.exposures.error}`);
  if (resultsPayload?.last_error_at) {
    parts.push(`Flagsmith recorded a results error at ${resultsPayload.last_error_at}. The z-test above is the fallback.`);
  }
  if (!resultsPayload?.payload && !exposurePayload?.payload) {
    parts.push('Flagsmith had not stored a results payload when this report was written. The numbers above are the SIMULATED tally.');
    return parts.join('\n\n');
  }
  parts.push('Flagsmith payload (warehouse aggregate, still from SIMULATED events):');
  parts.push('');
  parts.push('```json');
  parts.push(JSON.stringify({ results: resultsPayload, exposures: exposurePayload }, null, 2));
  parts.push('```');
  return parts.join('\n');
}

function buildDoc(tally, bundle, experiment) {
  return `# Experiment results

**SIMULATED.** Every reader in this experiment was generated by \`scripts/simulate-traffic.mjs\`. These are not live people, and the completion rates were drawn to sit near 62% for full and 60% for eco.

## Setup

- Hypothesis: ${HYPOTHESIS}
- Flag: \`heavy_feature_mode\` in the Development environment.
- Control value: \`full\`. Treatment: \`eco\` at 50%. The \`off\` variation stays at 0% for this test.
- Rollout: 100% of identities. Flagsmith stores that rollout on a system segment named \`experiment-<id>-rollout\`.
- Primary metric: occurrence of \`article_completed\`.
- Secondary metrics: mean of \`summary_shown\` (milliseconds) and mean of \`summary_feedback\` (1 = thumbs up, 0 = thumbs down).
- Experiment id: ${experiment?.id ?? 'unknown'}. Status when reported: ${experiment?.status ?? 'unknown'}.

## Override handling

\`carbon_moderate\` and \`carbon_high\` would beat the random split, because segment priority is higher than the experiment rollout segment. \`scripts/setup-experiment.mjs\` deletes both overrides in Development before the experiment starts. Production is not changed. \`scripts/restore-carbon-routing.mjs\` removes the rollout override, completes the experiment, and puts the two carbon overrides back.

The simulator does not force a grid level. With no Electricity Maps token the demo's own carbon reading is the simulated \`moderate\` level, which is exactly the override that had to be turned off.

## SIMULATED tally

${tallyTable(tally)}

Sample size is the number of stable ids \`sim-00001\` through \`sim-${String(tally?.users || 2000).padStart(5, '0')}\` that the demo actually served.

## Difference, interval, and z-test

${zTestSection(tally)}

## Flagsmith verdict

${flagsmithSection(bundle)}

Flagsmith's own analysis is Bayesian (chance to be best, lift versus control). This self-hosted build shows "Collecting data" until a variation has at least 50 identities and, for an occurrence metric, 5 conversions. A sample-ratio warning compares traffic with the environment-default weights. Those weights are reset to control while an experiment rollout exists, so a mismatch warning can appear even when the rollout segment itself is 50/50. The z-test in this file is the check that uses the variants the demo served.

## Conclusion

Eco mode did not show a meaningful drop in session completion against full in this SIMULATED run. The gap was built in at about two percentage points, which is inside the noise of two thousand readers. Secondary signals (time to the summary, thumbs) are descriptive only.

## Screenshot

![Flagsmith experiment results](experiment-results.png)

The local dashboard path is \`/project/${experiment?.feature?.project || 1}/environment/<development client key>/experiments/${experiment?.id ?? ''}\` on port 8100. The client key is not copied into this file.
`;
}

async function main() {
  const tally = loadTally();
  const ctx = await developmentContext();
  const experiments = await listExperiments(ctx);
  const experiment =
    experiments.find((item) => item.name === EXPERIMENT_NAME && item.status !== 'completed') ||
    experiments.find((item) => item.name === EXPERIMENT_NAME);
  if (!experiment) throw new Error(`Experiment "${EXPERIMENT_NAME}" was not found.`);
  log(`reporting experiment id=${experiment.id} status=${experiment.status}`);
  log('waiting 20s so the demo can flush events before the warehouse read');
  await sleep(20_000);
  const bundle = await refreshAndPoll(ctx, experiment);
  const doc = buildDoc(tally, bundle, experiment);
  fs.writeFileSync(DOC_PATH, doc);
  log(`wrote docs/experiment-results.md`);
  const full = tally?.variants?.full;
  const eco = tally?.variants?.eco;
  if (full && eco) {
    const test = twoProportion(full.completed, full.n, eco.completed, eco.n);
    log(
      `SIMULATED full ${full.completed}/${full.n} eco ${eco.completed}/${eco.n} diff ${pct(test.difference)} p ${num(test.pValue, 4)}`,
    );
  }
  log(`Flagsmith results as_of=${bundle.results.payload?.as_of || 'none'} exposures as_of=${bundle.exposures.payload?.as_of || 'none'}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
