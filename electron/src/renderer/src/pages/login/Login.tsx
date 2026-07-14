import { useState, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Input, Typography, message } from 'antd'
import { RequiredRule, App_Routes } from '@/common'
import { authAPI } from '@/renderer/services'
import { appActions, sessionActions, IRootState } from '@/renderer/redux'

type OtpPurpose = 'email_verify' | 'device_reset'

type CompanyMismatch = {
  status: 'company_mismatch'
  localCompanyId: string
  localCompanyName: string
  incomingCompanyId: string
  incomingCompanyName: string
  message: string
  email: string
  password: string
  otp?: string
  otpPurpose?: OtpPurpose
}

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
  const [companyMismatch, setCompanyMismatch] = useState<CompanyMismatch | null>(null)
  const [wipeConfirm, setWipeConfirm] = useState('')
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
        enterApp(result)
      } catch (err: unknown) {
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

  const handleGateStatuses = (
    result: any,
    credentials: { email: string; password: string; otp?: string; otpPurpose?: OtpPurpose }
  ): boolean => {
    if (result.status === 'otp_required') {
      setOtpStep({ purpose: result.otpPurpose, email: credentials.email, password: credentials.password })
      setCompanyMismatch(null)
      message.info(result.message)
      return true
    }
    if (result.status === 'company_switch_blocked') {
      message.error(result.message)
      return true
    }
    if (result.status === 'company_mismatch') {
      setCompanyMismatch({
        ...result,
        email: credentials.email,
        password: credentials.password,
        otp: credentials.otp,
        otpPurpose: credentials.otpPurpose
      })
      setWipeConfirm('')
      return true
    }
    return false
  }

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true)
    try {
      const result: any = await authAPI.login(values.email, values.password)
      if (handleGateStatuses(result, values)) return
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
      if (handleGateStatuses(result, {
        email: otpStep.email,
        password: otpStep.password,
        otp: otpCode,
        otpPurpose: otpStep.purpose
      })) return
      setOtpStep(null)
      setOtpCode('')
      enterApp(result)
    } catch (err: any) {
      message.error(err.message || 'OTP verification failed')
    } finally {
      setLoading(false)
    }
  }

  const wipeConfirmValid =
    wipeConfirm.trim().toUpperCase() === 'WIPE' ||
    (companyMismatch != null &&
      wipeConfirm.trim().toLowerCase() === companyMismatch.localCompanyName.trim().toLowerCase())

  const handleWipeAndSwitch = async () => {
    if (!companyMismatch || !wipeConfirmValid) return
    setLoading(true)
    try {
      const result: any = await authAPI.login(
        companyMismatch.email,
        companyMismatch.password,
        companyMismatch.otp,
        companyMismatch.otpPurpose,
        true
      )
      if (result.status === 'company_switch_blocked') {
        message.error(result.message)
        return
      }
      if (result.status === 'company_mismatch') {
        message.error(result.message || 'Could not switch company')
        return
      }
      if (result.status === 'otp_required') {
        setCompanyMismatch(null)
        setOtpStep({
          purpose: result.otpPurpose,
          email: companyMismatch.email,
          password: companyMismatch.password
        })
        message.info(result.message)
        return
      }
      setCompanyMismatch(null)
      setOtpStep(null)
      setOtpCode('')
      enterApp(result)
    } catch (err: any) {
      message.error(err.message || 'Failed to wipe and switch company')
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

  if (companyMismatch) {
    return (
      <>
        <h2>Company mismatch</h2>
        <Alert
          type="error"
          showIcon
          className="mb-4"
          message={companyMismatch.message}
          description={
            <Typography.Paragraph className="mb-0 mt-2">
              Wiping removes all local sales, stock, and offline queue data for{' '}
              <strong>{companyMismatch.localCompanyName}</strong> on this device. There is no backup.
              You will then sync data for <strong>{companyMismatch.incomingCompanyName}</strong>.
            </Typography.Paragraph>
          }
        />
        <Form layout="vertical">
          <Form.Item
            label={`Type WIPE or "${companyMismatch.localCompanyName}" to confirm`}
            required
          >
            <Input
              size="large"
              value={wipeConfirm}
              onChange={(e) => setWipeConfirm(e.target.value)}
              placeholder="WIPE"
              autoFocus
            />
          </Form.Item>
          <Button
            type="primary"
            danger
            block
            size="large"
            loading={loading}
            disabled={!wipeConfirmValid}
            onClick={handleWipeAndSwitch}
          >
            Wipe this POS and switch to {companyMismatch.incomingCompanyName}
          </Button>
          <Button
            type="link"
            block
            onClick={() => {
              setCompanyMismatch(null)
              setWipeConfirm('')
            }}
          >
            Cancel
          </Button>
        </Form>
      </>
    )
  }

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
      <p className="auth-subtitle"></p>

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
