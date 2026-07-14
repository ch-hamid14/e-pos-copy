import { Button, Dropdown, type MenuProps } from 'antd'
import { DownOutlined, PrinterOutlined } from '@ant-design/icons'

type PrintInvoiceButtonProps = {
  onThermal: () => void | Promise<void>
  onA4Print: () => void
  disabled?: boolean
  loading?: boolean
}

export function PrintInvoiceButton({
  onThermal,
  onA4Print,
  disabled,
  loading
}: PrintInvoiceButtonProps) {
  const items: MenuProps['items'] = [
    { key: 'thermal', label: 'Thermal' },
    { key: 'a4', label: 'A4 Print' }
  ]

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'thermal') void onThermal()
    else if (key === 'a4') onA4Print()
  }

  return (
    <Dropdown menu={{ items, onClick: onMenuClick }} disabled={disabled} trigger={['click']}>
      <Button type="primary" icon={<PrinterOutlined />} disabled={disabled} loading={loading}>
        Print Invoice
        <DownOutlined />
      </Button>
    </Dropdown>
  )
}
