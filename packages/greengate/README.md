# @greengate/flagsmith

Carbon-aware feature modes for Flagsmith. The full API reference is filled in with the judge-facing docs.

```ts
import { createGreenGate } from '@greengate/flagsmith';

const greengate = createGreenGate({
  flagsmith,
  electricityMapsToken: process.env.ELECTRICITY_MAPS_TOKEN,
  mapping: 'strict', // low→full, moderate→eco, high→off
  mode: 'traits',
});

const decision = await greengate.evaluate(userId, { plan: 'free' });
```

Presets: `strict` (low→full, moderate→eco, high→off) and `gentle` (low and moderate→full, high→eco). Custom strings look like `low=full,moderate=eco,high=off`.
