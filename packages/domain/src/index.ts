// Public API of the domain package. Pure functions only: no file system, no network.
export * from './types.ts';
export { decodeText, parseCsv } from './csv.ts';
export { addDays, addMonths, daysBetween, formatCz, parseDate } from './dates.ts';
export { parseCzk } from './money.ts';
export {
  foldKey,
  looksLikeFormula,
  normalizeEmail,
  normalizePersonName,
  sameName,
} from './text.ts';
export { importDataset, type ImportInput, type ImportResult } from './import/index.ts';
export {
  DEFAULT_WARNING_DAYS,
  employeeState,
  evaluateCompliance,
  isRequired,
  type ComplianceOptions,
  type EmployeeCompliance,
  type EmployeeState,
  type RequirementState,
  type RequirementStatus,
} from './compliance.ts';
export {
  actionItems,
  buildOverview,
  type ActionItem,
  type Overview,
  type StatusCounts,
} from './overview.ts';
