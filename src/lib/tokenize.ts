// Shared tokenizer for the Lexicon (#1) and Artist tracker (#5).

const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by',
  'or', 'as', 'is', 'be', 'are', 'was', 'were', 'it', 'its', "it's", 'this',
  'that', 'these', 'those', 'you', 'your', "you're", 'we', 'our', 'us', 'i',
  'my', 'me', 'they', 'them', 'their', 'he', 'she', 'his', 'her', 'will',
  'would', 'could', 'should', 'do', 'does', 'did', 'have', 'has', 'had',
  'but', 'if', 'so', 'not', 'no', 'yes', 'all', 'any', 'some', 'one', 'two',
  'from', 'up', 'down', 'out', 'into', 'about', 'before', 'after', 'over',
  'under', 'again', 'further', 'then', 'than', 'just', 'only', 'own', 'same',
  'too', 'very', 's', 't', 'can', 'now', 'who', 'what', 'when', 'where',
  'why', 'how', 'amp', 'pm', 'am',
]);

/** Lowercase, strip punctuation/diacritics, split on whitespace, drop stopwords + length<2. */
export function tokens(text: string | undefined | null): string[] {
  if (!text) return [];
  const normalized = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized
    .split(' ')
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Yields all bigrams + trigrams from a token list (preserving order). */
export function ngrams(toks: string[], n: number): string[] {
  if (toks.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i + n <= toks.length; i++) {
    out.push(toks.slice(i, i + n).join(' '));
  }
  return out;
}

/** Increment a Map<string, number> entry by 1. */
export function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Convert a count Map into a sorted [key, count] array, descending. */
export function topN(map: Map<string, number>, n: number): Array<[string, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// Normalize an artist/performer string for fuzzy matching across burns.
// Strips "DJ", "MC", leading articles, common modifiers.
export function normalizeArtistName(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(dj|mc|the|a|an|sir|lord|lady|dame|prof|dr)\b\.?/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
