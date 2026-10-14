import type { CsvTable } from '../csv.ts';
import { addMonths, formatCz, minDate, parseDate } from '../dates.ts';
import { parseCzk } from '../money.ts';
import { buildCanonicalSpelling, looksLikeFormula, sameName } from '../text.ts';
import type { Employee, IsoDate, TrainingRecord, TrainingType } from '../types.ts';
import { isKnownTypo, normalizeCode } from './codes.ts';
import type { EmployeesImport } from './employees.ts';
import type { AddIssue } from './issues.ts';

export interface RecordsImport {
  records: TrainingRecord[];
  rowsRead: number;
  excluded: number;
}

/** Records before this year are placeholders (`1. 1. 1900`), not real trainings. */
const MIN_PLAUSIBLE_YEAR = 2000;

export function importRecords(
  table: CsvTable,
  people: EmployeesImport,
  trainingTypes: TrainingType[],
  exportDate: IsoDate,
  addIssue: AddIssue
): RecordsImport {
  const typeByCode = new Map(trainingTypes.map((t) => [t.code, t]));
  const employeeById = new Map(people.employees.map((e) => [e.id, e]));
  const providerSpelling = buildCanonicalSpelling(table.rows.map((r) => r.poskytovatel ?? ''));
  const records: TrainingRecord[] = [];
  const seen = new Map<string, string>();
  let dataRows = 0;
  let excluded = 0;
  let declaredTotal: number | null = null;

  for (const [index, row] of table.rows.entries()) {
    const id = (row.id_zaznamu ?? '').trim();
    const ref = id || `řádek ${index + 2}`;

    // Non-data rows that ended up in the export.
    if (id.startsWith('#')) {
      addIssue(ref, 'komentar', 'info', `Komentářový řádek „${id.slice(0, 60)}…“ přeskočen.`);
      continue;
    }
    if (id === 'id_zaznamu') {
      addIssue(
        `řádek ${index + 2}`,
        'opakovana-hlavicka',
        'info',
        'Opakovaná hlavička uprostřed souboru přeskočena.'
      );
      continue;
    }
    if (/^celkem$/i.test(id)) {
      declaredTotal = Number((row.cena_kc ?? '').replace(/\s/g, ''));
      continue;
    }
    dataRows++;

    const exclude = (type: string, message: string) => {
      excluded++;
      addIssue(ref, type, 'error', `${message} Záznam se nezapočítává.`);
    };

    const exportedId = (row.id_zamestnance ?? '').trim();
    const employeeId = people.mergedInto.get(exportedId) ?? exportedId;
    const employee = employeeById.get(employeeId);
    if (!employee) {
      exclude(
        'neznamy-zamestnanec',
        `Zaměstnanec ${exportedId} („${(row.zamestnanec ?? '').trim()}“) není v seznamu zaměstnanců.`
      );
      continue;
    }
    const exportedName = people.exportedNames.get(exportedId) ?? '';
    if (!sameName(row.zamestnanec ?? '', exportedName)) {
      exclude(
        'nesouhlasi-jmeno',
        `ID ${exportedId} patří osobě „${exportedName.trim()}“, ale záznam je na jméno „${(row.zamestnanec ?? '').trim()}“ – nelze určit, komu školení patří.`
      );
      continue;
    }

    const rawCode = row.kod_skoleni ?? '';
    const code = normalizeCode(rawCode);
    const type = typeByCode.get(code);
    if (!type) {
      exclude(
        'neznamy-kod',
        code ? `Neznámý kód školení „${rawCode.trim()}“.` : 'Chybí kód školení.'
      );
      continue;
    }
    if (isKnownTypo(rawCode)) {
      addIssue(
        ref,
        'preklep-v-kodu',
        'warning',
        `Kód „${rawCode.trim()}“ opraven na „${code}“ (překlep).`
      );
    } else if (code !== rawCode) {
      addIssue(ref, 'format-kodu', 'info', `Kód „${rawCode}“ sjednocen na „${code}“.`);
    }

    const completed = parseDate(row.datum_absolvovani ?? '');
    if (!completed.ok) {
      exclude(
        'neplatne-datum',
        `Nečitelné datum absolvování „${(row.datum_absolvovani ?? '').trim()}“.`
      );
      continue;
    }
    const completedOn = completed.date;
    if (completed.format === 'excel') {
      addIssue(
        ref,
        'datum-excel',
        'warning',
        `Datum absolvování v číselném formátu Excelu převedeno na ${formatCz(completedOn)}.`
      );
    }
    if (Number(completedOn.slice(0, 4)) < MIN_PLAUSIBLE_YEAR) {
      exclude('zastupne-datum', `Zástupné datum absolvování ${formatCz(completedOn)}.`);
      continue;
    }
    if (completedOn > exportDate) {
      exclude(
        'datum-v-budoucnu',
        `Datum absolvování ${formatCz(completedOn)} je po datu exportu (${formatCz(exportDate)}) – jde nejspíš o předem zadaný plán, ne o absolvované školení.`
      );
      continue;
    }

    const duplicateKey = `${employeeId}|${code}|${completedOn}`;
    const firstId = seen.get(duplicateKey);
    if (firstId) {
      excluded++;
      addIssue(
        ref,
        'duplicitni-zaznam',
        'warning',
        `Duplicita záznamu ${firstId} (stejná osoba, školení a datum) – vynechán.`
      );
      continue;
    }
    seen.set(duplicateKey, id);

    checkAfterTermination(ref, employee, completedOn, addIssue);

    const cost = parseCzk(row.cena_kc ?? '');
    if (!cost.ok) {
      addIssue(
        ref,
        'neplatna-cena',
        'warning',
        `Nečitelná cena „${(row.cena_kc ?? '').trim()}“ – vedeno bez ceny.`
      );
    } else if (cost.negative) {
      addIssue(
        ref,
        'zaporna-cena',
        'warning',
        `Záporná cena ${cost.value} Kč (dobropis?) – ponecháno beze změny.`
      );
    }

    const note = (row.poznamka ?? '').trim();
    if (looksLikeFormula(note)) {
      addIssue(
        ref,
        'vzorec-v-poznamce',
        'warning',
        'Poznámka vypadá jako vzorec tabulkového procesoru – zobrazována jen jako text.'
      );
    }

    records.push({
      id,
      employeeId,
      code,
      completedOn,
      validUntil: effectiveExpiry(ref, type, completedOn, row.platnost_do ?? '', addIssue),
      provider: providerSpelling(row.poskytovatel ?? ''),
      costCzk: cost.ok ? cost.value : null,
      note,
    });
  }

  if (declaredTotal !== null) {
    if (declaredTotal === dataRows) {
      addIssue(
        'Celkem',
        'kontrolni-soucet',
        'info',
        `Kontrolní součet sedí: soubor deklaruje ${declaredTotal} záznamů, načteno ${dataRows}.`
      );
    } else {
      addIssue(
        'Celkem',
        'kontrolni-soucet',
        'error',
        `Soubor deklaruje ${declaredTotal} záznamů, načteno ${dataRows} – export může být neúplný.`
      );
    }
  }

  return { records, rowsRead: dataRows, excluded };
}

