import type { ActionItemDto } from '@evidence/api/dto';
import { Table, Tag, Typography } from 'antd';
import { useActions, useMeta } from '../api/queries.ts';
import { EmployeeLink, QueryState, StateTag, StatusTag, TimingTag } from '../components/common.tsx';
import { type FilterKey, Filters } from '../components/Filters.tsx';
import { daysLeftLabel, formatDate, STATUS, UNASSIGNED_REASON } from '../labels.ts';
import { useSnapshotParams, useUrlState } from '../url-state.ts';

const FILTERS: FilterKey[] = ['q', 'unit', 'managerId', 'code', 'status', 'state'];

export function CoResit() {
  const snapshot = useSnapshotParams();
  const [filter, setFilter] = useUrlState(FILTERS);
  const actions = useActions({ ...snapshot, ...filter });
  const trainingName = new Map(useMeta().data?.trainingTypes.map((t) => [t.code, t.name]));

  return (
    <>
      <Typography.Title level={3}>Co řešit</Typography.Title>
      <Typography.Paragraph type="secondary">
        Povinná školení, která chybí, prošla nebo brzy vyprší – od nejnaléhavějšího. U každého je
        termín, na který je doporučeno člověka přihlásit (viz Plán přihlášek).
      </Typography.Paragraph>
      <Filters values={filter} onChange={setFilter} show={FILTERS} />
      <QueryState query={actions}>
        {(data) => (
          <Table<ActionItemDto>
            size="small"
            rowKey={(a) => `${a.employee.id}|${a.code}`}
            dataSource={data}
            pagination={{
              defaultPageSize: 50,
              showSizeChanger: true,
              showTotal: (n) => `${n} položek`,
            }}
            scroll={{ x: true }}
            columns={[
              {
                title: 'Zaměstnanec',
                key: 'employee',
                render: (_, a) => (
                  <>
                    <EmployeeLink id={a.employee.id} name={a.employee.name} />{' '}
                    <StateTag state={a.employee.state} />
                  </>
                ),
              },
              { title: 'Útvar', key: 'unit', render: (_, a) => a.employee.unit ?? '—' },
              {
                title: 'Školení',
                dataIndex: 'code',
                render: (code: string) => <span title={trainingName.get(code)}>{code}</span>,
              },
              {
                title: 'Stav',
                dataIndex: 'status',
                render: (status: ActionItemDto['status']) => <StatusTag status={status} />,
                filters: Object.entries(STATUS).map(([value, { label }]) => ({
                  value,
                  text: label,
                })),
                onFilter: (value, a) => a.status === value,
              },
              { title: 'Platné do', dataIndex: 'validUntil', render: formatDate },
              {
                title: 'Nutné do',
                key: 'deadline',
                render: (_, a) => (
                  <>
                    {formatDate(a.deadline)}
                    <br />
                    <Typography.Text type={a.daysLeft < 0 ? 'danger' : 'secondary'}>
                      {daysLeftLabel(a.daysLeft)}
                    </Typography.Text>
                  </>
                ),
              },
              {
                title: 'Doporučený termín',
                key: 'planned',
                render: (_, a) =>
                  a.planned ? (
                    <>
                      {a.planned.sessionId} · {formatDate(a.planned.date)}{' '}
                      <TimingTag timing={a.planned.timing} />
                    </>
                  ) : a.unplannedReason ? (
                    <Tag>{UNASSIGNED_REASON[a.unplannedReason]}</Tag>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        )}
      </QueryState>
    </>
  );
}
