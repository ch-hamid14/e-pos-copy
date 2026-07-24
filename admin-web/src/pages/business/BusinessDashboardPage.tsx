import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  BarChartOutlined,
  FallOutlined,
  FundOutlined,
  ReloadOutlined,
  RiseOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  WalletOutlined
} from '@ant-design/icons'
import { Alert, Button, Card, DatePicker, Modal, Select, Typography, message } from 'antd'
import type { TimeRangePickerProps } from 'antd'
import dayjs from 'dayjs'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { getBusinessDashboard, getBusinessFilterOptions, repairAllVoidedSaleLedgers, backfillPurchaseApLedgers } from '../../api/admin'
import { useAuth } from '../../context/AuthContext'
import type { BusinessAnalytics, BusinessFilterOptions } from '../../types'
import {
  formatCompact,
  formatCompactAxis,
  formatCompactRs,
  formatRs
} from './format'
import './dashboard.scss'

const { Text } = Typography
const { RangePicker } = DatePicker

const CHART_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']
const ALL_TIME_START = dayjs('2000-01-01').startOf('day')

const rangePresets: TimeRangePickerProps['presets'] = [
  { label: 'All', value: [ALL_TIME_START, dayjs().endOf('day')] },
  { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
  { label: 'Last 7 Days', value: [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')] },
  { label: 'This Month', value: [dayjs().startOf('month'), dayjs().endOf('day')] },
  {
    label: 'Last Month',
    value: [
      dayjs().subtract(1, 'month').startOf('month'),
      dayjs().subtract(1, 'month').endOf('month')
    ]
  },
  { label: 'This Year', value: [dayjs().startOf('year'), dayjs().endOf('day')] }
]

type Ctx = { companyId: string; companyName: string }

function profitClass(value: number): string {
  if (value > 0) return 'profit-positive'
  if (value < 0) return 'profit-negative'
  return ''
}

function ChartBox({
  compact,
  children
}: {
  compact?: boolean
  children: React.ReactElement
}) {
  return (
    <div className={`dashboard-chart-box ${compact ? 'dashboard-chart-box--compact' : ''}`}>
      <ResponsiveContainer width="100%" height="100%" debounce={150}>
        {children}
      </ResponsiveContainer>
    </div>
  )
}

function KpiCard({
  label,
  amount,
  displayValue,
  meta,
  icon,
  iconBg,
  loading,
  valueClass
}: {
  label: string
  amount?: number
  displayValue?: string
  meta?: string
  icon: React.ReactNode
  iconBg: string
  loading?: boolean
  valueClass?: string
}) {
  const value = displayValue ?? formatCompactRs(amount)
  const tooltip = displayValue ? String(amount ?? 0) : formatRs(amount)
  return (
    <Card bordered={false} className="dashboard-kpi shadow-sm" loading={loading}>
      <div className="dashboard-kpi-body">
        <div className="dashboard-kpi-icon" style={{ background: iconBg }}>
          {icon}
        </div>
        <div className="dashboard-kpi-content">
          <div className="dashboard-kpi-label">{label}</div>
          <div className={`dashboard-kpi-value ${valueClass || ''}`} title={tooltip}>
            {value}
          </div>
          {meta ? (
            <div className="dashboard-kpi-meta" title={meta}>
              {meta}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

function PlRow({
  label,
  amount,
  muted,
  total,
  sub,
  valueClass
}: {
  label: string
  amount: number
  muted?: boolean
  total?: boolean
  sub?: boolean
  valueClass?: string
}) {
  const prefix = muted && amount !== 0 ? '− ' : ''
  const formatted = `${prefix}${formatCompactRs(Math.abs(amount))}`
  return (
    <div
      className={`dashboard-pl-row ${total ? 'dashboard-pl-row--total' : ''} ${sub ? 'dashboard-pl-row--sub' : ''}`}
    >
      <span>{label}</span>
      <span className={valueClass || ''} title={formatRs(amount)}>
        {formatted}
      </span>
    </div>
  )
}

export default function BusinessDashboardPage() {
  const { token } = useAuth()
  const { companyId, companyName } = useOutletContext<Ctx>()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<BusinessAnalytics | null>(null)
  const [filters, setFilters] = useState<BusinessFilterOptions | null>(null)
  const [branchId, setBranchId] = useState<string>()
  const [supplierId, setSupplierId] = useState<string>()
  const [productId, setProductId] = useState<string>()
  const [partId, setPartId] = useState<string>()
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    ALL_TIME_START,
    dayjs().endOf('day')
  ])
  const [refreshKey, setRefreshKey] = useState(0)
  const [repairing, setRepairing] = useState(false)
  const requestIdRef = useRef(0)

  const from = dateRange[0].format('YYYY-MM-DD')
  const to = dateRange[1].format('YYYY-MM-DD')
  const isAllTime = dateRange[0].isSame(ALL_TIME_START, 'day')

  useEffect(() => {
    if (!token || !companyId) return
    getBusinessFilterOptions(token, companyId).then(setFilters).catch(() => undefined)
  }, [token, companyId])

  useEffect(() => {
    if (!token || !companyId) return
    const requestId = ++requestIdRef.current
    setLoading(true)
    getBusinessDashboard(token, companyId, {
      from,
      to,
      branchId,
      supplierId,
      productId,
      partId
    })
      .then((res) => {
        if (requestId === requestIdRef.current) setData(res)
      })
      .catch(() => {
        if (requestId === requestIdRef.current) setData(null)
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false)
      })
  }, [token, companyId, from, to, branchId, supplierId, productId, partId, refreshKey])

  const kpis = data?.kpis || {}
  const pl = data?.profitLoss
  const insights = data?.insights || {}
  const trend = data?.trend || []
  const topProducts = data?.topProducts || []
  const expensesByCategory = data?.expensesByCategory || []

  const chartTrend = useMemo(
    () =>
      trend.map((row) => ({
        ...row,
        label: dayjs(row.date).format('DD MMM')
      })),
    [trend]
  )

  const periodLabel = data
    ? isAllTime
      ? 'All time'
      : `${dayjs(data.period.from).format('DD MMM YYYY')} – ${dayjs(data.period.to).format('DD MMM YYYY')}`
    : ''

  const topProductChartHeight = useMemo(
    () => Math.max(220, topProducts.length * 52),
    [topProducts.length]
  )

  const branchName = filters?.branches.find((b) => b.id === branchId)?.name

  return (
    <div className="dashboard">
      <div className="madix-page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1>{companyName}</h1>
          <p>
            {branchName
              ? `${branchName} analytics overview`
              : 'Company-wide analytics overview'}
          </p>
        </div>
        <div className="dashboard-toolbar">
          <div className="dashboard-toolbar-left">
            <RangePicker
              value={dateRange}
              presets={rangePresets}
              allowClear={false}
              format={isAllTime ? [() => 'All', () => ''] : 'YYYY-MM-DD'}
              separator={isAllTime ? '' : '-'}
              onChange={(v) => {
                if (v?.[0] && v?.[1]) setDateRange([v[0].startOf('day'), v[1].endOf('day')])
              }}
            />
          </div>
          <div className="dashboard-toolbar-right">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Branch"
              style={{ width: 160 }}
              options={(filters?.branches || []).map((b) => ({ value: b.id, label: b.name }))}
              value={branchId}
              onChange={setBranchId}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Supplier"
              style={{ width: 160 }}
              options={(filters?.suppliers || []).map((s) => ({ value: s.id, label: s.name }))}
              value={supplierId}
              onChange={setSupplierId}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Product"
              style={{ width: 160 }}
              options={(filters?.products || []).map((p) => ({ value: p.id, label: p.name }))}
              value={productId}
              onChange={setProductId}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Part"
              style={{ width: 160 }}
              options={(filters?.parts || []).map((p) => ({ value: p.id, label: p.name }))}
              value={partId}
              onChange={setPartId}
            />
            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              Refresh
            </Button>
            <Button
              loading={repairing}
              onClick={() => {
                Modal.confirm({
                  title: 'Repair all voided sale ledgers?',
                  content:
                    'Scans cancelled/voided sales and clears leftover customer balances (fixes false negative Outstanding).',
                  onOk: async () => {
                    if (!token) return
                    setRepairing(true)
                    try {
                      const result = await repairAllVoidedSaleLedgers(token, companyId)
                      message.success(
                        `Scanned ${result.scanned} voided sales · repaired ${result.repaired}`
                      )
                      setRefreshKey((k) => k + 1)
                    } catch (err: any) {
                      message.error(err.message)
                    } finally {
                      setRepairing(false)
                    }
                  }
                })
              }}
            >
              Repair voided ledgers
            </Button>
            <Button
              loading={repairing}
              onClick={() => {
                Modal.confirm({
                  title: 'Backfill purchase AP ledgers?',
                  content:
                    'Scans product and part purchases and posts any missing supplier ledger debit/credit so historical bills appear on supplier statements. Safe to re-run.',
                  onOk: async () => {
                    if (!token) return
                    setRepairing(true)
                    try {
                      const result = await backfillPurchaseApLedgers(token, companyId)
                      message.success(
                        `Scanned ${result.scanned} purchases · repaired ${result.repaired} · skipped ${result.skipped}`
                      )
                      setRefreshKey((k) => k + 1)
                    } catch (err: any) {
                      message.error(err.message)
                    } finally {
                      setRepairing(false)
                    }
                  }
                })
              }}
            >
              Backfill purchase ledgers
            </Button>
            <Button
              onClick={() => {
                setBranchId(undefined)
                setSupplierId(undefined)
                setProductId(undefined)
                setPartId(undefined)
                setDateRange([ALL_TIME_START, dayjs().endOf('day')])
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </div>

      {(kpis.voidedSalesInPeriod || 0) > 0 ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${kpis.voidedSalesInPeriod} voided sale(s) excluded from this period`}
          description={`Voided revenue ${formatCompactRs(kpis.voidedRevenueInPeriod)} is not counted in Sales / Profit. Use “Repair voided ledgers” if Outstanding still looks wrong after a void.`}
        />
      ) : null}

      <div className="dashboard-kpi-grid">
        <KpiCard
          loading={loading}
          label="Sales Revenue"
          amount={kpis.salesRevenue}
          meta={
            (kpis.voidedSalesInPeriod || 0) > 0
              ? `${kpis.salesCount || 0} sales · ${kpis.unitsSold || 0} units · ${kpis.voidedSalesInPeriod} voided excluded`
              : `${kpis.salesCount || 0} sales · ${kpis.unitsSold || 0} units`
          }
          icon={<ShoppingCartOutlined style={{ color: '#2563eb' }} />}
          iconBg="#eff6ff"
        />
        <KpiCard
          loading={loading}
          label="Gross Profit"
          amount={pl?.grossProfit}
          meta={pl ? `${pl.grossMarginPercent}% margin` : undefined}
          icon={<RiseOutlined style={{ color: '#16a34a' }} />}
          iconBg="#f0fdf4"
          valueClass={profitClass(pl?.grossProfit || 0)}
        />
        <KpiCard
          loading={loading}
          label="Net Profit / Loss"
          amount={pl?.netProfit}
          meta={pl ? `${pl.netMarginPercent}% net margin` : undefined}
          icon={
            (pl?.netProfit || 0) >= 0 ? (
              <RiseOutlined style={{ color: '#16a34a' }} />
            ) : (
              <FallOutlined style={{ color: '#dc2626' }} />
            )
          }
          iconBg={(pl?.netProfit || 0) >= 0 ? '#f0fdf4' : '#fef2f2'}
          valueClass={profitClass(pl?.netProfit || 0)}
        />
        <KpiCard
          loading={loading}
          label="Expenses"
          amount={kpis.expenses}
          meta={`${kpis.expenseCount || 0} entries`}
          icon={<WalletOutlined style={{ color: '#f59e0b' }} />}
          iconBg="#fffbeb"
        />
        <KpiCard
          loading={loading}
          label="Collected"
          amount={kpis.collectedAmount}
          meta={`${insights.collectionRate || 0}% of sales`}
          icon={<FundOutlined style={{ color: '#0891b2' }} />}
          iconBg="#ecfeff"
        />
        <KpiCard
          loading={loading}
          label="Due Amount"
          amount={kpis.dueAmount}
          meta="In selected period"
          icon={<BarChartOutlined style={{ color: '#7c3aed' }} />}
          iconBg="#f5f3ff"
        />
        <KpiCard
          loading={loading}
          label="Purchases"
          amount={kpis.purchaseValue}
          meta={`${kpis.purchaseUnits || 0} units · ${kpis.purchaseCount || 0} bills`}
          icon={<ShoppingOutlined style={{ color: '#ea580c' }} />}
          iconBg="#fff7ed"
        />
        <KpiCard
          loading={loading}
          label="In Stock"
          amount={kpis.inStockCount}
          displayValue={formatCompact(kpis.inStockCount)}
          meta={`${formatCompact(kpis.partStockUnits || 0)} part units · ${formatCompactRs(kpis.inventoryValue)}`}
          icon={<ShoppingOutlined style={{ color: '#475569' }} />}
          iconBg="#f8fafc"
        />
        <KpiCard
          loading={loading}
          label="Outstanding"
          amount={kpis.outstandingBalance}
          meta={
            (kpis.customerCreditBalance || 0) > 0
              ? `Customers owe · credit ${formatCompactRs(kpis.customerCreditBalance)}`
              : 'Customers owe (live ledger)'
          }
          icon={<WalletOutlined style={{ color: '#be123c' }} />}
          iconBg="#fff1f2"
        />
        <KpiCard
          loading={loading}
          label="Avg Sale Value"
          amount={insights.avgSaleValue}
          meta={`${formatCompactRs(insights.avgUnitSalePrice)} / unit`}
          icon={<BarChartOutlined style={{ color: '#0d9488' }} />}
          iconBg="#f0fdfa"
        />
      </div>

      <div className="dashboard-section dashboard-section--split">
        <Card
          bordered={false}
          className="dashboard-chart-card shadow-sm"
          title="Sales, Purchases & Expenses"
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              {periodLabel}
            </Text>
          }
          loading={loading}
        >
          {chartTrend.length === 0 ? (
            <div className="dashboard-chart-empty">No activity in this period.</div>
          ) : (
            <ChartBox>
              <AreaChart data={chartTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  width={48}
                  tickFormatter={(v) => formatCompactAxis(v)}
                />
                <Tooltip
                  formatter={(v) => formatRs(Number(v ?? 0))}
                  labelFormatter={(l) => String(l)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="sales"
                  name="Sales"
                  stroke="#2563eb"
                  fill="url(#salesGrad)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="purchases"
                  name="Purchases"
                  stroke="#16a34a"
                  fill="transparent"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  name="Expenses"
                  stroke="#f59e0b"
                  fill="url(#expenseGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartBox>
          )}
        </Card>

        <Card bordered={false} className="dashboard-pl shadow-sm" title="Profit & Loss" loading={loading}>
          {periodLabel ? (
            <Text type="secondary" className="dashboard-pl-period">
              {periodLabel}
            </Text>
          ) : null}
          {pl ? (
            <>
              <PlRow label="Revenue (Sales)" amount={pl.revenue} />
              <PlRow label="Cost of Goods Sold" amount={pl.cogs} muted sub />
              <div className="dashboard-pl-divider" />
              <PlRow
                label="Gross Profit"
                amount={pl.grossProfit}
                total
                valueClass={profitClass(pl.grossProfit)}
              />
              <Text type="secondary" className="dashboard-pl-footnote">
                {pl.grossMarginPercent}% gross margin
              </Text>
              <PlRow label="Operating Expenses" amount={pl.expenses} muted sub />
              <div className="dashboard-pl-divider-solid" />
              <PlRow
                label={pl.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
                amount={pl.netProfit}
                total
                valueClass={profitClass(pl.netProfit)}
              />
              <Text type="secondary" className="dashboard-pl-footnote">
                {pl.netMarginPercent}% net margin · expense ratio {insights.expenseRatio || 0}%
              </Text>
            </>
          ) : null}
        </Card>
      </div>

      <div className="dashboard-section dashboard-section--charts">
        <Card
          bordered={false}
          className="dashboard-chart-card shadow-sm"
          title="Top Sellers"
          loading={loading}
        >
          {topProducts.length === 0 ? (
            <div className="dashboard-chart-empty">No sales in this period.</div>
          ) : (
            <div style={{ height: topProductChartHeight }}>
              <ResponsiveContainer width="100%" height="100%" debounce={150}>
                <BarChart
                  data={topProducts}
                  layout="vertical"
                  margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatCompactAxis(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={96}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      String(v).length > 14 ? `${String(v).slice(0, 14)}…` : String(v)
                    }
                  />
                  <Tooltip formatter={(v) => formatRs(Number(v ?? 0))} />
                  <Bar
                    dataKey="revenue"
                    name="Revenue"
                    fill="#2563eb"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card
          bordered={false}
          className="dashboard-chart-card shadow-sm"
          title="Expenses by Category"
          loading={loading}
        >
          {expensesByCategory.length === 0 ? (
            <div className="dashboard-chart-empty">No expenses in this period.</div>
          ) : (
            <ChartBox compact>
              <PieChart>
                <Pie
                  data={expensesByCategory}
                  dataKey="amount"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius="42%"
                  outerRadius="68%"
                  paddingAngle={2}
                >
                  {expensesByCategory.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatRs(Number(v ?? 0))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ChartBox>
          )}
        </Card>
      </div>
    </div>
  )
}
