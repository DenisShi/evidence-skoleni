import { Input, Select, Space } from 'antd';
import { useMeta } from '../api/queries.ts';
import { EMPLOYEE_STATE, STATUS } from '../labels.ts';

export type FilterKey = 'unit' | 'managerId' | 'code' | 'status' | 'state' | 'q';
export type FilterValues = Partial<Record<FilterKey, string | undefined>>;

interface Props {
  values: FilterValues;
  onChange: (patch: FilterValues) => void;
  show: FilterKey[];
}

/** Filter bar bound to URL state; renders only the filters the page supports. */
export function Filters({ values, onChange, show }: Props) {
  const meta = useMeta().data;
  const select = (
    key: FilterKey,
    placeholder: string,
    options: { value: string; label: string }[],
    width = 200
  ) =>
    show.includes(key) && (
      <Select
        key={key}
        allowClear
        showSearch
        optionFilterProp="label"
        placeholder={placeholder}
        value={values[key]}
        options={options}
        onChange={(value: string | undefined) => onChange({ [key]: value })}
        style={{ width }}
      />
    );

  return (
    <Space wrap style={{ marginBottom: 16 }}>
      {show.includes('q') && (
        <Input.Search
          key={values.q ?? ''}
          allowClear
          placeholder="Jméno nebo ID"
          defaultValue={values.q}
          onSearch={(value) => onChange({ q: value })}
          style={{ width: 200 }}
        />
      )}
      {select(
        'unit',
        'Útvar',
        (meta?.units ?? []).map((u) => ({ value: u, label: u }))
      )}
      {select(
        'managerId',
        'Tým vedoucího',
        (meta?.managers ?? []).map((m) => ({
          value: m.id,
          label: `${m.name}${m.unit ? ` (${m.unit})` : ''}`,
        })),
        260
      )}
      {select(
        'code',
        'Školení',
        (meta?.trainingTypes ?? []).map((t) => ({ value: t.code, label: `${t.code} – ${t.name}` })),
        260
      )}
      {select(
        'status',
        'Stav školení',
        Object.entries(STATUS)
          .filter(([key]) => key !== 'ok')
          .map(([value, { label }]) => ({ value, label })),
        160
      )}
      {select(
        'state',
        'Stav zaměstnance',
        Object.entries(EMPLOYEE_STATE).map(([value, { label }]) => ({ value, label })),
        180
      )}
    </Space>
  );
}
