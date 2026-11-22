#!/usr/bin/env node
/**
 * Prints Electricity Maps levels for IN-SO, DE, and FR.
 * Without ELECTRICITY_MAPS_TOKEN, prints simulated levels and says so.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ElectricityMapsProvider, SimulatedProvider } from '../packages/greengate/dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index);
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(index + 1);
  }
}

const zones = ['IN-SO', 'DE', 'FR'];
const token = process.env.ELECTRICITY_MAPS_TOKEN?.trim();
if (!token) {
  const provider = new SimulatedProvider('moderate');
  console.log('ELECTRICITY_MAPS_TOKEN is not set. Simulated provider (simulated:true):');
  for (const zone of zones) {
    const reading = await provider.getLevel({ zone });
    console.log(`${zone} level=${reading.level} source=${reading.source} simulated=${reading.simulated}`);
  }
  process.exit(0);
}

const provider = new ElectricityMapsProvider({ token });
console.log('Live Electricity Maps levels:');
for (const zone of zones) {
  const reading = await provider.getLevel({ zone });
  console.log(`${zone} level=${reading.level} source=${reading.source} simulated=${reading.simulated} at=${reading.datetime}`);
}
