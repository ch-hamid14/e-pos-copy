import { Button, DatePicker, Segmented, Space, Typography } from 'antd'
import type { TimeRangePickerProps } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'

const { Text } = Typography
const { RangePicker } = DatePicker

export type ReportDateRange = [Dayjs, Dayjs] | null

const ALL_TIME_START = dayjs('2000-01-01').startOf('day')

const rangePresets: TimeRangePickerProps['presets'] = [
  { label: 'All', value: [ALL_TIME_START, dayjs().endOf('day')] },
  { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
  { label: 'Last 7 Days', value: [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')] },
  { label: 'This Month', value: [dayjs().startOf('month'), dayjs().endOf('day')] },
  { label: 'Last Month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
  { label: 'This Year', value: [dayjs().startOf('year'), dayjs().endOf('day')] }
]

type QuickKey = 'all' | '7d' | 'month' | 'year' | 'custom'

function resolveQuick(range: ReportDateRange): QuickKey {
  if (!range) return 'all'
  const [from, to] = range
  if (from.isSame(ALL_TIME_START, 'day') && to.isSame(dayjs(), 'day')) return 'all'
  if (from.isSame(dayjs().subtract(6, 'day'), 'day') && to.isSame(dayjs(), 'day')) return '7d'
  if (from.isSame(dayjs().startOf('month'), 'day') && to.isSame(dayjs(), 'day')) return 'month'
  if (from.isSame(dayjs().startOf('year'), 'day') && to.isSame(dayjs(), 'day')) return 'year'
  return 'custom'
}

export function periodQuery(range: ReportDateRange): { from?: string; to?: string } {
  if (!range) return {}
  if (range[0].isSame(ALL_TIME_START, 'day')) return {}
  return {
    from: range[0].format('YYYY-MM-DD'),
    to: range[1].format('YYYY-MM-DD')
  }
}

export function periodLabel(range: ReportDateRange): string {
  if (!range || range[0].isSame(ALL_TIME_START, 'day')) return 'All dates'
  return `${range[0].format('DD MMM YYYY')} – ${range[1].format('DD MMM YYYY')}`
}

type Props = {
  value: ReportDateRange
  onChange: (next: ReportDateRange) => void
}

export function ReportPeriodFilter({ value, onChange }: Props) {
  const quick = resolveQuick(value)

  const setQuick = (key: QuickKey) => {
    if (key === 'all') {
      onChange(null)
      return
    }
    if (key === '7d') {
      onChange([dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')])
      return
    }
    if (key === 'month') {
      onChange([dayjs().startOf('month'), dayjs().endOf('day')])
      return
    }
    if (key === 'year') {
      onChange([dayjs().startOf('year'), dayjs().endOf('day')])
      return
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Space wrap size="middle">
        <Text type="secondary" className="!mb-0">
          Period
        </Text>
        <Segmented
          value={quick === 'custom' ? 'custom' : quick}
          onChange={(v) => setQuick(v as QuickKey)}
          options={[
            { label: 'All', value: 'all' },
            { label: '7 days', value: '7d' },
            { label: 'This month', value: 'month' },
            { label: 'This year', value: 'year' },
            { label: 'Custom', value: 'custom' }
          ]}
        />
        <RangePicker
          value={value}
          presets={rangePresets}
          allowClear
          onChange={(v) => {
            if (!v || !v[0] || !v[1]) {
              onChange(null)
              return
            }
            onChange([v[0].startOf('day'), v[1].endOf('day')])
          }}
        />
        {value && (
          <Button type="link" className="!px-0" onClick={() => onChange(null)}>
            Clear
          </Button>
        )}
      </Space>
      <Text type="secondary">{periodLabel(value)}</Text>
    </div>
  )
}
