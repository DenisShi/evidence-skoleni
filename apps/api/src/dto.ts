// Response shapes of the HTTP API, shared with the web client (type-only import).
// They expose only what the screens need: no birth numbers, no employee notes.
import type {
  DataIssue,
  EmployeeState,
  FileSummary,
  IsoDate,
  Overview,
  RequirementState,
  Requirement,
  Shortage,
  Timing,
  UnassignedReason,
} from '@evidence/domain';

export interface Meta {
  exportDate: IsoDate;
  today: IsoDate;
  defaultWarningDays: number;
  units: string[];
  trainingTypes: {
    code: string;
    name: string;
    validityMonths: number | null;
    requirement: Requirement;
  }[];
  managers: { id: string; name: string; unit: string | null }[];
}

export interface OverviewResponse extends Overview {
  referenceDate: IsoDate;
  warningDays: number;
}

export interface PersonRef {
  id: string;
  name: string;
  unit: string | null;
  position: string;
  state: EmployeeState;
}

export interface PlannedSessionRef {
  sessionId: string;
  date: IsoDate;
  timing: Timing;
}

export interface ActionItemDto {
  employee: PersonRef;
  code: string;
  status: RequirementState;
  lastCompletedOn: IsoDate | null;
  validUntil: IsoDate | null;
  deadline: IsoDate;
  daysLeft: number;
  planned: PlannedSessionRef | null;
  /** Why the planner could not find a session, when `planned` is null. */
  unplannedReason: UnassignedReason | null;
}

export interface EmployeeListItem extends PersonRef {
  managerName: string | null;
  required: number;
  needsAction: number;
  worstStatus: RequirementState | null;
}

export interface EmployeeDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  unit: string | null;
  unitInferred: boolean;
  position: string;
  manager: { id: string; name: string } | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  state: EmployeeState;
  mergedIds: string[];
  requirements: {
    code: string;
    name: string;
    status: RequirementState;
    lastCompletedOn: IsoDate | null;
    validUntil: IsoDate | null;
    deadline: IsoDate | null;
    daysLeft: number | null;
    needsAction: boolean;
    waivedReason: string | null;
    planned: PlannedSessionRef | null;
  }[];
  history: {
    id: string;
    code: string;
    completedOn: IsoDate;
    validUntil: IsoDate | null;
    provider: string;
    note: string;
  }[];
  issues: DataIssue[];
}

export interface PlanSessionDto {
  id: string;
  code: string;
  name: string;
  date: IsoDate;
  time: string;
  place: string;
  capacity: number;
  booked: number;
  freeSeats: number;
  priceCzk: number | null;
  assigned: (PersonRef & { status: RequirementState; deadline: IsoDate; timing: Timing })[];
}

export interface PlanResponse {
  referenceDate: IsoDate;
  sessions: PlanSessionDto[];
  /** Sessions that cannot be used and why (shown so nobody wonders where they went). */
  unusableSessions: {
    id: string;
    code: string;
    date: IsoDate;
    reason: 'past' | 'cancelled' | 'duplicate' | 'no-capacity';
  }[];
  unassigned: (PersonRef & {
    code: string;
    status: RequirementState;
    deadline: IsoDate;
    reason: UnassignedReason;
  })[];
  shortages: Shortage[];
  totalCostCzk: number;
  assignmentsWithoutPrice: number;
}

export interface DataQualityResponse {
  exportDate: IsoDate;
  files: FileSummary[];
  issues: DataIssue[];
}
