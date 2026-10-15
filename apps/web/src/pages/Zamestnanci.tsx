import type { EmployeeListItem } from '@evidence/api/dto';
import { Table, Tooltip, Typography } from 'antd';
import { useEmployees } from '../api/queries.ts';
import { EmployeeLink, QueryState, StateTag, StatusTag } from '../components/common.tsx';
import { type FilterKey, Filters } from '../components/Filters.tsx';
import { plural } from '../labels.ts';
import { useSnapshotParams, useUrlState } from '../url-state.ts';

const FILTERS: FilterKey[] = ['q', 'unit', 'managerId', 'state'];

export function Zamestnanci() {
  const snapshot = useSnapshotParams();
  const [filter, setFilter] = useUrlState(FILTERS);
  const employees = useEmployees({ ...snapshot, ...filter });

  return (
    <>
      <Typography.Title level={3}>Zaměstnanci</Typography.Title>
      <Filters values={filter} onChange={setFilter} show={FILTERS} />
      <QueryState query={employees}>
        {(data) => (
          <Table<EmployeeListItem>
            size="small"
            rowKey="id"
            dataSource={data}
            pagination={{
              defaultPageSize: 50,
              showSizeChanger: true,
              showTotal: (n) => plural(n, 'zaměstnanec', 'zaměstnanci', 'zaměstnanců'),
            }}
            scroll={{ x: true }}
            columns={[
              {
                title: 'Jméno',
                key: 'name',
                sorter: (a, b) => a.name.localeCompare(b.name, 'cs'),
                render: (_, e) => (
                  <>
                    <EmployeeLink id={e.id} name={e.name} /> <StateTag state={e.state} />
                  </>
                ),
              },
              { title: 'ID', dataIndex: 'id' },
              { title: 'Útvar', dataIndex: 'unit', render: (unit: string | null) => unit ?? '—' },
              { title: 'Pozice', dataIndex: 'position' },
              {
                title: 'Vedoucí',
                dataIndex: 'managerName',
                render: (name: string | null) => name ?? '—',
              },
              {
                title: (
                  <Tooltip title="Počet povinných školení, která je potřeba řešit">
                    K řešení
                  </Tooltip>
                ),
                dataIndex: 'needsAction',
                align: 'right',
                sorter: (a, b) => a.needsAction - b.needsAction,
                render: (n: number, e) => `${n} / ${e.required}`,
              },
              {
                title: 'Nejhorší stav',
                dataIndex: 'worstStatus',
                render: (status: EmployeeListItem['worstStatus']) => <StatusTag status={status} />,
              },
            ]}
          />
        )}
      </QueryState>
    </>
  );
}
