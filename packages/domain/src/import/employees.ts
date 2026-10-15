import type { CsvTable } from '../csv.ts';
import { formatCz, parseDate } from '../dates.ts';
import { foldKey, looksLikeFormula, normalizeEmail, normalizePersonName } from '../text.ts';
import type { Employee, EmploymentStatus, IsoDate } from '../types.ts';
import { buildUnitNormalizer } from './codes.ts';
import type { AddIssue } from './issues.ts';

export interface EmployeesImport {
  employees: Employee[];
  /** Duplicate employee ID → ID of the employee it was merged into. */
  mergedInto: Map<string, string>;
  /** Name exactly as exported for every ID (incl. merged duplicates), used to verify training records. */
  exportedNames: Map<string, string>;
  normalizeUnit: (raw: string) => string | null;
  rowsRead: number;
}

const STATUS: Record<string, EmploymentStatus> = {
  aktivni: 'active',
  ukoncen: 'terminated',
  rodicovska: 'parental_leave',
};

const MANAGER_POSITION = 'vedouci';

export function importEmployees(
  table: CsvTable,
  exportDate: IsoDate,
  addIssue: AddIssue
): EmployeesImport {
  const normalizeUnit = buildUnitNormalizer(table.rows.map((r) => r.utvar ?? ''));
  const employees: Employee[] = [];
  const employeeById = new Map<string, Employee>();
  const mergedInto = new Map<string, string>();
  const exportedNames = new Map<string, string>();
  // Birth number is used only here to detect the same person exported twice; it is not stored.
  const idByBirthNumber = new Map<string, string>();
  const managerEmailById = new Map<string, string>();

  // Sorted by ID so that the lower ID of a duplicate pair is kept; the line number (header = 1)
  // is remembered for rows that have no usable ID to refer to.
  const rows = table.rows
    .map((row, index) => ({ row, line: index + 2 }))
    .sort((a, b) => (a.row.id_zamestnance ?? '').localeCompare(b.row.id_zamestnance ?? ''));
  for (const { row, line } of rows) {
    const id = (row.id_zamestnance ?? '').trim();
    if (!/^E\d{4}$/.test(id)) {
      addIssue(
        `řádek ${line}`,
        'neplatne-id',
        'error',
        `Neplatné ID zaměstnance „${id}“ – řádek vynechán.`
      );
      continue;
    }
    exportedNames.set(id, `${row.jmeno ?? ''} ${row.prijmeni ?? ''}`);

    const birthNumber = (row.rodne_cislo ?? '').replace(/\s/g, '');
    const original = birthNumber ? idByBirthNumber.get(birthNumber) : undefined;
    if (original) {
      mergedInto.set(id, original);
      employeeById.get(original)?.mergedIds.push(id);
      addIssue(
        id,
        'duplicitni-zamestnanec',
        'warning',
        `Stejná osoba jako ${original} (shodné rodné číslo, překlep ve jméně nebo e-mailu). Záznam sloučen, jeho školení přiřazena k ${original}.`
      );
      continue;
    }
    if (birthNumber) idByBirthNumber.set(birthNumber, id);

    const firstName = normalizePersonName(row.jmeno ?? '');
    const lastName = normalizePersonName(row.prijmeni ?? '');
    if (firstName !== (row.jmeno ?? '') || lastName !== (row.prijmeni ?? '')) {
      addIssue(id, 'format-jmena', 'info', 'Jméno upraveno (mezery, velká/malá písmena).');
    }

    const email = normalizeEmail(row.email ?? '');
    if (!email.ok) {
      addIssue(
        id,
        'neplatny-email',
        'warning',
        `Neplatný e-mail „${(row.email ?? '').trim()}“ – vedeno bez e-mailu.`
      );
    } else if (email.repaired) {
      addIssue(
        id,
        'oprava-emailu',
        'warning',
        `E-mail „${(row.email ?? '').trim()}“ opraven na „${email.email}“.`
      );
    }
    const managerEmail = normalizeEmail(row.vedouci_email ?? '');
    if (managerEmail.ok) managerEmailById.set(id, managerEmail.email);

    const unit = normalizeUnit(row.utvar ?? '');
    if (unit && unit !== (row.utvar ?? '').trim()) {
      addIssue(
        id,
        'nazev-utvaru',
        'info',
        `Útvar „${(row.utvar ?? '').trim()}“ sjednocen na „${unit}“.`
      );
    }

    const startDate = readDate(id, 'datum_nastupu', row.datum_nastupu ?? '', addIssue);
    const endDate = readDate(id, 'datum_ukonceni', row.datum_ukonceni ?? '', addIssue);
    if (startDate && startDate > exportDate) {
      addIssue(
        id,
        'nastup-v-budoucnu',
        'info',
        `Nástup až ${formatCz(startDate)} – zatím bez školení, potřebuje vstupní školení.`
      );
    }

    const rawStatus = (row.stav ?? '').trim();
    let status = STATUS[foldKey(rawStatus)];
    if (!status) {
      status = 'active';
      addIssue(
        id,
        'neznamy-stav',
        'warning',
        `Neznámý stav „${rawStatus}“ – zaměstnanec veden jako aktivní.`
      );
    }
    if (status === 'terminated' && !endDate) {
      addIssue(id, 'ukonceni-bez-data', 'warning', 'Stav „ukončen“ bez data ukončení.');
    }

    if (looksLikeFormula(row.poznamka ?? '')) {
      addIssue(
        id,
        'vzorec-v-poznamce',
        'warning',
        'Poznámka obsahuje vzorec pro tabulkový procesor (CSV injection). Poznámky zaměstnanců se neimportují.'
      );
    }

    const employee: Employee = {
      id,
      firstName,
      lastName,
      email: email.email,
      unit,
      unitInferred: false,
      position: (row.pozice ?? '').trim(),
      managerId: null,
      startDate,
      endDate,
      status,
      mergedIds: [],
    };
    employees.push(employee);
    employeeById.set(id, employee);
  }

  resolveManagers(employees, managerEmailById, addIssue);
  inferMissingUnits(employees, addIssue);

  return { employees, mergedInto, exportedNames, normalizeUnit, rowsRead: table.rows.length };
}

