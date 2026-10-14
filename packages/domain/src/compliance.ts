import { addDays, daysBetween } from './dates.ts';
import { foldKey } from './text.ts';
import type { Dataset, Employee, IsoDate, TrainingRecord, TrainingType } from './types.ts';

/**
 * - `active`: working, all mandatory trainings are evaluated.
 * - `starting`: start date after the reference date; mandatory trainings are due by the start date.
 * - `leaving`: active with a known end date; trainings expiring after it do not need renewal.
 * - `parental_leave`: evaluated, but cannot be scheduled until they return.
 * - `terminated`: not evaluated.
 */
export type EmployeeState = 'active' | 'starting' | 'leaving' | 'parental_leave' | 'terminated';

/**
 * - `ok`: valid beyond the warning window.
 * - `expiring`: still valid, expires within the warning window.
 * - `expired`: completed before but no longer valid.
 * - `missing`: never completed (or no usable record).
 */
export type RequirementState = 'ok' | 'expiring' | 'expired' | 'missing';

export interface RequirementStatus {
  employeeId: string;
  code: string;
  status: RequirementState;
  lastCompletedOn: IsoDate | null;
  /** Expiry of the best valid record; `null` with a completion date means it never expires. */
  validUntil: IsoDate | null;
  /** Date by which the training has to be (re)done; `null` when nothing is needed. */
  deadline: IsoDate | null;
  /** Days from the reference date to the deadline (negative = overdue). */
  daysLeft: number | null;
  /** False when nothing has to be done (valid, or the employee leaves before it expires). */
  needsAction: boolean;
  /** Why an otherwise due training needs no action. */
  waivedReason: 'leaves-before-deadline' | null;
}

export interface EmployeeCompliance {
  employee: Employee;
  state: EmployeeState;
  requirements: RequirementStatus[];
}

export interface ComplianceOptions {
  referenceDate: IsoDate;
  /** Trainings expiring within this many days are reported as `expiring`. */
  warningDays: number;
}

export const DEFAULT_WARNING_DAYS = 90;

export function employeeState(employee: Employee, referenceDate: IsoDate): EmployeeState {
  if (employee.status === 'terminated') return 'terminated';
  if (employee.endDate && employee.endDate < referenceDate) return 'terminated';
  if (employee.status === 'parental_leave') return 'parental_leave';
  if (employee.startDate && employee.startDate > referenceDate) return 'starting';
  if (employee.endDate) return 'leaving';
  return 'active';
}

export function isRequired(type: TrainingType, employee: Employee): boolean {
  const requirement = type.requirement;
  switch (requirement.kind) {
    case 'all':
      return true;
    case 'optional':
      return false;
    case 'units':
      return employee.unit !== null && requirement.units.includes(employee.unit);
    case 'positions':
      return requirement.positions.some((p) => foldKey(p) === foldKey(employee.position));
  }
}

export function evaluateCompliance(
  dataset: Dataset,
  options: ComplianceOptions
): EmployeeCompliance[] {
  const recordsByEmployee = Map.groupBy(dataset.records, (r) => r.employeeId);
  return dataset.employees.map((employee) => {
    const state = employeeState(employee, options.referenceDate);
    if (state === 'terminated') return { employee, state, requirements: [] };

    const records = recordsByEmployee.get(employee.id) ?? [];
    const requirements = dataset.trainingTypes
      .filter((type) => isRequired(type, employee))
      .map((type) =>
        evaluateRequirement(
          employee,
          state,
          type,
          records.filter((r) => r.code === type.code),
          options
        )
      );
    return { employee, state, requirements };
  });
}

function evaluateRequirement(
  employee: Employee,
  state: EmployeeState,
  type: TrainingType,
  records: TrainingRecord[],
  { referenceDate, warningDays }: ComplianceOptions
): RequirementStatus {
  const best = bestRecord(records);
  const base = {
    employeeId: employee.id,
    code: type.code,
    lastCompletedOn: latestCompletion(records),
    validUntil: best?.validUntil ?? null,
  };

  if (best && best.validUntil === null) {
    return {
      ...base,
      status: 'ok',
      deadline: null,
      daysLeft: null,
      needsAction: false,
      waivedReason: null,
    };
  }

  let status: RequirementState;
  let deadline: IsoDate;
  if (!best) {
    status = 'missing';
    // Newcomers need their trainings by the first day, everyone else as soon as possible.
    deadline = state === 'starting' && employee.startDate ? employee.startDate : referenceDate;
  } else {
    deadline = best.validUntil!;
    if (deadline < referenceDate) status = 'expired';
    else if (deadline <= addDays(referenceDate, warningDays)) status = 'expiring';
    else status = 'ok';
  }

  if (status === 'ok') {
    return {
      ...base,
      status,
      deadline: null,
      daysLeft: null,
      needsAction: false,
      waivedReason: null,
    };
  }
  const leavesFirst =
    state === 'leaving' && employee.endDate !== null && employee.endDate <= deadline;
  return {
    ...base,
    status,
    deadline,
    daysLeft: daysBetween(referenceDate, deadline),
    needsAction: !leavesFirst,
    waivedReason: leavesFirst ? 'leaves-before-deadline' : null,
  };
}

/** The record that keeps the employee compliant the longest; a non-expiring record wins. */
function bestRecord(records: TrainingRecord[]): TrainingRecord | undefined {
  let best: TrainingRecord | undefined;
  for (const record of records) {
    if (record.validUntil === null) return record;
    if (!best || record.validUntil > best.validUntil!) best = record;
  }
  return best;
}

function latestCompletion(records: TrainingRecord[]): IsoDate | null {
  return records.reduce<IsoDate | null>(
    (latest, r) => (latest === null || r.completedOn > latest ? r.completedOn : latest),
    null
  );
}
