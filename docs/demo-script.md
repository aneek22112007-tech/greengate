# Demo script

About two and a half minutes. Record the news reader and the Flagsmith dashboard. Say the experiment readers are SIMULATED the first time the results appear.

## 0:00 Problem

Show the README hero, or start on the news reader. Say: datacentres are on track for 70% more carbon emissions by 2030, and AI is most of the extra electricity, according to the Guardian’s report of the IEA figures. GreenGate is one flag that makes a heavy feature quieter when the grid is dirty.

## 0:20 The flag doing the work

Open [http://localhost:3000](http://localhost:3000). Point at the dev panel. It is hidden in production.

1. Click **low**. The badge says LOW and FULL. The hero says “Autoplay · animated stand-in”. The summary says “local stand-in”. The meter shows watt-hours used and almost nothing saved. Say the numbers are estimates.
2. Click **moderate**. The badge says ECO. The hero is a still image. The summary says cached. The saved bar grows.
3. Click **high**. The page says “Paused because the grid is dirty right now”. Used watt-hours drop to zero. Point at “decided by Flagsmith”.

## 1:10 Flagsmith

Open [http://localhost:8100](http://localhost:8100) and sign in with the admin user from `.env`. Do not show the password.

1. Open the GreenGate project, Development, feature `heavy_feature_mode`.
2. Show the segment overrides: `carbon_high` serves off, `carbon_moderate` serves eco. Say low falls through to the control value full.
3. Open Experiments and the experiment “Full vs eco completion”.

## 1:40 The result, without overselling it

On the experiment page, read the scorecards out loud: about 2,001 users enrolled, eco at a 55% chance to be best, lift +0.4%. Then point at the credible interval, −6.6% to +7.4%. Say the interval crosses zero, so the honest conclusion is that eco did not show a completion change. Say every one of those readers was SIMULATED by `scripts/simulate-traffic.mjs`, and the write-up is `docs/experiment-results.md`.

## 2:10 Use it

Scroll the README to “Use GreenGate in your app”. Read the `createGreenGate` call. Say `evaluate` returns the variant, and the kill switch `greengate_enabled` forces full. Stop on the quickstart commands.
