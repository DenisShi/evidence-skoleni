import type { CsvTable } from '../csv.ts';
import { foldKey } from '../text.ts';
import type { Requirement, TrainingType } from '../types.ts';
import { normalizeCode } from './codes.ts';
import type { AddIssue } from './issues.ts';

export function importCatalog(table: CsvTable, addIssue: AddIssue): TrainingType[] {
  const types: TrainingType[] = [];
  for (const row of table.rows) {
    const code = normalizeCode(row.kod ?? '');
    if (code === '') {
      addIssue('řádek bez kódu', 'chybi-kod', 'error', 'Druh školení bez kódu – vynechán.');
      continue;
    }
    if (types.some((t) => t.code === code)) {
      addIssue(code, 'duplicitni-kod', 'error', 'Kód je v katalogu dvakrát – použit první výskyt.');
      continue;
    }
    types.push({
      code,
      name: (row.nazev ?? '').trim(),
      validityMonths: parseValidity(code, row.platnost_mesicu ?? '', addIssue),
      requirement: parseRequirement(code, row.povinne_pro ?? '', addIssue),
    });
  }
  return types;
}

function parseValidity(code: string, raw: string, addIssue: AddIssue): number | null {
  const value = raw.trim();
  if (value === '') return null;
  if (/^\d+$/.test(value)) {
    const months = Number(value);
    if (months === 0) {
      addIssue(
        code,
        'platnost-0',
        'info',
        'Platnost 0 měsíců chápána jako jednorázové školení bez expirace.'
      );
      return null;
    }
    return months;
  }
  const years = /^(\d+)\s*(rok|roky|let)$/i.exec(value);
  if (years) {
    const months = Number(years[1]) * 12;
    addIssue(
      code,
      'platnost-v-letech',
      'warning',
      `Platnost „${value}“ převedena na ${months} měsíců.`
    );
    return months;
  }
  addIssue(
    code,
    'neplatna-platnost',
    'error',
    `Nesrozumitelná platnost „${value}“ – školení vedeno bez expirace.`
  );
  return null;
}

function parseRequirement(code: string, raw: string, addIssue: AddIssue): Requirement {
  const value = raw.trim();
  const [kind = '', list = ''] = value.split(/:(.*)/s);
  const items = list
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  switch (foldKey(kind)) {
    case 'vsichni':
      return { kind: 'all' };
    case 'nepovinne':
      return { kind: 'optional' };
    case 'utvar':
      return { kind: 'units', units: items };
    case 'pozice':
      return { kind: 'positions', positions: items };
    default:
      addIssue(
        code,
        'nezname-pravidlo',
        'error',
        `Neznámé pravidlo povinnosti „${value}“ – školení vedeno jako nepovinné.`
      );
      return { kind: 'optional' };
  }
}
