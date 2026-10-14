import {
  actionItems,
  buildOverview,
  evaluateCompliance,
  foldKey,
  planEnrollments,
  type Assignment,
  type Dataset,
  type Employee,
  type EmployeeCompliance,
  type EmployeeState,
  type EnrollmentPlan,
  type ImportReport,
  type IsoDate,
  type RequirementState,
  type UnassignedNeed,
} from '@evidence/domain';
import type {
  ActionItemDto,
  DataQualityResponse,
  EmployeeDetail,
  EmployeeListItem,
  Meta,
  OverviewResponse,
  PersonRef,
  PlannedSessionRef,
  PlanResponse,
} from './dto.ts';

export interface SnapshotParams {
  referenceDate: IsoDate;
  warningDays: number;
}

export interface EmployeeFilter {
  unit?: string | undefined;
  /** Whole team of the manager (direct and indirect reports). */
  managerId?: string | undefined;
  state?: EmployeeState | undefined;
  q?: string | undefined;
}

export interface ActionFilter extends EmployeeFilter {
  code?: string | undefined;
  status?: RequirementState | undefined;
}

interface Snapshot {
  evaluations: EmployeeCompliance[];
  byEmployee: Map<string, EmployeeCompliance>;
  plan: EnrollmentPlan;
  assignmentByNeed: Map<string, Assignment>;
  unassignedByNeed: Map<string, UnassignedNeed>;
}

const SEVERITY: Record<RequirementState, number> = { expired: 3, missing: 2, expiring: 1, ok: 0 };
const SNAPSHOT_CACHE_SIZE = 32;
const needKey = (employeeId: string, code: string) => `${employeeId}|${code}`;

/**
 * Read-only view over the imported dataset. Evaluation and planning are pure and cheap
 * (~170 people), so they are computed per reference date and memoized.
 */
export class TrainingService {
  private readonly employeeById: Map<string, Employee>;
  private readonly reportsByManager: Map<string, Employee[]>;
  private readonly snapshots = new Map<string, Snapshot>();

  constructor(
    readonly dataset: Dataset,
    private readonly report: ImportReport
  ) {
    this.employeeById = new Map(dataset.employees.map((e) => [e.id, e]));
    this.reportsByManager = Map.groupBy(
      dataset.employees.filter((e) => e.managerId !== null),
      (e) => e.managerId!
    );
  }

  meta(today: IsoDate, defaultWarningDays: number): Meta {
    const units = [...new Set(this.dataset.employees.flatMap((e) => (e.unit ? [e.unit] : [])))];
    return {
      exportDate: this.dataset.exportDate,
      today,
      defaultWarningDays,
      units: units.sort((a, b) => a.localeCompare(b, 'cs')),
      trainingTypes: this.dataset.trainingTypes.map(
        ({ code, name, validityMonths, requirement }) => ({
          code,
          name,
          validityMonths,
          requirement,
        })
      ),
      managers: [...this.reportsByManager.keys()]
        .map((id) => this.employeeById.get(id)!)
        .map((m) => ({ id: m.id, name: displayName(m), unit: m.unit }))
        .sort((a, b) => a.name.localeCompare(b.name, 'cs')),
    };
  }

  overview(params: SnapshotParams, filter: EmployeeFilter = {}): OverviewResponse {
    const { evaluations } = this.snapshot(params);
    // Terminated people are counted by state; buildOverview leaves them out of the totals itself.
    const scoped = this.filterEvaluations(evaluations, filter, { includeTerminated: true });
    return { ...params, ...buildOverview(scoped) };
  }

  actions(params: SnapshotParams, filter: ActionFilter = {}): ActionItemDto[] {
    const snapshot = this.snapshot(params);
    return actionItems(this.filterEvaluations(snapshot.evaluations, filter))
      .filter(
        (item) =>
          (!filter.code || item.code === filter.code) &&
          (!filter.status || item.status === filter.status)
      )
      .map((item) => {
        const key = needKey(item.employeeId, item.code);
        return {
          employee: personRef(item.employee, item.state),
          code: item.code,
          status: item.status,
          lastCompletedOn: item.lastCompletedOn,
          validUntil: item.validUntil,
          deadline: item.deadline!,
          daysLeft: item.daysLeft!,
          planned: plannedRef(snapshot.assignmentByNeed.get(key)),
          unplannedReason: snapshot.unassignedByNeed.get(key)?.reason ?? null,
        };
      });
  }

