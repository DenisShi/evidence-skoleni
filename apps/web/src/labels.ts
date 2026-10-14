import type {
  EmployeeState,
  RequirementState,
  Severity,
  SourceFile,
  Timing,
  UnassignedReason,
} from '@evidence/domain';
import dayjs from 'dayjs';

export const STATUS: Record<RequirementState, { label: string; color: string }> = {
  ok: { label: 'Platné', color: 'green' },
  expiring: { label: 'Brzy vyprší', color: 'gold' },
  expired: { label: 'Prošlé', color: 'red' },
  missing: { label: 'Chybí', color: 'volcano' },
};

export const EMPLOYEE_STATE: Record<EmployeeState, { label: string; color: string }> = {
  active: { label: 'Aktivní', color: 'default' },
  starting: { label: 'Nastupující', color: 'blue' },
  leaving: { label: 'Odcházející', color: 'purple' },
  parental_leave: { label: 'Rodičovská', color: 'cyan' },
  terminated: { label: 'Ukončen', color: 'default' },
};

export const TIMING: Record<Timing, { label: string; color: string; hint: string }> = {
  overdue: {
    label: 'Co nejdříve',
    color: 'red',
    hint: 'Školení už k referenčnímu datu chybí nebo prošlo.',
  },
  'on-time': { label: 'Včas', color: 'green', hint: 'Termín je před koncem platnosti.' },
  'after-start': {
    label: 'Po nástupu',
    color: 'blue',
    hint: 'Nastupující: první termín je až po dni nástupu – vstupní školení zajistit při nástupu jinak (např. vedoucí).',
  },
  late: {
    label: 'Pozdě',
    color: 'orange',
    hint: 'Volné místo je až po konci platnosti – chybí dřívější termín.',
  },
};

export const UNASSIGNED_REASON: Record<UnassignedReason, string> = {
  'parental-leave': 'Na rodičovské – naplánovat po návratu',
  'no-session': 'Není vypsán žádný použitelný termín',
  'no-capacity': 'Všechny termíny jsou plné',
};

export const UNUSABLE_SESSION_REASON = {
  past: 'Proběhl (datum ≤ referenční datum)',
  cancelled: 'Zrušen',
  duplicate: 'Duplicitní řádek',
  'no-capacity': 'Kapacita 0',
} as const;

export const SEVERITY: Record<Severity, { label: string; color: string }> = {
  error: { label: 'Vynecháno', color: 'red' },
  warning: { label: 'Opraveno / předpoklad', color: 'orange' },
  info: { label: 'Informace', color: 'blue' },
};

export const SOURCE_FILE: Record<SourceFile, string> = {
  zamestnanci: 'zamestnanci.csv',
  absolvovana_skoleni: 'absolvovana_skoleni.csv',
  katalog_skoleni: 'katalog_skoleni.csv',
  terminy_skoleni: 'terminy_skoleni.csv',
};

/** `2026-10-01` → `1. 10. 2026`; empty for missing dates. */
export function formatDate(date: string | null | undefined): string {
  return date ? dayjs(date).format('D. M. YYYY') : '—';
}

export function formatCzk(amount: number | null): string {
  return amount === null ? '—' : `${amount.toLocaleString('cs-CZ')} Kč`;
}

export function percent(part: number, total: number): string {
  return total === 0 ? '—' : `${Math.round((part / total) * 100)} %`;
}

/** Czech plural of „den“: 1 den, 2–4 dny, 5+ dní. */
export function days(n: number): string {
  const abs = Math.abs(n);
  return `${abs} ${abs === 1 ? 'den' : abs >= 2 && abs <= 4 ? 'dny' : 'dní'}`;
}

/** Text for a deadline relative to the reference date. */
export function daysLeftLabel(value: number | null): string {
  if (value === null) return '—';
  if (value < 0) return `${days(value)} po termínu`;
  if (value === 0) return 'dnes';
  return `za ${days(value)}`;
}
