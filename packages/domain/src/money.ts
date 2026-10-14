export type MoneyParseResult =
  { ok: true; value: number | null; negative: boolean } | { ok: false };

/** `1 500,00`, `380,- Kč`, `2 100 Kč`, `zdarma` → number of CZK; empty → `null`. */
export function parseCzk(raw: string): MoneyParseResult {
  const value = raw.trim();
  if (value === '') return { ok: true, value: null, negative: false };
  if (/^zdarma$/i.test(value)) return { ok: true, value: 0, negative: false };

  const cleaned = value
    .replace(/kč/i, '')
    .replace(/\s/g, '') // `\s` covers no-break spaces used as thousands separators
    .replace(/,-$/, '')
    .replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return { ok: false };
  const amount = Number(cleaned);
  return { ok: true, value: amount, negative: amount < 0 };
}