/**
 * The catalog is the source of truth for validity. When the exported expiry disagrees, the earlier
 * of the two dates is used: an unnecessary early refresher is cheaper than an expired certificate.
 */
function effectiveExpiry(
  ref: string,
  type: TrainingType,
  completedOn: IsoDate,
  rawValidUntil: string,
  addIssue: AddIssue
): IsoDate | null {
  if (type.validityMonths === null) return null;
  const fromCatalog = addMonths(completedOn, type.validityMonths);
  const exported = parseDate(rawValidUntil);

  if (!exported.ok) {
    if (exported.reason === 'invalid') {
      addIssue(
        ref,
        'neplatna-platnost',
        'warning',
        `Nečitelné datum platnosti „${rawValidUntil.trim()}“ – dopočteno z katalogu.`
      );
    } else {
      addIssue(
        ref,
        'chybi-platnost',
        'info',
        `Chybí datum platnosti – dopočteno z katalogu (${formatCz(fromCatalog)}).`
      );
    }
    return fromCatalog;
  }
  if (exported.date < completedOn) {
    addIssue(
      ref,
      'platnost-pred-absolvovanim',
      'warning',
      `Platnost do ${formatCz(exported.date)} je dřív než absolvování – použita platnost z katalogu (${formatCz(fromCatalog)}).`
    );
    return fromCatalog;
  }
  if (exported.date !== fromCatalog) {
    const used = minDate(exported.date, fromCatalog);
    addIssue(
      ref,
      'platnost-rozpor',
      'warning',
      `Platnost v exportu (${formatCz(exported.date)}) nesouhlasí s katalogem (${type.validityMonths} měs. → ${formatCz(fromCatalog)}); použito dřívější ${formatCz(used)}.`
    );
    return used;
  }
  return fromCatalog;
}

function checkAfterTermination(
  ref: string,
  employee: Employee,
  completedOn: IsoDate,
  addIssue: AddIssue
): void {
  if (employee.endDate && completedOn > employee.endDate) {
    addIssue(
      ref,
      'po-ukonceni',
      'warning',
      `Školení ${formatCz(completedOn)} je po ukončení pracovního poměru (${formatCz(employee.endDate)}).`
    );
  }
}
