/** Comparison key: no diacritics, lower case, single spaces. `  SPRÁVA  budov ` → `sprava budov`. */
export function foldKey(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** `  LUCIE` → `Lucie`, `růžička` → `Růžička`. */
export function normalizePersonName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toLocaleUpperCase('cs') + word.slice(1).toLocaleLowerCase('cs'))
    .join(' ');
}

/** Same person regardless of word order, case and diacritics (`Kralova Hana` = `Hana Králová`). */
export function sameName(a: string, b: string): boolean {
  const tokens = (s: string) => foldKey(s).split(' ').sort().join(' ');
  return tokens(a) === tokens(b);
}

export type EmailResult =
  { ok: true; email: string; repaired: boolean } | { ok: false; email: null };

const EMAIL = /^[^@\s,]+@[^@\s,]+\.[a-z]{2,}$/i;

/** Repairs obvious typos (stray spaces, `,` instead of `.`); anything else is reported as invalid. */
export function normalizeEmail(raw: string): EmailResult {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === '') return { ok: false, email: null };
  const repaired = trimmed.replace(/\s+/g, '').replace(/,/g, '.');
  if (!EMAIL.test(repaired)) return { ok: false, email: null };
  return { ok: true, email: repaired, repaired: repaired !== trimmed };
}

/**
 * Cell content a spreadsheet would execute as a formula (`=HYPERLINK(...)`, `+1+1`, `@SUM`).
 * Such values are displayed as plain text and escaped on export.
 */
export function looksLikeFormula(value: string): boolean {
  return /^[=+\-@\t\r]/.test(value.trim());
}

/**
 * Picks the most frequent spelling for each folded key, so `VZOROVÝ ŠKOLICÍ ÚSTAV` and
 * `Vzorový školicí ústav` resolve to the spelling used by the majority of rows.
 */
export function buildCanonicalSpelling(values: Iterable<string>): (value: string) => string {
  const counts = new Map<string, Map<string, number>>();
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, ' ');
    if (value === '') continue;
    const key = foldKey(value);
    const spellings = counts.get(key) ?? new Map<string, number>();
    spellings.set(value, (spellings.get(value) ?? 0) + 1);
    counts.set(key, spellings);
  }
  const canonical = new Map<string, string>();
  for (const [key, spellings] of counts) {
    const [best] = [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (best) canonical.set(key, best[0]);
  }
  return (value) => canonical.get(foldKey(value)) ?? value.trim();
}
