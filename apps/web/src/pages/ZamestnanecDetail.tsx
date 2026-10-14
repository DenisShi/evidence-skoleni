import type { EmployeeDetail } from '@evidence/api/dto';
import type { DataIssue } from '@evidence/domain';
import { Alert, Descriptions, Table, Tag, Typography } from 'antd';
import { Link, useParams } from 'react-router';
import { useEmployee } from '../api/queries.ts';
import { EmployeeLink, QueryState, StateTag, StatusTag, TimingTag } from '../components/common.tsx';
import { daysLeftLabel, EMPLOYEE_STATE, formatDate, SEVERITY } from '../labels.ts';
import { useLinkWithSnapshot, useSnapshotParams } from '../url-state.ts';

type Requirement = EmployeeDetail['requirements'][number];
type HistoryRow = EmployeeDetail['history'][number];

export function ZamestnanecDetail() {
  const { id = '' } = useParams();
  const employee = useEmployee(id, useSnapshotParams());
  const link = useLinkWithSnapshot();

  return (
    <QueryState query={employee}>
      {(e) => (
        <>
          <Link to={link('/zamestnanci')}>← Zaměstnanci</Link>
          <Typography.Title level={3}>
            {e.lastName} {e.firstName} <StateTag state={e.state} />
          </Typography.Title>
          <Descriptions size="small" bordered column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="ID">
              {e.id}
              {e.mergedIds.length > 0 && (
                <Typography.Text type="secondary">
                  {' '}
                  (sloučeno s {e.mergedIds.join(', ')})
                </Typography.Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Stav">{EMPLOYEE_STATE[e.state].label}</Descriptions.Item>
            <Descriptions.Item label="Útvar">
              {e.unit ?? '—'} {e.unitInferred && <Tag>odvozeno</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Pozice">{e.position}</Descriptions.Item>
            <Descriptions.Item label="Vedoucí">
              {e.manager ? <EmployeeLink id={e.manager.id} name={e.manager.name} /> : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="E-mail">{e.email ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Nástup">{formatDate(e.startDate)}</Descriptions.Item>
            <Descriptions.Item label="Ukončení">{formatDate(e.endDate)}</Descriptions.Item>
          </Descriptions>

          <Typography.Title level={4} style={{ marginTop: 24 }}>
            Povinná školení
          </Typography.Title>
          {e.state === 'terminated' ? (
            <Alert
              type="info"
              title="Ukončený pracovní poměr – povinná školení se nevyhodnocují."
            />
          ) : (
            <Table<Requirement>
              size="small"
              rowKey="code"
              pagination={false}
              dataSource={e.requirements}
              columns={[
                { title: 'Školení', key: 'name', render: (_, r) => `${r.code} – ${r.name}` },
                {
                  title: 'Stav',
                  dataIndex: 'status',
                  render: (s: Requirement['status']) => <StatusTag status={s} />,
                },
                { title: 'Naposledy', dataIndex: 'lastCompletedOn', render: formatDate },
                {
                  title: 'Platné do',
                  key: 'validUntil',
                  render: (_, r) =>
                    r.lastCompletedOn && !r.validUntil ? 'bez omezení' : formatDate(r.validUntil),
                },
                {
                  title: 'Nutné do',
                  key: 'deadline',
                  render: (_, r) =>
                    r.waivedReason
                      ? 'neřeší se – odchází dřív'
                      : r.deadline
                        ? `${formatDate(r.deadline)} (${daysLeftLabel(r.daysLeft)})`
                        : '—',
                },
                {
                  title: 'Doporučený termín',
                  key: 'planned',
                  render: (_, r) =>
                    r.planned ? (
                      <>
                        {r.planned.sessionId} · {formatDate(r.planned.date)}{' '}
                        <TimingTag timing={r.planned.timing} />
                      </>
                    ) : (
                      '—'
                    ),
                },
              ]}
            />
          )}

          <Typography.Title level={4} style={{ marginTop: 24 }}>
            Historie školení
          </Typography.Title>
          <Table<HistoryRow>
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={e.history}
            locale={{ emptyText: 'Žádné započítané záznamy' }}
            columns={[
              { title: 'Záznam', dataIndex: 'id' },
              { title: 'Školení', dataIndex: 'code' },
              { title: 'Absolvováno', dataIndex: 'completedOn', render: formatDate },
              {
                title: 'Platné do',
                dataIndex: 'validUntil',
                render: (v: string | null) => (v ? formatDate(v) : 'bez omezení'),
              },
              { title: 'Poskytovatel', dataIndex: 'provider' },
              // Rendered as plain text by React: notes may contain spreadsheet formulas.
              {
                title: 'Poznámka',
                dataIndex: 'note',
                render: (note: string) => <span style={{ whiteSpace: 'pre-line' }}>{note}</span>,
              },
            ]}
          />

          {e.issues.length > 0 && (
            <>
              <Typography.Title level={4} style={{ marginTop: 24 }}>
                Úpravy a nálezy v datech
              </Typography.Title>
              <Table<DataIssue>
                size="small"
                rowKey={(i) => `${i.file}|${i.ref}|${i.type}`}
                pagination={false}
                dataSource={e.issues}
                columns={[
                  { title: 'Řádek', dataIndex: 'ref' },
                  {
                    title: 'Závažnost',
                    dataIndex: 'severity',
                    render: (s: DataIssue['severity']) => (
                      <Tag color={SEVERITY[s].color}>{SEVERITY[s].label}</Tag>
                    ),
                  },
                  { title: 'Popis', dataIndex: 'message' },
                ]}
              />
            </>
          )}
        </>
      )}
    </QueryState>
  );
}
