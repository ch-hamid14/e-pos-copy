import { IUser } from '@/common'
import { createSlice } from '@reduxjs/toolkit'

type AppState = {
  user: IUser | null
  deviceId: string | null
  branchName: string | null
  token: string | null
  tokenExpiresAt: string | null
  offlineAllowedUntil: string | null
  cachedEmail: string | null
}

const initialState: AppState = {
  user: null,
  deviceId: null,
  branchName: null,
  token: null,
  tokenExpiresAt: null,
  offlineAllowedUntil: null,
  cachedEmail: null
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setSession: (state, action) => {
      const { user, deviceId, branchName, token, tokenExpiresAt, offlineAllowedUntil } = action.payload
      state.user = user
      state.deviceId = deviceId
      state.branchName = branchName || null
      state.token = token || user?.token || null
      state.tokenExpiresAt = tokenExpiresAt || null
      state.offlineAllowedUntil = offlineAllowedUntil || null
      state.cachedEmail = user?.email || null
    },
    clearSession: (state) => {
      state.user = null
      state.deviceId = null
      state.branchName = null
      state.token = null
      state.tokenExpiresAt = null
      state.offlineAllowedUntil = null
      state.cachedEmail = null
    }
  }
})

export const appActions = appSlice.actions
export const appReducer = appSlice.reducer
