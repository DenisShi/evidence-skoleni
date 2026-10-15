import type { StatusCounts } from '@evidence/domain';
import { Card, Col, Row, Statistic, Table, Tooltip, Typography } from 'antd';
import { Link } from 'react-router';
import { useMeta, useOverview } from '../api/queries.ts';
import { QueryState } from '../components/common.tsx';
import { Filters } from '../components/Filters.tsx';
import { EMPLOYEE_STATE, percent, plural } from '../labels.ts';
import { useLinkWithSnapshot, useSnapshotParams, useUrlState } from '../url-state.ts';

type UnitRow = StatusCounts & { unit: string };

const valid = (c: StatusCounts) => c.ok + c.expiring;
/** Not ok, yet nothing to do: the employee leaves before the deadline. */
const waived = (c: StatusCounts) => c.expiring + c.expired + c.missing - c.needsAction;

/** Cell colour by share of valid trainings: the matrix is meant to be scanned, not read. */
function cellColor(c: StatusCounts): string {
  const share = c.total === 0 ? 1 : valid(c) / c.total;
  if (share === 1) return c.expiring > 0 ? '#fffbe6' : '#f6ffed';
  return share >= 0.9 ? '#fff7e6' : '#fff1f0';
}

export function Prehled() {
  const snapshot = useSnapshotParams();
  const [filter, setFilter] = useUrlState(['unit', 'managerId'] as const);
  const overview = useOverview({ ...snapshot, ...filter });
  const meta = useMeta();
  const link = useLinkWithSnapshot();
  const trainingName = new Map(meta.data?.trainingTypes.map((t) => [t.code, t.name]));

  return (
    <>
      <Filters values={filter} onChange={setFilter} show={['unit', 'managerId']} />
      <QueryState query={overview}>
        {(data) => {
          const codes = data.byTraining.map((t) => t.code);
          const units = data.byUnit.map((u) => u.unit);
          const cell = new Map(data.matrix.map((m) => [`${m.unit}|${m.code}`, m]));
          const atWork =
            data.employeesByState.active +
            data.employeesByState.starting +
            data.employeesByState.leaving;

          return (
            <>
              <Row gutter={[16, 16]}>
                <Col xs={12} md={6}>
                  <Card>
                    <Statistic
                      title="Platná povinná školení"
                      value={percent(valid(data.totals), data.totals.total)}
                    />
                    <Typography.Text type="secondary">
                      {valid(data.totals)} z {data.totals.total}
                    </Typography.Text>
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card>
                    <Link to={link('/co-resit', filter)}>
                      <Statistic
                        title="K řešení"
                        value={data.totals.needsAction}
                        styles={{ content: { color: '#cf1322' } }}
                      />
                    </Link>
                    <Typography.Text type="secondary">
                      {plural(data.totals.expired, 'prošlé', 'prošlá', 'prošlých')},{' '}
                      {plural(data.totals.missing, 'chybějící', 'chybějící', 'chybějících')},{' '}
                      {data.totals.expiring} brzy vyprší
                      {waived(data.totals) > 0 &&
                        `; z toho ${waived(data.totals)} neřešit (odchod před termínem)`}
                    </Typography.Text>
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card>
                    <Statistic
                      title={`Vyprší do ${data.warningDays === 1 ? '1 dne' : `${data.warningDays} dní`}`}
                      value={data.totals.expiring}
                      styles={{ content: { color: '#d48806' } }}
                    />
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card>
                    <Statistic title="Zaměstnanci v práci" value={atWork} />
                    <Typography.Text type="secondary">
                      {(['starting', 'leaving', 'parental_leave'] as const)
                        .map(
                          (s) =>
                            `${EMPLOYEE_STATE[s].label.toLowerCase()} ${data.employeesByState[s]}`
                        )
                        .join(', ')}
                    </Typography.Text>
                  </Card>
                </Col>
              </Row>

              <Typography.Title level={4} style={{ marginTop: 24 }}>
                Útvary a školení
              </Typography.Title>
              <Typography.Paragraph type="secondary">
                Platná / povinná. Prázdná buňka = školení pro útvar není povinné. Klik otevře seznam
                k řešení. Lidé na rodičovské se do čísel nepočítají.
              </Typography.Paragraph>
              <Table<UnitRow>
                size="small"
                pagination={false}
                scroll={{ x: true }}
                rowKey="unit"
                dataSource={data.byUnit}
                columns={[
                  { title: 'Útvar', dataIndex: 'unit', fixed: 'left' },
                  ...codes.map((code) => ({
                    title: <Tooltip title={trainingName.get(code)}>{code}</Tooltip>,
                    key: code,
                    align: 'center' as const,
                    onCell: (row: UnitRow) => {
                      const c = cell.get(`${row.unit}|${code}`);
                      return { style: c ? { background: cellColor(c) } : {} };
                    },
                    render: (_: unknown, row: UnitRow) => {
                      const c = cell.get(`${row.unit}|${code}`);
                      if (!c) return null;
                      const text = `${valid(c)}/${c.total}`;
                      return c.needsAction > 0 ? (
                        <Link to={link('/co-resit', { ...filter, unit: row.unit, code })}>
                          {text}
                        </Link>
                      ) : (
                        text
                      );
                    },
                  })),
                  {
                    title: 'Celkem',
                    key: 'total',
                    align: 'center' as const,
                    render: (_: unknown, row: UnitRow) => percent(valid(row), row.total),
                  },
                ]}
              />

              <Typography.Title level={4} style={{ marginTop: 24 }}>
                Podle školení
              </Typography.Title>
              <Table
                size="small"
                pagination={false}
                rowKey="code"
                dataSource={data.byTraining}
                columns={[
                  {
                    title: 'Školení',
                    dataIndex: 'code',
                    render: (code: string) => `${code} - ${trainingName.get(code) ?? ''}`,
                  },
                  { title: 'Povinných', dataIndex: 'total', align: 'right' },
                  { title: 'Platné', dataIndex: 'ok', align: 'right' },
                  { title: 'Brzy vyprší', dataIndex: 'expiring', align: 'right' },
                  { title: 'Prošlé', dataIndex: 'expired', align: 'right' },
                  { title: 'Chybí', dataIndex: 'missing', align: 'right' },
                  {
                    title: 'K řešení',
                    dataIndex: 'needsAction',
                    align: 'right',
                    render: (n: number, row) =>
                      n > 0 ? (
                        <Link to={link('/co-resit', { ...filter, code: row.code })}>{n}</Link>
                      ) : (
                        0
                      ),
                  },
                  {
                    title: 'Platnost',
                    key: 'share',
                    align: 'right',
                    render: (_, row) => percent(valid(row), row.total),
                  },
                ]}
              />
              {units.length === 0 && (
                <Typography.Text>Pro zvolený filtr nejsou žádní zaměstnanci.</Typography.Text>
              )}
            </>
          );
        }}
      </QueryState>
    </>
  );
}
