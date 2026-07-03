import { Button, ButtonProps } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'

type DownloadInvoiceButtonProps = Omit<ButtonProps, 'onClick'> & {
  onDownload: () => void | Promise<void>
}

export function DownloadInvoiceButton({ onDownload, disabled, loading, ...props }: DownloadInvoiceButtonProps) {
  return (
    <Button
      icon={<DownloadOutlined />}
      disabled={disabled}
      loading={loading}
      onClick={() => void onDownload()}
      {...props}
    >
      Download PDF
    </Button>
  )
}
