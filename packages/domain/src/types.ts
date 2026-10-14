/** Calendar date as `YYYY-MM-DD`. Plain strings compare correctly and serialize without time zone surprises. */
export type IsoDate = string;

export type EmploymentStatus = 'active' | 'terminated' | 'parental_leave';

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  unit: string | null;
  /** True when the unit was missing in the export and derived from the org structure. */
  unitInferred: boolean;
  position: string;
  managerId: string | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  status: EmploymentStatus;
  /** IDs of duplicate rows (same person) merged into this employee. */
  mergedIds: string[];
}

export type Requirement =
  | { kind: 'all' }
  | { kind: 'units'; units: string[] }
  | { kind: 'positions'; positions: string[] }
  | { kind: 'optional' };

export interface TrainingType {
  code: string;
  name: string;
  /** `null` = never expires (one-off training) or no validity defined. */
  validityMonths: number | null;
  requirement: Requirement;
}

export interface TrainingRecord {
  id: string;
  employeeId: string;
  code: string;
  completedOn: IsoDate;
  /** Effective expiry used for evaluation; `null` = does not expire. */
  validUntil: IsoDate | null;
  provider: string;
  costCzk: number | null;
  note: string;
}

export interface Session {
  id: string;
  code: string;
  date: IsoDate;
  time: string;
  place: string;
  capacity: number;
  booked: number;
  priceCzk: number | null;
  cancelled: boolean;
  /** Set when the row repeats another session (same training, date, time and place). */
  duplicateOf: string | null;
}

export interface Dataset {
  exportDate: IsoDate;
  employees: Employee[];
  trainingTypes: TrainingType[];
  records: TrainingRecord[];
  sessions: Session[];
}

export type SourceFile =
  'zamestnanci' | 'absolvovana_skoleni' | 'katalog_skoleni' | 'terminy_skoleni';

/**
 * - `error`: the row (or value) could not be used and was left out.
 * - `warning`: the value was repaired or an assumption was applied.
 * - `info`: cosmetic normalization or a fact worth knowing.
 */
export type Severity = 'error' | 'warning' | 'info';

export interface DataIssue {
  file: SourceFile;
  /** Row identifier from the source (e.g. `E0042`, `Z000123`) or `řádek N` when there is none. */
  ref: string;
  type: string;
  severity: Severity;
  /** Human readable description in Czech, including what the import did about it. */
  message: string;
}

export interface FileSummary {
  file: SourceFile;
  encoding: string;
  rowsRead: number;
  imported: number;
  excluded: number;
}

export interface ImportReport {
  files: FileSummary[];
  issues: DataIssue[];
}
