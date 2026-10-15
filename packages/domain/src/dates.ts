import type { IsoDate } from './types.ts';

export type DateParseResult =
  | { ok: true; date: IsoDate; format: 'iso' | 'cz' | 'excel' }
  | { ok: false; reason: 'empty' | 'invalid' };

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
// `3. 8. 2019` and `03.08.2019`
const CZ = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/;
// Excel serial day numbers that leaked into the export (e.g. `43552`); bounded to 1955-2064.
const EXCEL_SERIAL = /^\d{5}$/;
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

export function parseDate(raw: string): DateParseResult {
  const value = raw.trim();
  if (value === '') return { ok: false, reason: 'empty' };

  let match = ISO.exec(value);
  if (match) return fromParts(Number(match[1]), Number(match[2]), Number(match[3]), 'iso');

  match = CZ.exec(value);
  if (match) return fromParts(Number(match[3]), Number(match[2]), Number(match[1]), 'cz');

  if (EXCEL_SERIAL.test(value)) {
    return {
      ok: true,
      date: toIso(new Date(EXCEL_EPOCH_UTC + Number(value) * DAY_MS)),
      format: 'excel',
    };
  }
  return { ok: false, reason: 'invalid' };
}

function fromParts(
  year: number,
  month: number,
  day: number,
  format: 'iso' | 'cz'
): DateParseResult {
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects impossible dates such as 31. 9. 2026 that Date would silently roll over.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, date: toIso(date), format };
}

function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

function toUtc(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** Adds calendar months; the day is clamped to the end of the target month (31. 1. + 1 -> 28. 2.). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = toUtc(date);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toIso(target);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIso(new Date(toUtc(date).getTime() + days * DAY_MS));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS);
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

/** Czech display format used in messages: `2026-10-01` -> `1. 10. 2026`. */
export function formatCz(date: IsoDate): string {
  const [y, m, d] = date.split('-');
  return `${Number(d)}. ${Number(m)}. ${y}`;
}
