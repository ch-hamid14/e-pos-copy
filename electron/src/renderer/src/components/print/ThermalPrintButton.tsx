import { Button, ButtonProps } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'

type ThermalPrintButtonProps = Omit<ButtonProps, 'onClick'> & {
  onDownload: () => void | Promise<void>
}

export function ThermalPrintButton({ onDownload, disabled, loading, ...props }: ThermalPrintButtonProps) {
  return (
    <Button
      type="primary"
      icon={<DownloadOutlined />}
      disabled={disabled}
      loading={loading}
      onClick={() => void onDownload()}
      {...props}
    >
      Download Thermal
    </Button>
  )
}
