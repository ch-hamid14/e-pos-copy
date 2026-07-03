import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { App_Routes } from '@/common'
import { appActions, sessionActions } from '@/renderer/redux'
import { authAPI } from '@/renderer/services'

export const Logout = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  useEffect(() => {
    authAPI.logout().catch(() => {})
    dispatch(appActions.clearSession())
    dispatch(sessionActions.deactivate())
    navigate(App_Routes.LOGIN)
  }, [])
  return null
}

export default Logout
