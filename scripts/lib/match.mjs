// Fuzzy festival matching for the multi-source merge step.
//
// Node-side twin of the logic in src/data/sanctioned.ts — scripts and the SPA
// are separate runtimes, so the small duplication is deliberate.

export function normalize(raw) {
  return (raw ?? '')
    .toLowerCase()
    .replace(/\(tentative dates?\)/gi, '')
    .replace(/\b20\d{2}\b/g, '')
    .replace(/[‐-―‘-‟]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function rootKey(raw) {
  return normalize(raw).split(/[:–—-]/)[0].trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = [...Array(b.length + 1).keys()];
  const curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

// Two festival titles refer to the same burn?
export function sameBurn(titleA, titleB) {
  const ra = rootKey(titleA);
  const rb = rootKey(titleB);
  if (!ra || !rb) return false;
  if (ra === rb) return true;
  const na = normalize(titleA);
  const nb = normalize(titleB);
  if (na.length >= 5 && nb.length >= 5 && (na.includes(nb) || nb.includes(na))) return true;
  if (ra.length >= 4 && rb.length >= 4) {
    const max = Math.min(ra.length, rb.length) <= 6 ? 1 : 2;
    if (Math.abs(ra.length - rb.length) <= max && levenshtein(ra, rb) <= max) return true;
  }
  return false;
}

// Identity = burn + calendar year. Two same-named festivals in different
// years (apogaea-2025 vs apogaea-2026) are distinct and must NOT be deduped;
// the same burn from two sources in the same year IS one festival.
export function festivalYear(festival) {
  const y = new Date(festival.start).getUTCFullYear();
  return Number.isFinite(y) ? y : 0;
}

// Slug minus a trailing -YYYY — the stable cross-year key for a burn.
export function burnKey(slug) {
  return String(slug).replace(/-(\d{4})$/, '');
}
