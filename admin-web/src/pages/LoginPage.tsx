import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Form, Input, message, Typography } from 'antd'
import { login } from '../api/auth'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setSession } = useAuth()
  const [loading, setLoading] = useState(false)

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true)
    try {
      const res = await login(values.email, values.password)
      if (res.user.role !== 'super_admin') {
        message.error('Only super admin accounts can access this console')
        return
      }
      setSession(res.token, res.user)
      navigate('/')
    } catch (err: any) {
      message.error(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5'
      }}
    >
      <Card style={{ width: 400 }}>
        <Typography.Title level={3}>Madix Platform Admin</Typography.Title>
        <Typography.Paragraph type="secondary">Sign in with your super admin account</Typography.Paragraph>
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message="Requires internet connection to the backend API"
          style={{ marginBottom: 16 }}
        />
        <Form layout="vertical" onFinish={onFinish} initialValues={{ email: 'superadmin@madix.com' }}>
          <Form.Item name="email" label="Email" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            Login
          </Button>
        </Form>
      </Card>
    </div>
  )
}
