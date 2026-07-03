import { Card, Typography } from 'antd'

const { Title, Paragraph } = Typography

type PageShellProps = {
  title: string
  subtitle?: string
  phase?: string
}

export const PageShell = ({ title, subtitle, phase = 'Phase B+' }: PageShellProps) => (
  <div>
    <Title level={3} className="!mb-1">{title}</Title>
    {subtitle && <Paragraph type="secondary" className="!mb-4">{subtitle}</Paragraph>}
    <Card bordered={false} className="shadow-sm">
      <Paragraph type="secondary" className="!mb-0">
        Screen scaffold ready. Business logic ships in {phase}.
      </Paragraph>
    </Card>
  </div>
)

export default PageShell
