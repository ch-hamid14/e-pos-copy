import { useState, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Input, message } from 'antd'
import { RequiredRule, App_Routes } from '@/common'
import { authAPI } from '@/renderer/services'
import { appActions, sessionActions, IRootState } from '@/renderer/redux'

type OtpPurpose = 'email_verify' | 'device_reset'

export const Login = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [online, setOnline] = useState(true)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [offlineContinueFailed, setOfflineContinueFailed] = useState(false)
  const [otpStep, setOtpStep] = useState<{ purpose: OtpPurpose; email: string; password: string } | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const bootstrapStarted = useRef(false)

  const { token, cachedEmail } = useSelector((s: IRootState) => s.app)
  const hasCachedAuth = Boolean(token && cachedEmail)

  useEffect(() => {
    if (cachedEmail) form.setFieldValue('email', cachedEmail)
  }, [cachedEmail, form])

  const enterApp = (result: any) => {
    dispatch(appActions.setSession({
      user: result.user,
      deviceId: result.deviceId,
      branchName: result.user.branchName,
      token: result.token,
      tokenExpiresAt: result.tokenExpiresAt,
      offlineAllowedUntil: result.offlineAllowedUntil
    }))
    dispatch(sessionActions.activate())
    navigate(App_Routes.DASHBOARD)
  }

  useEffect(() => {
    authAPI.checkOnline().then((res) => setOnline(res.online)).catch(() => setOnline(false))
  }, [])

  useEffect(() => {
    if (bootstrapStarted.current || !token || !cachedEmail) return
    bootstrapStarted.current = true

    async function bootstrap() {
      setBootstrapping(true)
      try {
        const { online: isOnline } = await authAPI.checkOnline()
        setOnline(isOnline)

        if (isOnline) {
          const result: any = await authAPI.refreshSession(cachedEmail!, token!)
          enterApp(result)
          return
        }

        const result: any = await authAPI.continueSession(cachedEmail!, token!)
        console.log('result', result)
        enterApp(result)
      } catch (err: unknown) {
        console.log('err', err)
        const { online: isOnline } = await authAPI.checkOnline().catch(() => ({ online: false }))
        setOnline(isOnline)
        if (isOnline) {
          setRefreshFailed(true)
        } else {
          setOfflineContinueFailed(true)
        }
        const msg = err instanceof Error ? err.message : 'Could not restore session'
        message.error(msg)
      } finally {
        setBootstrapping(false)
      }
    }

    bootstrap()
  }, [token, cachedEmail])

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true)
    try {
      const result: any = await authAPI.login(values.email, values.password)
      if (result.status === 'otp_required') {
        setOtpStep({ purpose: result.otpPurpose, email: values.email, password: values.password })
        message.info(result.message)
        return
      }
      enterApp(result)
    } catch (err: any) {
      message.error(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }
  

  const handleOtpSubmit = async () => {
    if (!otpStep || !otpCode) return
    setLoading(true)
    try {
      const result: any = await authAPI.login(otpStep.email, otpStep.password, otpCode, otpStep.purpose)
      if (result.status === 'otp_required') {
        message.error(result.message || 'Invalid OTP')
        return
      }
      setOtpStep(null)
      setOtpCode('')
      enterApp(result)
    } catch (err: any) {
      message.error(err.message || 'OTP verification failed')
    } finally {
      setLoading(false)
    }
  }

  const handleResendOtp = async () => {
    if (!otpStep) return
    try {
      await authAPI.sendOtp(otpStep.email, otpStep.purpose)
      message.success('OTP resent')
    } catch (err: any) {
      message.error(err.message || 'Failed to resend OTP')
    }
  }

  const passwordDisabled =
    bootstrapping ||
    (hasCachedAuth && online && !refreshFailed) ||
    !online

  const emailDisabled = Boolean(cachedEmail) || bootstrapping
  const submitLoading = loading || bootstrapping
  const submitDisabled =
    bootstrapping ||
    !online ||
    (hasCachedAuth && online && !refreshFailed)

  if (otpStep) {
    return (
      <>
        <h2>Verification Required</h2>
        <p>{otpStep.purpose === 'email_verify' ? 'Verify your email to continue.' : 'Verify OTP to reset device binding.'}</p>
        <Input
          size="large"
          placeholder="Enter 6-digit OTP"
          value={otpCode}
          onChange={(e) => setOtpCode(e.target.value)}
          maxLength={6}
          className="mb-4"
        />
        <Button type="primary" block size="large" onClick={handleOtpSubmit} loading={loading}>
          Verify OTP
        </Button>
        <Button type="link" block onClick={handleResendOtp}>
          Resend OTP
        </Button>
        <Button type="link" block onClick={() => { setOtpStep(null); setOtpCode('') }}>
          Back to login
        </Button>
      </>
    )
  }

  return (
    <>
      <h2>VOLT POS</h2>
      <p>Serialized inventory POS</p>

      {!online && offlineContinueFailed && (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          message="Offline session expired or invalid. Connect to the internet to sign in again."
        />
      )}

      {refreshFailed && (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message="Session refresh failed. Enter your password to continue."
        />
      )}

      <Form form={form} layout="vertical" onFinish={handleLogin}>
        <Form.Item name="email" label="Email" rules={RequiredRule}>
          <Input size="large" disabled={emailDisabled} />
        </Form.Item>
        <Form.Item name="password" label="Password" rules={RequiredRule}>
          <Input.Password size="large" disabled={passwordDisabled} />
        </Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          loading={submitLoading}
          disabled={submitDisabled}
        >
          Login
        </Button>
      </Form>
    </>
  )
}

export default Login
