import type { PlanResponse, PlanSessionDto } from '@evidence/api/dto';
import type { Shortage } from '@evidence/domain';
import { DownloadOutlined } from '@ant-design/icons';
import { Alert, Button, Collapse, Space, Table, Tag, Typography } from 'antd';
import { apiUrl } from '../api/client.ts';
import { useMeta, usePlan } from '../api/queries.ts';
import { EmployeeLink, QueryState, StateTag, StatusTag, TimingTag } from '../components/common.tsx';
import { formatCzk, formatDate, UNASSIGNED_REASON, UNUSABLE_SESSION_REASON } from '../labels.ts';
import { useSnapshotParams } from '../url-state.ts';

type Assigned = PlanSessionDto['assigned'][number];
type Unassigned = PlanResponse['unassigned'][number];
type Unusable = PlanResponse['unusableSessions'][number];

export function PlanPrihlasek() {
  const snapshot = useSnapshotParams();
  const plan = usePlan(snapshot);
  const trainingName = new Map(useMeta().data?.trainingTypes.map((t) => [t.code, t.name]));

  return (
    <QueryState query={plan}>
      {(data) => {
        const assigned = data.sessions.reduce((n, s) => n + s.assigned.length, 0);
        return (
          <>
            <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
              <Typography.Title level={3}>Plán přihlášek</Typography.Title>
              <Button icon={<DownloadOutlined />} href={apiUrl('/api/plan.csv', snapshot)}>
                Stáhnout plán (CSV pro Excel)
              </Button>
            </Space>
            <Typography.Paragraph type="secondary">
              Návrh, koho na který termín přihlásit. Nejdřív se obsazují lidé s nejbližším termínem
              platnosti, každý na nejbližší termín s volným místem. Volná místa = kapacita −
              obsazeno podle exportu.
            </Typography.Paragraph>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              title={`Navrženo ${assigned} přihlášek, odhad nákladů ${formatCzk(data.totalCostCzk)}`}
              description={
                data.assignmentsWithoutPrice > 0
                  ? `${data.assignmentsWithoutPrice} přihlášek je na termíny bez uvedené ceny – nejsou v součtu.`
                  : undefined
              }
            />

            {data.shortages.length > 0 && (
              <>
                <Typography.Title level={4}>Kde termíny nestačí</Typography.Title>
                <Table<Shortage>
                  size="small"
                  rowKey="code"
                  pagination={false}
                  dataSource={data.shortages}
                  style={{ marginBottom: 24 }}
                  columns={[
                    {
                      title: 'Školení',
                      dataIndex: 'code',
                      render: (c: string) => `${c} – ${trainingName.get(c) ?? ''}`,
                    },
                    { title: 'Bez místa', dataIndex: 'withoutSeat', align: 'right' },
                    { title: 'Místo až po konci platnosti', dataIndex: 'late', align: 'right' },
                    {
                      title: 'Doporučení',
                      key: 'advice',
                      render: (_, s) =>
                        `Vypsat další termín${s.withoutSeat > 0 ? ` (aspoň ${s.withoutSeat} míst)` : ''} nejlépe do ${formatDate(s.earliestDeadline)}.`,
                    },
                  ]}
                />
              </>
            )}

            <Typography.Title level={4}>Termíny</Typography.Title>
            <Collapse
              items={data.sessions.map((s) => ({
                key: s.id,
                label: (
                  <Space wrap>
                    <strong>{formatDate(s.date)}</strong>
                    <span>
                      {s.id} · {s.code} – {s.name}
                    </span>
                    <Typography.Text type="secondary">
                      {s.time}, {s.place}
                    </Typography.Text>
                  </Space>
                ),
                extra: (
                  <Tag color={s.assigned.length > 0 ? 'blue' : 'default'}>
                    navrženo {s.assigned.length} / volno {s.freeSeats}
                  </Tag>
                ),
                children: (
                  <>
                    <Typography.Paragraph type="secondary">
                      Kapacita {s.capacity}, obsazeno {s.booked}, cena {formatCzk(s.priceCzk)} za
                      osobu.
                    </Typography.Paragraph>
                    <Table<Assigned>
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={s.assigned}
                      locale={{
                        emptyText:
                          s.freeSeats === 0 ? 'Termín je plný' : 'Nikoho není potřeba přihlásit',
                      }}
                      columns={[
                        {
                          title: 'Zaměstnanec',
                          key: 'name',
                          render: (_, p) => (
                            <>
                              <EmployeeLink id={p.id} name={p.name} /> <StateTag state={p.state} />
                            </>
                          ),
                        },
                        { title: 'Útvar', dataIndex: 'unit' },
                        {
                          title: 'Stav',
                          dataIndex: 'status',
                          render: (st: Assigned['status']) => <StatusTag status={st} />,
                        },
                        { title: 'Nutné do', dataIndex: 'deadline', render: formatDate },
                        {
                          title: 'Vůči platnosti',
                          dataIndex: 'timing',
                          render: (t: Assigned['timing']) => <TimingTag timing={t} />,
                        },
                      ]}
                    />
                  </>
                ),
              }))}
            />

            {data.unassigned.length > 0 && (
              <>
                <Typography.Title level={4} style={{ marginTop: 24 }}>
                  Nenaplánováno
                </Typography.Title>
                <Table<Unassigned>
                  size="small"
                  rowKey={(u) => `${u.id}|${u.code}`}
                  pagination={false}
                  dataSource={data.unassigned}
                  columns={[
                    {
                      title: 'Zaměstnanec',
                      key: 'name',
                      render: (_, u) => <EmployeeLink id={u.id} name={u.name} />,
                    },
                    { title: 'Školení', dataIndex: 'code' },
                    {
                      title: 'Stav',
                      dataIndex: 'status',
                      render: (st: Unassigned['status']) => <StatusTag status={st} />,
                    },
                    { title: 'Nutné do', dataIndex: 'deadline', render: formatDate },
                    {
                      title: 'Důvod',
                      dataIndex: 'reason',
                      render: (r: Unassigned['reason']) => UNASSIGNED_REASON[r],
                    },
                  ]}
                />
              </>
            )}

            <Typography.Title level={4} style={{ marginTop: 24 }}>
              Nepoužité termíny
            </Typography.Title>
            <Table<Unusable>
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={data.unusableSessions}
              columns={[
                { title: 'Termín', dataIndex: 'id' },
                { title: 'Školení', dataIndex: 'code' },
                { title: 'Datum', dataIndex: 'date', render: formatDate },
                {
                  title: 'Důvod',
                  dataIndex: 'reason',
                  render: (r: Unusable['reason']) => UNUSABLE_SESSION_REASON[r],
                },
              ]}
            />
          </>
        );
      }}
    </QueryState>
  );
}
