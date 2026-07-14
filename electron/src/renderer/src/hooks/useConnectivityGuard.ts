import { useCallback, useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { message } from 'antd'
import { App_Routes } from '@/common'
import { authAPI } from '@/renderer/services'
import { appActions, sessionActions, IRootState } from '@/renderer/redux'

function formatRemain(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Listens for back-online (browser + main events), runs ensureOnlineSession,
 * and drives the 5-minute reauth grace countdown in the header.
 */
export function useConnectivityGuard() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { active, reauthGrace } = useSelector((s: IRootState) => s.session)
  const [remainLabel, setRemainLabel] = useState('')

  const forceLogin = useCallback(
    async (reason: string) => {
      try {
        await authAPI.logout()
      } catch {
        /* ignore */
      }
      dispatch(appActions.clearSession())
      dispatch(sessionActions.deactivate())
      message.warning(reason)
      navigate(App_Routes.LOGIN)
    },
    [dispatch, navigate]
  )

  useEffect(() => {
    if (!active) return

    const unsub = window.api.onConnectivity((event) => {
      if (event.status === 'reconnected') {
        dispatch(sessionActions.setReauthGrace(null))
        message.success('Back online — sync resumed')
        return
      }
      if (event.status === 'reauth_required') {
        dispatch(
          sessionActions.setReauthGrace({
            deadline: event.deadline,
            reason: event.reason
          })
        )
        return
      }
      if (event.status === 'session_ended') {
        void forceLogin(event.reason)
      }
    })

    void authAPI.getReauthGrace().then((res) => {
      if (res.grace) dispatch(sessionActions.setReauthGrace(res.grace))
    })

    const onBrowserOnline = () => {
      void authAPI.ensureOnline().then((res) => {
        if (res.status === 'reauth_required' && res.deadline) {
          dispatch(
            sessionActions.setReauthGrace({
              deadline: res.deadline,
              reason: res.reason || 'Internet is back. Sign in to sync.'
            })
          )
        } else if (res.status === 'reconnected') {
          dispatch(sessionActions.setReauthGrace(null))
        } else if (res.status === 'session_ended') {
          void forceLogin(res.reason || 'Session ended. Sign in to continue syncing.')
        }
      })
    }

    window.addEventListener('online', onBrowserOnline)
    return () => {
      unsub()
      window.removeEventListener('online', onBrowserOnline)
    }
  }, [active, dispatch, forceLogin])

  useEffect(() => {
    if (!reauthGrace) {
      setRemainLabel('')
      return
    }

    const tick = () => {
      const left = reauthGrace.deadline - Date.now()
      if (left <= 0) {
        setRemainLabel('0:00')
        void forceLogin('Grace period ended. Sign in to continue syncing.')
        return
      }
      setRemainLabel(formatRemain(left))
    }

    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [reauthGrace, forceLogin])

  return {
    reauthGrace,
    remainLabel,
    signInNow: () => forceLogin('Sign in to sync.')
  }
}