function readDate(id: string, column: string, raw: string, addIssue: AddIssue): IsoDate | null {
  const parsed = parseDate(raw);
  if (parsed.ok) return parsed.date;
  if (parsed.reason === 'invalid') {
    addIssue(
      id,
      'neplatne-datum',
      'error',
      `Nečitelné datum ve sloupci ${column}: „${raw.trim()}“ – ignorováno.`
    );
  }
  return null;
}

function resolveManagers(
  employees: Employee[],
  managerEmailById: Map<string, string>,
  addIssue: AddIssue
): void {
  const idByEmail = new Map(employees.flatMap((e) => (e.email ? [[e.email, e.id] as const] : [])));
  for (const employee of employees) {
    const managerEmail = managerEmailById.get(employee.id);
    if (!managerEmail) continue;
    const managerId = idByEmail.get(managerEmail);
    if (managerId && managerId !== employee.id) {
      employee.managerId = managerId;
    } else {
      addIssue(
        employee.id,
        'neznamy-vedouci',
        'warning',
        `Vedoucí „${managerEmail}“ není mezi zaměstnanci – vedeno bez vedoucího.`
      );
    }
  }
}

/**
 * Unit decides which trainings are mandatory, so a missing unit is derived from the org structure:
 * a manager belongs to the unit most of their reports are in, everyone else to their manager's unit.
 */
function inferMissingUnits(employees: Employee[], addIssue: AddIssue): void {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const missing = () => employees.filter((e) => e.unit === null);

  for (const employee of missing()) {
    if (foldKey(employee.position) !== MANAGER_POSITION) continue;
    const reportUnits = employees
      .filter((e) => e.managerId === employee.id && e.unit)
      .map((e) => e.unit!);
    const unit = mostFrequent(reportUnits);
    if (unit) setInferred(employee, unit, 'podle útvaru podřízených', addIssue);
  }
  // Repeat so that chains (report of a manager whose unit was just inferred) resolve too.
  for (let changed = true; changed;) {
    changed = false;
    for (const employee of missing()) {
      const managerUnit = employee.managerId ? byId.get(employee.managerId)?.unit : null;
      if (managerUnit) {
        setInferred(employee, managerUnit, 'podle útvaru vedoucího', addIssue);
        changed = true;
      }
    }
  }
  for (const employee of missing()) {
    addIssue(
      employee.id,
      'chybi-utvar',
      'error',
      'Chybí útvar a nelze ho odvodit – útvarová školení nelze vyhodnotit.'
    );
  }
}

function setInferred(employee: Employee, unit: string, how: string, addIssue: AddIssue): void {
  employee.unit = unit;
  employee.unitInferred = true;
  addIssue(
    employee.id,
    'odvozeny-utvar',
    'warning',
    `Chybějící útvar doplněn na „${unit}“ (${how}).`
  );
}

function mostFrequent(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return best ? best[0] : null;
}
