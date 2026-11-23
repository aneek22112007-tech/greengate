#!/usr/bin/env node
/**
 * SIMULATED readers. Stable ids sim-00001 onward hit the real demo.
 * Completion is about 62% on full and about 60% on eco, with noise.
 * Every line this script prints is labelled SIMULATED.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tmp', 'simulated-traffic.json');
const DEMO = (process.env.DEMO_URL || 'http://localhost:3000').replace(/\/$/, '');
const USERS = Number(process.env.GREENGATE_SIM_USERS || 2000);
const CONCURRENCY = Number(process.env.GREENGATE_SIM_CONCURRENCY || 12);
const ARTICLE = 'the-hour-the-grid-asks';

function log(message) {
  console.log(`SIMULATED ${message}`);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function identifier(index) {
  return `sim-${String(index).padStart(5, '0')}`;
}

function emptyBucket() {
  return {
    n: 0,
    completed: 0,
    summaryCount: 0,
    summaryMsTotal: 0,
    thumbs: 0,
    thumbsUp: 0,
  };
}

async function hit(method, urlPath, id, body) {
  const response = await fetch(`${DEMO}${urlPath}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-gg-uid': id,
      'x-gg-simulated': '1',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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
  if (!response.ok) {
    throw new Error(`${method} ${urlPath} -> ${response.status} ${text.slice(0, 240)}`);
  }
  return json;
}

async function oneUser(index) {
  const id = identifier(index);
  const rng = mulberry32(index * 10007 + 20261123);
  const feed = await hit('GET', `/api/feed?identifier=${encodeURIComponent(id)}`, id);
  const variant = feed?.decision?.variant;
  if (!variant) throw new Error(`feed for ${id} had no variant`);
  if (feed.trafficLabel !== 'SIMULATED') {
    throw new Error(`feed for ${id} was not labelled SIMULATED`);
  }
  const article = await hit('GET', `/api/articles/${ARTICLE}?identifier=${encodeURIComponent(id)}`, id);
  const bucket = emptyBucket();
  bucket.n = 1;
  if (article?.summary) {
    const latency = Number(article.summaryLatencyMs) || 0;
    bucket.summaryCount = 1;
    bucket.summaryMsTotal = latency;
    await hit('POST', '/api/events', id, {
      name: 'summary_shown',
      identifier: id,
      slug: ARTICLE,
      value: latency,
    });
    if (rng() < 0.55) {
      const upBias = variant === 'eco' ? 0.68 : 0.71;
      const up = rng() < upBias;
      bucket.thumbs = 1;
      bucket.thumbsUp = up ? 1 : 0;
      await hit('POST', '/api/events', id, {
        name: 'summary_feedback',
        identifier: id,
        slug: ARTICLE,
        value: up ? 1 : 0,
      });
    }
  }
  const base = variant === 'eco' ? 0.6 : variant === 'full' ? 0.62 : 0.2;
  const threshold = Math.min(0.95, Math.max(0.05, base + (rng() - 0.5) * 0.04));
  if (rng() < threshold) {
    bucket.completed = 1;
    await hit('POST', '/api/events', id, {
      name: 'article_completed',
      identifier: id,
      slug: ARTICLE,
      value: 1,
    });
  }
  return { variant, bucket };
}

function addInto(target, bucket) {
  for (const key of Object.keys(bucket)) target[key] += bucket[key];
}

async function main() {
  if (!Number.isFinite(USERS) || USERS < 2000) {
    throw new Error('GREENGATE_SIM_USERS must be at least 2000.');
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const health = await hit('GET', '/api/health', 'sim-health');
  if (!health?.flagsmith) throw new Error('Demo is up but Flagsmith is not connected.');
  log(`demo ${DEMO} users=${USERS} article=${ARTICLE}`);

  const variants = {};
  let cursor = 1;
  // Users finish out of order with concurrency, so checks and progress use the finished count.
  let finished = 0;
  const startedAt = new Date().toISOString();

  async function worker() {
    while (cursor <= USERS) {
      const index = cursor;
      cursor += 1;
      const { variant, bucket } = await oneUser(index);
      if (!variants[variant]) variants[variant] = emptyBucket();
      addInto(variants[variant], bucket);
      finished += 1;
      if (finished === 40) {
        const full = variants.full?.n || 0;
        const eco = variants.eco?.n || 0;
        log(`early split full=${full} eco=${eco} other=${finished - full - eco}`);
        if (full < 5 || eco < 5) {
          throw new Error('The first 40 SIMULATED users were not split across full and eco. Stop and check the experiment.');
        }
      }
      if (finished % 200 === 0) {
        log(`progress ${finished}/${USERS} ${JSON.stringify(variants)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const flushed = await hit('POST', '/api/events/flush', 'sim-flush');
  const finishedAt = new Date().toISOString();
  const report = {
    label: 'SIMULATED',
    demo: DEMO,
    users: USERS,
    article: ARTICLE,
    startedAt,
    finishedAt,
    flush: flushed,
    variants,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  log(`wrote tmp/simulated-traffic.json`);
  for (const [variant, bucket] of Object.entries(variants)) {
    const rate = bucket.n ? (100 * bucket.completed) / bucket.n : 0;
    log(`${variant} n=${bucket.n} completed=${bucket.completed} rate=${rate.toFixed(1)}%`);
  }
}

main().catch((error) => {
  console.error(`SIMULATED failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
