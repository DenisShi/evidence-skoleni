import type {
  EmployeeCompliance,
  EmployeeState,
  RequirementState,
  RequirementStatus,
} from './compliance.ts';
import type { Employee } from './types.ts';

export interface StatusCounts {
  total: number;
  ok: number;
  expiring: number;
  expired: number;
  missing: number;
  /** Requirements that need to be dealt with (not ok and not waived). */
  needsAction: number;
}

export interface Overview {
  employeesByState: Record<EmployeeState, number>;
  /** Totals over employees who are at work or starting (parental leave is reported separately). */
  totals: StatusCounts;
  byTraining: (StatusCounts & { code: string })[];
  byUnit: (StatusCounts & { unit: string })[];
  /** Unit/training cells; only combinations where the training is mandatory. */
  matrix: (StatusCounts & { unit: string; code: string })[];
}

export interface ActionItem extends RequirementStatus {
  employee: Employee;
  state: EmployeeState;
}

/** States whose people are expected at work; parental leave would distort the picture. */
const AT_WORK: ReadonlySet<EmployeeState> = new Set(['active', 'starting', 'leaving']);
const NO_UNIT = '(bez útvaru)';

export function buildOverview(evaluations: EmployeeCompliance[]): Overview {
  const employeesByState: Record<EmployeeState, number> = {
    active: 0,
    starting: 0,
    leaving: 0,
    parental_leave: 0,
    terminated: 0,
  };
  const totals = emptyCounts();
  const byTraining = new Map<string, StatusCounts>();
  const byUnit = new Map<string, StatusCounts>();
  const matrix = new Map<string, StatusCounts & { unit: string; code: string }>();

  for (const { employee, state, requirements } of evaluations) {
    employeesByState[state]++;
    if (!AT_WORK.has(state)) continue;
    const unit = employee.unit ?? NO_UNIT;
    for (const requirement of requirements) {
      add(totals, requirement);
      add(getOrCreate(byTraining, requirement.code, emptyCounts), requirement);
      add(getOrCreate(byUnit, unit, emptyCounts), requirement);
      add(
        getOrCreate(matrix, `${unit}|${requirement.code}`, () => ({
          ...emptyCounts(),
          unit,
          code: requirement.code,
        })),
        requirement
      );
    }
  }

  return {
    employeesByState,
    totals,
    byTraining: [...byTraining].map(([code, counts]) => ({ code, ...counts })),
    byUnit: [...byUnit]
      .map(([unit, counts]) => ({ unit, ...counts }))
      .sort((a, b) => a.unit.localeCompare(b.unit, 'cs')),
    matrix: [...matrix.values()],
  };
}

/** Everything that needs to be dealt with, most urgent first. */
export function actionItems(evaluations: EmployeeCompliance[]): ActionItem[] {
  return evaluations
    .flatMap(({ employee, state, requirements }) =>
      requirements.filter((r) => r.needsAction).map((r) => ({ ...r, employee, state }))
    )
    .sort(
      (a, b) =>
        (a.deadline ?? '').localeCompare(b.deadline ?? '') ||
        a.employee.lastName.localeCompare(b.employee.lastName, 'cs') ||
        a.employee.id.localeCompare(b.employee.id) ||
        a.code.localeCompare(b.code)
    );
}

function emptyCounts(): StatusCounts {
  return { total: 0, ok: 0, expiring: 0, expired: 0, missing: 0, needsAction: 0 };
}

function add(counts: StatusCounts, requirement: RequirementStatus): void {
  counts.total++;
  counts[requirement.status satisfies RequirementState]++;
  if (requirement.needsAction) counts.needsAction++;
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = create();
    map.set(key, value);
  }
  return value;
}
