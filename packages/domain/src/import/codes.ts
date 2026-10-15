import { buildCanonicalSpelling, foldKey } from '../text.ts';

/**
 * ` bozp_z ` -> `BOZP-Z`, then explicit typo corrections from {@link CODE_ALIASES}.
 * Unknown codes are not guessed.
 */
export function normalizeCode(raw: string): string {
  const code = normalizeCodeFormat(raw);
  return CODE_ALIASES[code] ?? code;
}

/** True when the code was corrected by {@link CODE_ALIASES}, not just reformatted. */
export function isKnownTypo(raw: string): boolean {
  return normalizeCodeFormat(raw) in CODE_ALIASES;
}

function normalizeCodeFormat(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-');
}

/**
 * Explicit, reviewed corrections. Deliberately not a fuzzy match: `BOZP-X` is one letter away
 * from `BOZP-Z` too, but nothing says it is the same training.
 */
export const CODE_ALIASES: Readonly<Record<string, string>> = {
  KYB3R: 'KYBER',
};

/**
 * Unit names come in many spellings (`SPRÁVA BUDOV`, `Sprava budov`, `Studijní` for
 * `Studijní oddělení`). Spellings are grouped by folded key, the majority spelling wins, and a
 * key that is a word-prefix of exactly one other key (`studijni` -> `studijni oddeleni`) is merged.
 */
export function buildUnitNormalizer(rawUnits: readonly string[]): (raw: string) => string | null {
  const spelling = buildCanonicalSpelling(rawUnits);
  const keys = [...new Set(rawUnits.map(foldKey).filter((k) => k !== ''))];
  const prefixAlias = new Map<string, string>();
  for (const key of keys) {
    const longer = keys.filter((other) => other.startsWith(`${key} `));
    if (longer.length === 1 && longer[0]) prefixAlias.set(key, longer[0]);
  }
  return (raw) => {
    const key = foldKey(raw);
    if (key === '') return null;
    return spelling(prefixAlias.get(key) ?? key);
  };
}