  employees(params: SnapshotParams, filter: EmployeeFilter = {}): EmployeeListItem[] {
    const { evaluations } = this.snapshot(params);
    return this.filterEvaluations(evaluations, filter, { includeTerminated: true })
      .map(({ employee, state, requirements }) => ({
        ...personRef(employee, state),
        managerName: this.managerName(employee),
        required: requirements.length,
        needsAction: requirements.filter((r) => r.needsAction).length,
        worstStatus: requirements.reduce<RequirementState | null>(
          (worst, r) => (worst === null || SEVERITY[r.status] > SEVERITY[worst] ? r.status : worst),
          null
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'cs') || a.id.localeCompare(b.id));
  }

  employee(id: string, params: SnapshotParams): EmployeeDetail | null {
    const snapshot = this.snapshot(params);
    const evaluation = snapshot.byEmployee.get(id);
    if (!evaluation) return null;
    const { employee, state, requirements } = evaluation;
    const manager = employee.managerId ? this.employeeById.get(employee.managerId) : undefined;
    const typeName = new Map(this.dataset.trainingTypes.map((t) => [t.code, t.name]));
    const records = this.dataset.records.filter((r) => r.employeeId === id);
    const ownRefs = new Set([id, ...employee.mergedIds, ...records.map((r) => r.id)]);

    return {
      id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      unit: employee.unit,
      unitInferred: employee.unitInferred,
      position: employee.position,
      manager: manager ? { id: manager.id, name: displayName(manager) } : null,
      startDate: employee.startDate,
      endDate: employee.endDate,
      state,
      mergedIds: employee.mergedIds,
      requirements: requirements.map((r) => ({
        code: r.code,
        name: typeName.get(r.code) ?? r.code,
        status: r.status,
        lastCompletedOn: r.lastCompletedOn,
        validUntil: r.validUntil,
        deadline: r.deadline,
        daysLeft: r.daysLeft,
        needsAction: r.needsAction,
        waivedReason: r.waivedReason,
        planned: plannedRef(snapshot.assignmentByNeed.get(needKey(id, r.code))),
      })),
      history: records
        .map(({ id: recordId, code, completedOn, validUntil, provider, note }) => ({
          id: recordId,
          code,
          completedOn,
          validUntil,
          provider,
          note,
        }))
        .sort((a, b) => b.completedOn.localeCompare(a.completedOn)),
      issues: this.report.issues.filter(
        (i) => (i.file === 'zamestnanci' || i.file === 'absolvovana_skoleni') && ownRefs.has(i.ref)
      ),
    };
  }

  plan(params: SnapshotParams): PlanResponse {
    const { plan } = this.snapshot(params);
    const typeName = new Map(this.dataset.trainingTypes.map((t) => [t.code, t.name]));
    const assignmentBySessionAndEmployee = new Map(
      plan.assignments.map((a) => [`${a.sessionId}|${a.employeeId}`, a])
    );
    const bookable = new Set(plan.sessions.map((s) => s.session.id));

    return {
      referenceDate: params.referenceDate,
      sessions: plan.sessions.map(({ session, freeSeats, assignedEmployeeIds }) => ({
        id: session.id,
        code: session.code,
        name: typeName.get(session.code) ?? session.code,
        date: session.date,
        time: session.time,
        place: session.place,
        capacity: session.capacity,
        booked: session.booked,
        freeSeats,
        priceCzk: session.priceCzk,
        assigned: assignedEmployeeIds.map((employeeId) => {
          const a = assignmentBySessionAndEmployee.get(`${session.id}|${employeeId}`)!;
          return {
            ...this.personRef(employeeId, params),
            status: a.status,
            deadline: a.deadline,
            timing: a.timing,
          };
        }),
      })),
      unusableSessions: this.dataset.sessions
        .filter((s) => !bookable.has(s.id))
        .map((s) => ({
          id: s.id,
          code: s.code,
          date: s.date,
          reason: s.duplicateOf
            ? ('duplicate' as const)
            : s.cancelled
              ? ('cancelled' as const)
              : s.date <= params.referenceDate
                ? ('past' as const)
                : ('no-capacity' as const),
        })),
      unassigned: plan.unassigned.map((u) => ({
        ...this.personRef(u.employeeId, params),
        code: u.code,
        status: u.status,
        deadline: u.deadline,
        reason: u.reason,
      })),
      shortages: plan.shortages,
      totalCostCzk: plan.totalCostCzk,
      assignmentsWithoutPrice: plan.assignmentsWithoutPrice,
    };
  }

  dataQuality(): DataQualityResponse {
    return {
      exportDate: this.dataset.exportDate,
      files: this.report.files,
      issues: this.report.issues,
    };
  }

  private snapshot(params: SnapshotParams): Snapshot {
    const key = `${params.referenceDate}|${params.warningDays}`;
    const cached = this.snapshots.get(key);
    if (cached) return cached;

    const evaluations = evaluateCompliance(this.dataset, params);
    const plan = planEnrollments(this.dataset, evaluations, params.referenceDate);
    const snapshot: Snapshot = {
      evaluations,
      byEmployee: new Map(evaluations.map((e) => [e.employee.id, e])),
      plan,
      assignmentByNeed: new Map(plan.assignments.map((a) => [needKey(a.employeeId, a.code), a])),
      unassignedByNeed: new Map(plan.unassigned.map((u) => [needKey(u.employeeId, u.code), u])),
    };
    if (this.snapshots.size >= SNAPSHOT_CACHE_SIZE) {
      this.snapshots.delete(this.snapshots.keys().next().value!);
    }
    this.snapshots.set(key, snapshot);
    return snapshot;
  }

  private filterEvaluations(
    evaluations: EmployeeCompliance[],
    filter: EmployeeFilter,
    { includeTerminated = false } = {}
  ): EmployeeCompliance[] {
    const team = filter.managerId ? this.teamOf(filter.managerId) : null;
    const query = filter.q ? foldKey(filter.q) : null;
    return evaluations.filter(
      ({ employee, state }) =>
        (includeTerminated || state !== 'terminated' || filter.state === 'terminated') &&
        (!filter.unit || employee.unit === filter.unit) &&
        (!team || team.has(employee.id)) &&
        (!filter.state || state === filter.state) &&
        (!query ||
          foldKey(`${employee.firstName} ${employee.lastName} ${employee.id}`).includes(query))
    );
  }

  /** Direct and indirect reports of a manager. */
  private teamOf(managerId: string): Set<string> {
    const team = new Set<string>();
    const queue = [managerId];
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      for (const report of this.reportsByManager.get(id) ?? []) {
        if (!team.has(report.id)) {
          team.add(report.id);
          queue.push(report.id);
        }
      }
    }
    return team;
  }

  private managerName(employee: Employee): string | null {
    const manager = employee.managerId ? this.employeeById.get(employee.managerId) : undefined;
    return manager ? displayName(manager) : null;
  }

  private personRef(employeeId: string, params: SnapshotParams): PersonRef {
    const evaluation = this.snapshot(params).byEmployee.get(employeeId)!;
    return personRef(evaluation.employee, evaluation.state);
  }
}

function displayName(employee: Employee): string {
  return `${employee.lastName} ${employee.firstName}`;
}

function personRef(employee: Employee, state: EmployeeState): PersonRef {
  return {
    id: employee.id,
    name: displayName(employee),
    unit: employee.unit,
    position: employee.position,
    state,
  };
}

function plannedRef(assignment: Assignment | undefined): PlannedSessionRef | null {
  return assignment
    ? { sessionId: assignment.sessionId, date: assignment.sessionDate, timing: assignment.timing }
    : null;
}
