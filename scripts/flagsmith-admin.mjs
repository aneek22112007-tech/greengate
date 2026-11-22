#!/usr/bin/env node
/**
 * Shared Flagsmith admin calls for the experiment scripts.
 * Never prints passwords, server keys, or organisation keys.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');
const BASE = (process.env.FLAGSMITH_BASE_URL || 'http://localhost:8100').replace(/\/$/, '');
const API = `${BASE}/api/v1`;

export const EXPERIMENT_NAME = 'Full vs eco completion';
export const HYPOTHESIS = 'Eco mode does not reduce session completion compared with full.';
export const CARBON_OVERRIDES = [
  { segment: 'carbon_high', value: 'off', priority: 0 },
  { segment: 'carbon_moderate', value: 'eco', priority: 1 },
];
export const METRICS = [
  {
    name: 'Article completed',
    aggregation: 'occurrence',
    direction: 'up',
    event: 'article_completed',
    expected: 'increase',
    description: 'The reader finished the article. Primary conversion.',
  },
  {
    name: 'Time to first summary',
    aggregation: 'mean',
    direction: 'down',
    event: 'summary_shown',
    expected: 'decrease',
    description: 'Milliseconds until the summary was shown. SIMULATED traffic sends the demo latency.',
  },
  {
    name: 'Thumbs-up rate',
    aggregation: 'mean',
    direction: 'up',
    event: 'summary_feedback',
    expected: 'increase',
    description: 'Mean of summary feedback. 1 is thumbs up and 0 is thumbs down.',
  },
];

export function redact(text) {
  return String(text)
    .replace(/ser\.[A-Za-z0-9_-]+/g, 'ser.[redacted]')
    .replace(/\/environments\/[^/\s"]+\//g, '/environments/[redacted]/')
    .replace(/"(key|token|password|api_key|server_side_api_key)"\s*:\s*"[^"]*"/g, '"$1":"[redacted]"');
}

export function log(message) {
  console.log(message);
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadDotEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  return parseEnv(fs.readFileSync(ENV_PATH, 'utf8'));
}

export async function request(method, url, { token, envKey, body, tolerate } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Token ${token}`;
  if (envKey) headers['X-Environment-Key'] = envKey;
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!response.ok && !(tolerate || []).includes(response.status)) {
    const pathOnly = url.replace(BASE, '');
    throw new Error(`${method} ${pathOnly} -> ${response.status} ${redact(text).slice(0, 800)}`);
  }
  return { status: response.status, json, text };
}

export async function listAll(token, pathAndQuery) {
  const items = [];
  let next = pathAndQuery.startsWith('http') ? pathAndQuery : `${API}${pathAndQuery}`;
  for (let page = 0; page < 20 && next; page += 1) {
    const { json } = await request('GET', next, { token });
    if (Array.isArray(json)) return json;
    items.push(...(json?.results || []));
    if (!json?.next) break;
    const nextUrl = new URL(json.next);
    next = `${BASE}${nextUrl.pathname}${nextUrl.search}`;
  }
  return items;
}

export async function login() {
  const env = loadDotEnv();
  const email = env.FLAGSMITH_ADMIN_EMAIL;
  const password = env.FLAGSMITH_ADMIN_PASSWORD;
  if (!email || !password || password === 'replace-me') {
    throw new Error('Flagsmith admin credentials are missing from .env.');
  }
  const { json } = await request('POST', `${API}/auth/login/`, {
    body: { email, password },
  });
  if (!json?.key) throw new Error('Admin login did not return a token.');
  return { token: json.key, env };
}

export async function developmentContext() {
  const { token, env } = await login();
  const projectId = env.FLAGSMITH_PROJECT_ID || '1';
  const environments = await listAll(token, `/environments/?project=${projectId}&page_size=100`);
  const environment = environments.find((item) => item.name === 'Development');
  if (!environment?.api_key) throw new Error('Development environment was not found.');
  const features = await listAll(token, `/projects/${projectId}/features/?page_size=100`);
  const feature = features.find((item) => item.name === 'heavy_feature_mode');
  if (!feature) throw new Error('heavy_feature_mode was not found.');
  const detail = await request('GET', `${API}/projects/${projectId}/features/${feature.id}/`, { token });
  const options = detail.json?.multivariate_options || [];
  const ecoOption = options.find((item) => item.key === 'eco' || item.string_value === 'eco');
  if (!ecoOption) throw new Error('The eco variation is missing a key.');
  return { token, env, projectId, environment, feature, options, ecoOption };
}

export function flagValue(flags, name) {
  const flag = (flags || []).find((item) => (item.feature?.name || item.feature_name || item.name) === name);
  if (!flag) return null;
  if (typeof flag.feature_state_value === 'string') return flag.feature_state_value;
  if (flag.feature_state_value && typeof flag.feature_state_value === 'object') {
    return flag.feature_state_value.string_value ?? null;
  }
  return flag.value ?? null;
}

function segmentIdOf(featureSegment) {
  return featureSegment.segment?.id || featureSegment.segment;
}

export async function featureSegmentsFor(ctx) {
  return listAll(
    ctx.token,
    `/features/feature-segments/?environment=${ctx.environment.id}&feature=${ctx.feature.id}&page_size=100`,
  );
}

export async function deleteCarbonOverrides(ctx) {
  const segments = await listAll(ctx.token, `/projects/${ctx.projectId}/segments/?page_size=100`);
  const featureSegments = await featureSegmentsFor(ctx);
  for (const spec of CARBON_OVERRIDES) {
    const segment = segments.find((item) => item.name === spec.segment);
    if (!segment) {
      log(`segment ${spec.segment} is already absent`);
      continue;
    }
    const matches = featureSegments.filter((item) => segmentIdOf(item) === segment.id);
    for (const featureSegment of matches) {
      // Feature states reject DELETE on this image. Removing the feature-segment
      // deletes the override. use_v2_feature_versioning is off.
      await request('DELETE', `${API}/features/feature-segments/${featureSegment.id}/`, {
        token: ctx.token,
        tolerate: [404],
      });
      log(`deleted feature segment ${featureSegment.id} for ${spec.segment}`);
    }
    if (matches.length === 0) log(`override ${spec.segment} already disabled`);
  }
}

async function ensureSegmentOverride(ctx, segment, value, priority) {
  const featureSegments = await featureSegmentsFor(ctx);
  let featureSegment = featureSegments.find((item) => segmentIdOf(item) === segment.id);
  if (!featureSegment) {
    const created = await request('POST', `${API}/features/feature-segments/`, {
      token: ctx.token,
      body: {
        feature: ctx.feature.id,
        segment: segment.id,
        environment: ctx.environment.id,
        priority,
      },
    });
    featureSegment = created.json;
    log(`created feature segment ${segment.name} priority ${priority}`);
  }
  const states = await listAll(
    ctx.token,
    `/features/featurestates/?feature=${ctx.feature.id}&environment=${ctx.environment.id}&page_size=200`,
  );
  const existing = states.find(
    (state) => state.feature_segment === featureSegment.id || state.feature_segment?.id === featureSegment.id,
  );
  if (existing) {
    log(`reused override ${segment.name}`);
    return;
  }
  await request('POST', `${API}/features/featurestates/`, {
    token: ctx.token,
    body: {
      feature: ctx.feature.id,
      feature_segment: featureSegment.id,
      environment: ctx.environment.id,
      enabled: true,
      feature_state_value: { type: 'unicode', string_value: value },
    },
  });
  log(`restored override ${segment.name} -> ${value}`);
}

export async function restoreCarbonOverrides(ctx) {
  const segments = await listAll(ctx.token, `/projects/${ctx.projectId}/segments/?page_size=100`);
  for (const spec of CARBON_OVERRIDES) {
    const segment = segments.find((item) => item.name === spec.segment);
    if (!segment) throw new Error(`Segment ${spec.segment} is missing. Run bootstrap first.`);
    await ensureSegmentOverride(ctx, segment, spec.value, spec.priority);
  }
}

export async function deleteRolloutOverrides(ctx) {
  const segments = await listAll(ctx.token, `/projects/${ctx.projectId}/segments/?page_size=200`);
  const rolloutIds = new Set(
    segments.filter((item) => /^experiment-\d+-rollout$/.test(item.name)).map((item) => item.id),
  );
  if (rolloutIds.size === 0) {
    log('no experiment rollout segment to remove');
    return;
  }
  const featureSegments = await featureSegmentsFor(ctx);
  for (const featureSegment of featureSegments) {
    if (!rolloutIds.has(segmentIdOf(featureSegment))) continue;
    await request('DELETE', `${API}/features/feature-segments/${featureSegment.id}/`, {
      token: ctx.token,
      tolerate: [404, 400],
    });
    log(`deleted rollout feature segment ${featureSegment.id}`);
  }
}

export async function listExperiments(ctx) {
  return listAll(ctx.token, `/environments/${ctx.environment.api_key}/experiments/?page_size=100`);
}

export function experimentPath(ctx, id, suffix = '') {
  return `${API}/environments/${ctx.environment.api_key}/experiments/${id}${suffix}`;
}

export async function verifyCarbonRouting(ctx) {
  const serverKey = ctx.env.FLAGSMITH_ENVIRONMENT_KEY_DEVELOPMENT;
  if (!serverKey || serverKey.includes('replace-me')) {
    throw new Error('Development server key is missing from .env.');
  }
  const cases = [
    ['low', 'full'],
    ['moderate', 'eco'],
    ['high', 'off'],
  ];
  for (const [level, expected] of cases) {
    const { json } = await request('POST', `${API}/identities/`, {
      envKey: serverKey,
      body: {
        identifier: `greengate-verify-${level}`,
        traits: [{ trait_key: 'carbon_level', trait_value: level }],
      },
    });
    const actual = flagValue(json?.flags, 'heavy_feature_mode');
    log(`verify carbon_level=${level} -> ${actual} (expected ${expected})`);
    if (actual !== expected) {
      throw new Error(`Routing check failed for ${level}: got ${actual}, expected ${expected}`);
    }
  }
  log('carbon routing restored');
}

export { API, BASE, ROOT };
