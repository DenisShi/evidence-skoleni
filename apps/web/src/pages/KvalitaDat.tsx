import type { DataIssue, FileSummary, Severity } from '@evidence/domain';
import { Input, Table, Tag, Typography } from 'antd';
import { useMemo } from 'react';
import { useDataQuality } from '../api/queries.ts';
import { QueryState } from '../components/common.tsx';
import { plural, SEVERITY, SOURCE_FILE } from '../labels.ts';
import { useUrlState } from '../url-state.ts';

export function KvalitaDat() {
  const report = useDataQuality();
  const [{ hledat }, set] = useUrlState(['hledat'] as const);

  return (
    <>
      <Typography.Title level={3}>Kvalita dat</Typography.Title>
      <Typography.Paragraph type="secondary">
        Co import ve zdrojových exportech našel a co s tím udělal. <Tag color="red">Vynecháno</Tag>{' '}
        = řádek se nezapočítává, <Tag color="orange">Opraveno / předpoklad</Tag> = hodnota byla
        opravena nebo doplněna, <Tag color="blue">Informace</Tag> = kosmetická úprava.
      </Typography.Paragraph>
      <QueryState query={report}>
        {(data) => (
          <>
            <Table<FileSummary>
              size="small"
              rowKey="file"
              pagination={false}
              dataSource={data.files}
              style={{ marginBottom: 24 }}
              columns={[
                {
                  title: 'Soubor',
                  dataIndex: 'file',
                  render: (f: FileSummary['file']) => SOURCE_FILE[f],
                },
                { title: 'Kódování', dataIndex: 'encoding' },
                { title: 'Řádků', dataIndex: 'rowsRead', align: 'right' },
                { title: 'Načteno', dataIndex: 'imported', align: 'right' },
                { title: 'Vynecháno / sloučeno', dataIndex: 'excluded', align: 'right' },
              ]}
            />
            <IssuesTable
              issues={data.issues}
              search={hledat}
              onSearch={(value) => set({ hledat: value })}
            />
          </>
        )}
      </QueryState>
    </>
  );
}

function IssuesTable({
  issues,
  search,
  onSearch,
}: {
  issues: DataIssue[];
  search: string | undefined;
  onSearch: (value: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = search?.toLowerCase();
    return q ? issues.filter((i) => `${i.ref} ${i.message}`.toLowerCase().includes(q)) : issues;
  }, [issues, search]);
  const distinct = <K extends keyof DataIssue>(key: K) =>
    [...new Set(issues.map((i) => i[key]))]
      .sort()
      .map((value) => ({ text: String(value), value: String(value) }));

  return (
    <>
      <Input.Search
        allowClear
        placeholder="Hledat podle ID nebo textu"
        defaultValue={search}
        onSearch={onSearch}
        style={{ width: 320, marginBottom: 16 }}
      />
      <Table<DataIssue>
        size="small"
        rowKey={(i) => `${i.file}|${i.ref}|${i.type}|${i.message}`}
        dataSource={filtered}
        pagination={{
          defaultPageSize: 50,
          showSizeChanger: true,
          showTotal: (n) => plural(n, 'nález', 'nálezy', 'nálezů'),
        }}
        scroll={{ x: true }}
        columns={[
          {
            title: 'Soubor',
            dataIndex: 'file',
            render: (f: DataIssue['file']) => SOURCE_FILE[f],
            filters: distinct('file').map((f) => ({
              ...f,
              text: SOURCE_FILE[f.value as DataIssue['file']],
            })),
            onFilter: (value, i) => i.file === value,
          },
          { title: 'Záznam', dataIndex: 'ref' },
          {
            title: 'Závažnost',
            dataIndex: 'severity',
            render: (s: Severity) => <Tag color={SEVERITY[s].color}>{SEVERITY[s].label}</Tag>,
            filters: (['error', 'warning', 'info'] as const).map((s) => ({
              text: SEVERITY[s].label,
              value: s,
            })),
            onFilter: (value, i) => i.severity === value,
          },
          {
            title: 'Typ',
            dataIndex: 'type',
            filters: distinct('type'),
            onFilter: (value, i) => i.type === value,
          },
          { title: 'Popis', dataIndex: 'message' },
        ]}
      />
    </>
  );
}
