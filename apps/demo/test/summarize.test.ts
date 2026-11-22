import { describe, expect, it } from 'vitest';
import { cachedEcoSummary, extractiveSummary } from '../src/summarize.js';

const article = 'Alpha grids spike after dusk. Bravo turbines cover the dawn. Charlie caches the sentence readers see twice. Delta pauses the heavy path. Echo keeps the article itself.';

describe('summaries', () => {
  it('keeps the eco summary to one cached sentence', () => {
    const first = cachedEcoSummary('demo', article);
    const second = cachedEcoSummary('demo', article);
    expect(first.text.split(/(?<=[.!?])\s+/)).toHaveLength(1);
    expect(second.cached).toBe(true);
    expect(second.text).toBe(first.text);
    expect(first.label).toBe('local stand-in');
  });

  it('returns a longer extract for the full path', () => {
    const full = extractiveSummary(article, 3);
    expect(full.split(/(?<=[.!?])\s+/).length).toBeGreaterThan(1);
  });
});
