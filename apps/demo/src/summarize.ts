const STOP = new Set(
  'a an the and or but if in on for to of as at by with from into over after before about than then this that these those it its is are was were be been being you your we our they their i not no'.split(
    ' ',
  ),
);

export interface Summary {
  text: string;
  label: 'local stand-in' | 'live model';
  cached: boolean;
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function score(sentence: string, frequency: Map<string, number>): number {
  const words = sentence.toLowerCase().match(/[a-z']+/g) ?? [];
  const total = words.reduce((sum, word) => sum + (frequency.get(word) ?? 0), 0);
  return total / Math.sqrt(words.length || 1);
}

/** Extractive summary used when no OpenAI-compatible key is configured. */
export function extractiveSummary(text: string, sentenceCount: number): string {
  const sentences = sentencesOf(text);
  if (sentences.length <= sentenceCount) return sentences.join(' ');
  const frequency = new Map<string, number>();
  for (const sentence of sentences) {
    for (const word of sentence.toLowerCase().match(/[a-z']+/g) ?? []) {
      if (word.length < 4 || STOP.has(word)) continue;
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }
  return sentences
    .map((sentence, index) => ({ sentence, index, score: score(sentence, frequency) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, sentenceCount)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.sentence)
    .join(' ');
}

const ecoCache = new Map<string, string>();

export function cachedEcoSummary(key: string, text: string): Summary {
  let summary = ecoCache.get(key);
  if (!summary) {
    summary = extractiveSummary(text, 1);
    ecoCache.set(key, summary);
  }
  return { text: summary, label: 'local stand-in', cached: true };
}

export async function liveSummary(text: string): Promise<Summary> {
  const apiKey = process.env.LLM_API_KEY?.trim();
  const baseUrl = process.env.LLM_BASE_URL?.trim();
  if (!apiKey || !baseUrl) {
    return { text: extractiveSummary(text, 4), label: 'local stand-in', cached: false };
  }
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL?.trim() || 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `Write a 90 word summary of this article for a news reader. No preamble.\n\n${text}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('LLM returned an empty summary');
    return { text: content, label: 'live model', cached: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'request failed';
    console.log(JSON.stringify({ msg: 'summary.fallback', reason }));
    return { text: extractiveSummary(text, 4), label: 'local stand-in', cached: false };
  }
}
