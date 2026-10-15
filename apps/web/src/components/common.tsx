import type { EmployeeState, RequirementState, Timing } from '@evidence/domain';
import type { UseQueryResult } from '@tanstack/react-query';
import { Alert, Spin, Tag, Tooltip } from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../api/client.ts';
import { EMPLOYEE_STATE, STATUS, TIMING } from '../labels.ts';
import { useLinkWithSnapshot } from '../url-state.ts';

/** Loading and error handling in one place, so pages only render data. */
export function QueryState<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return notFound ? (
      <Alert type="warning" showIcon title="Záznam neexistuje" />
    ) : (
      <Alert
        type="error"
        showIcon
        title="Data se nepodařilo načíst"
        description={query.error.message}
      />
    );
  }
  if (query.data === undefined) return <Spin style={{ display: 'block', margin: 48 }} />;
  return <>{children(query.data)}</>;
}

export function StatusTag({ status }: { status: RequirementState | null }) {
  if (!status) return null;
  return <Tag color={STATUS[status].color}>{STATUS[status].label}</Tag>;
}

export function StateTag({ state }: { state: EmployeeState }) {
  if (state === 'active') return null;
  return <Tag color={EMPLOYEE_STATE[state].color}>{EMPLOYEE_STATE[state].label}</Tag>;
}

export function TimingTag({ timing }: { timing: Timing }) {
  return (
    <Tooltip title={TIMING[timing].hint}>
      <Tag color={TIMING[timing].color}>{TIMING[timing].label}</Tag>
    </Tooltip>
  );
}

export function EmployeeLink({ id, name }: { id: string; name: string }) {
  const link = useLinkWithSnapshot();
  return <Link to={link(`/zamestnanci/${id}`)}>{name}</Link>;
}
