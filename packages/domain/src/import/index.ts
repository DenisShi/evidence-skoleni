import { decodeText, parseCsv } from '../csv.ts';
import type {
  Dataset,
  FileSummary,
  ImportReport,
  IsoDate,
  SourceFile,
  TrainingType,
} from '../types.ts';
import { importCatalog } from './catalog.ts';
import { importEmployees } from './employees.ts';
import { type AddIssue, IssueLog } from './issues.ts';
import { importRecords } from './records.ts';
import { importSessions } from './sessions.ts';

export interface ImportInput {
  employees: Uint8Array | string;
  records: Uint8Array | string;
  catalog: Uint8Array | string;
  sessions: Uint8Array | string;
  exportDate: IsoDate;
}

export interface ImportResult {
  dataset: Dataset;
  report: ImportReport;
}

/** Turns the four raw exports into a consistent dataset plus a report of every repair and exclusion. */
export function importDataset(input: ImportInput): ImportResult {
  const log = new IssueLog();
  const files: FileSummary[] = [];
  const read = (file: SourceFile, bytes: Uint8Array | string) => {
    const decoded = decodeText(bytes);
    return { table: parseCsv(decoded.text), encoding: decoded.encoding };
  };

  const catalog = read('katalog_skoleni', input.catalog);
  const trainingTypes = importCatalog(catalog.table, log.for('katalog_skoleni'));

  const staff = read('zamestnanci', input.employees);
  const people = importEmployees(staff.table, input.exportDate, log.for('zamestnanci'));
  const knownUnits = new Set(people.employees.flatMap((e) => (e.unit ? [e.unit] : [])));
  resolveRequirementUnits(
    trainingTypes,
    people.normalizeUnit,
    knownUnits,
    log.for('katalog_skoleni')
  );

  const history = read('absolvovana_skoleni', input.records);
  const records = importRecords(
    history.table,
    people,
    trainingTypes,
    input.exportDate,
    log.for('absolvovana_skoleni')
  );

  const schedule = read('terminy_skoleni', input.sessions);
  const sessions = importSessions(schedule.table, trainingTypes, log.for('terminy_skoleni'));

  files.push(
    summary('zamestnanci', staff.encoding, people.rowsRead, people.employees.length),
    summary('absolvovana_skoleni', history.encoding, records.rowsRead, records.records.length),
    summary('katalog_skoleni', catalog.encoding, catalog.table.rows.length, trainingTypes.length),
    summary('terminy_skoleni', schedule.encoding, sessions.rowsRead, sessions.sessions.length)
  );

  return {
    dataset: {
      exportDate: input.exportDate,
      employees: people.employees,
      trainingTypes,
      records: records.records,
      sessions: sessions.sessions,
    },
    report: { files, issues: log.issues },
  };
}

function summary(
  file: SourceFile,
  encoding: string,
  rowsRead: number,
  imported: number
): FileSummary {
  return { file, encoding, rowsRead, imported, excluded: rowsRead - imported };
}

/** Catalog rules name units in their own spelling; map them onto the units used by employees. */
function resolveRequirementUnits(
  trainingTypes: TrainingType[],
  normalizeUnit: (raw: string) => string | null,
  knownUnits: Set<string>,
  addIssue: AddIssue
): void {
  for (const type of trainingTypes) {
    if (type.requirement.kind !== 'units') continue;
    type.requirement.units = type.requirement.units.map((raw) => {
      const unit = normalizeUnit(raw);
      if (!unit || !knownUnits.has(unit)) {
        addIssue(
          type.code,
          'neznamy-utvar',
          'warning',
          `Útvar „${raw}“ z pravidla povinnosti nemá žádného zaměstnance.`
        );
      }
      return unit ?? raw;
    });
  }
}
