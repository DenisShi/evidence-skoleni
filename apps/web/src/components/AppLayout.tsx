import { DatePicker, InputNumber, Layout, Menu, Space, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useMeta } from '../api/queries.ts';
import { formatDate } from '../labels.ts';
import { SNAPSHOT_KEYS, useLinkWithSnapshot, useUrlState } from '../url-state.ts';

const PAGES = [
  { path: '/', label: 'Přehled' },
  { path: '/co-resit', label: 'Co řešit' },
  { path: '/zamestnanci', label: 'Zaměstnanci' },
  { path: '/plan', label: 'Plán přihlášek' },
  { path: '/kvalita-dat', label: 'Kvalita dat' },
];

export function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const link = useLinkWithSnapshot();
  const meta = useMeta();
  const [{ asOf, warningDays }, set] = useUrlState(SNAPSHOT_KEYS);
  const selected = PAGES.find((p) => p.path !== '/' && pathname.startsWith(p.path))?.path ?? '/';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center', gap: 24, paddingInline: 24 }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0, whiteSpace: 'nowrap' }}>
          Evidence školení
        </Typography.Title>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selected]}
          items={PAGES.map((p) => ({ key: p.path, label: p.label }))}
          onClick={({ key }) => navigate(link(key))}
          style={{ flex: 1, minWidth: 0 }}
        />
      </Layout.Header>
      <Layout.Content style={{ padding: 24 }}>
        <Space wrap align="center" style={{ display: 'flex', marginBottom: 16 }}>
          <Tooltip title="Ke kterému dni se stav vyhodnocuje. Výchozí je dnešek.">
            <Typography.Text strong>Referenční datum</Typography.Text>
          </Tooltip>
          <DatePicker
            allowClear
            format="D. M. YYYY"
            placeholder={meta.data ? `dnes (${formatDate(meta.data.today)})` : 'dnes'}
            value={asOf ? dayjs(asOf) : null}
            onChange={(value) => set({ asOf: value ? value.format('YYYY-MM-DD') : null })}
          />
          <Tooltip title="Školení, která vyprší v tomto počtu dní, se hlásí jako „brzy vyprší“.">
            <Typography.Text strong>Upozornit dní předem</Typography.Text>
          </Tooltip>
          <InputNumber
            min={1}
            max={365}
            placeholder={String(meta.data?.defaultWarningDays ?? 90)}
            value={warningDays ? Number(warningDays) : null}
            onChange={(value) => set({ warningDays: value })}
            style={{ width: 80 }}
          />
          {meta.data && (
            <Typography.Text type="secondary">
              Data z exportu ke dni {formatDate(meta.data.exportDate)}; obsazenost termínů odpovídá
              tomuto exportu.
            </Typography.Text>
          )}
        </Space>
        <Outlet />
      </Layout.Content>
    </Layout>
  );
}
