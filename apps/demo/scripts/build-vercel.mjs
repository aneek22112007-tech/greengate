// Builds a self-contained Vercel deploy folder for the demo: static files at the root,
// one bundled function at api/index.mjs, and a vercel.json that routes /api/* to it.
// Usage: node apps/demo/scripts/build-vercel.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const demo = path.resolve(here, '..');
const out = path.resolve(process.argv[2] || path.join(demo, 'deploy', 'vercel'));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'api'), { recursive: true });

await build({
  entryPoints: [path.join(demo, 'src', 'vercel.ts')],
  outfile: path.join(out, 'api', 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  minify: true,
  legalComments: 'none',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

for (const file of fs.readdirSync(path.join(demo, 'public'))) {
  fs.copyFileSync(path.join(demo, 'public', file), path.join(out, file));
}

fs.writeFileSync(
  path.join(out, 'vercel.json'),
  `${JSON.stringify(
    {
      rewrites: [{ source: '/api/(.*)', destination: '/api/index.mjs' }],
      functions: { 'api/index.mjs': { maxDuration: 10 } },
    },
    null,
    2,
  )}\n`,
);
fs.writeFileSync(path.join(out, 'package.json'), `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`);
console.log(`Vercel bundle written to ${out}`);
