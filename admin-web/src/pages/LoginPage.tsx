import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Input, message, Typography } from 'antd'
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
    <div className="madix-login">
      <div className="madix-login__brand">
        <div>
          <div className="madix-sider-brand__mark">M</div>
          <h1 className="madix-brand">Madix Control</h1>
          <p>
            Super admin console for tenant provisioning, schema control, sync health, and platform
            operations.
          </p>
        </div>
        <Typography.Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
          Offline-first POS · online control plane
        </Typography.Text>
      </div>
      <div className="madix-login__form">
        <div className="madix-login__card">
          <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 4 }}>
            Sign in
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
            Use your super admin credentials
          </Typography.Paragraph>
          <Form
            layout="vertical"
            onFinish={onFinish}
            initialValues={{ email: 'superadmin@madix.com' }}
          >
            <Form.Item name="email" label="Email" rules={[{ required: true }]}>
              <Input size="large" />
            </Form.Item>
            <Form.Item name="password" label="Password" rules={[{ required: true }]}>
              <Input.Password size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              Continue
            </Button>
          </Form>
        </div>
      </div>
    </div>
  )
}
