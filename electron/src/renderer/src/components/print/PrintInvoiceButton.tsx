import { Button, ButtonProps } from 'antd'
import { PrinterOutlined } from '@ant-design/icons'

type PrintInvoiceButtonProps = Omit<ButtonProps, 'onClick'> & {
  onPrint: () => void
}

export function PrintInvoiceButton({ onPrint, disabled, ...props }: PrintInvoiceButtonProps) {
  return (
    <Button
      icon={<PrinterOutlined />}
      disabled={disabled}
      onClick={() => onPrint()}
      {...props}
    >
      Print Invoice
    </Button>
  )
}
