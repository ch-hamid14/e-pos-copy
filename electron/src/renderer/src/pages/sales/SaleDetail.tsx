import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Col, Descriptions, Row, Spin, Statistic, Table, Tag, Typography } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { App_Routes } from '@/common'
import { saleAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { useSaleInvoicePrint } from '@/renderer/hooks/useSaleInvoicePrint'
import { PrintInvoiceButton } from '@/renderer/components/print/PrintInvoiceButton'
import { SaleInvoicePrint } from '@/renderer/components/print/SaleInvoicePrint'
import { ThermalReceiptPrint } from '@/renderer/components/print/ThermalReceiptPrint'
import { formatRs, PageHeader } from '../shared/page-ui'

const { Text } = Typography

export const SaleDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { branchName } = useSession()
  const {
    preparePrint,
    clearPrint,
    handlePrintInvoice,
    handleThermalPrint,
    printDetail,
    hasPrintDetail
  } = useSaleInvoicePrint(branchName || 'Company')

  useEffect(() => {
    if (!id) return
    saleAPI.get(id).then((res) => {
      if (res?.sale) preparePrint(res)
    })
    return () => clearPrint()
  }, [id, preparePrint, clearPrint])

  const detail = printDetail
  const loading = Boolean(id && !detail?.sale)

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spin size="large" />
      </div>
    )
  }

  if (!detail?.sale) {
    return (
      <div>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          className="!px-0 mb-4"
          onClick={() => navigate(App_Routes.SALES_LIST)}
        >
          Back to Sales List
        </Button>
        <Text type="secondary">Sale not found.</Text>
      </div>
    )
  }

  const sale = detail.sale

  return (
    <div>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        className="!px-0 mb-2"
        onClick={() => navigate(App_Routes.SALES_LIST)}
      >
        Back to Sales List
      </Button>

      <PageHeader
        title={`Sale #${sale.billNo ?? '—'}`}
        subtitle={dayjs(sale.saleDate).format('DD MMM YYYY')}
        extra={
          <PrintInvoiceButton
            onThermal={handleThermalPrint}
            onA4Print={handlePrintInvoice}
            disabled={!hasPrintDetail}
          />
        }
      />

      <Card bordered={false} className="shadow-sm mb-4">
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="Customer">{sale.customer?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Date">{dayjs(sale.saleDate).format('DD MMM YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Status">
            {Number(sale.dueAmount) > 0 ? (
              <Tag color="red">Due {formatRs(sale.dueAmount)}</Tag>
            ) : (
              <Tag color="green">Paid in full</Tag>
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Subtotal" value={sale.subtotal ?? 0} prefix="Rs" precision={0} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Tax" value={sale.totalTax ?? 0} prefix="Rs" precision={0} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="WHT" value={sale.totalWht ?? 0} prefix="Rs" precision={0} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Discount" value={sale.discount ?? 0} prefix="Rs" precision={0} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Net Total" value={sale.netTotal ?? 0} prefix="Rs" precision={0} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Paid"
              value={sale.paidAmount ?? 0}
              prefix="Rs"
              precision={0}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Line Items" bordered={false} className="shadow-sm mb-4">
        <Table
          rowKey="id"
          dataSource={detail.lines || []}
          pagination={false}
          columns={[
            { title: 'Chassis Number', dataIndex: 'serialNumber' },
            { title: 'Motor', dataIndex: 'motorNumber', render: (v) => v || '—' },
            { title: 'Product', dataIndex: 'productName' },
            { title: 'Category', dataIndex: 'categoryName', render: (v) => v || '—' },
            { title: 'Color', dataIndex: 'colorName', render: (v) => v || '—' },
            { title: 'Price', dataIndex: 'salePrice', align: 'right' as const, render: formatRs },
            { title: 'Tax', dataIndex: 'taxAmount', align: 'right' as const, render: formatRs },
            { title: 'WHT', dataIndex: 'whtAmount', align: 'right' as const, render: formatRs },
            { title: 'Total', dataIndex: 'lineTotal', align: 'right' as const, render: formatRs }
          ]}
        />
      </Card>

      <Card title="Notes" bordered={false} className="shadow-sm mb-4">
        <Text type={sale.notes ? undefined : 'secondary'}>{sale.notes || '—'}</Text>
      </Card>

      {(detail.payments?.length ?? 0) > 0 && (
        <Card title="Payments" bordered={false} className="shadow-sm">
          <Table
            rowKey="id"
            dataSource={detail.payments}
            pagination={false}
            columns={[
              {
                title: 'Date',
                dataIndex: 'paymentDate',
                render: (v) => dayjs(v).format('DD MMM YYYY')
              },
              { title: 'Method', dataIndex: 'method' },
              { title: 'Amount', dataIndex: 'amount', align: 'right' as const, render: formatRs }
            ]}
          />
        </Card>
      )}

      {printDetail?.sale && (
        <>
          <SaleInvoicePrint detail={printDetail} companyName={branchName || 'Company'} />
          <ThermalReceiptPrint detail={printDetail} companyName={branchName || 'Company'} />
        </>
      )}
    </div>
  )
}

export default SaleDetail
