import { Button, Result } from 'antd'
import { useNavigate } from 'react-router-dom'
import { App_Routes } from '@/common'

export const NotFound = () => {
  const navigate = useNavigate()
  return (
    <Result
      status="404"
      title="404"
      subTitle="Page not found"
      extra={<Button type="primary" onClick={() => navigate(App_Routes.DASHBOARD)}>Go Home</Button>}
    />
  )
}

export default NotFound
