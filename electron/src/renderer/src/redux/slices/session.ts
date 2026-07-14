import { createSlice, PayloadAction } from '@reduxjs/toolkit'

type ReauthGrace = {
  deadline: number
  reason: string
}

type SessionState = {
  active: boolean
  reauthGrace: ReauthGrace | null
}

const initialState: SessionState = {
  active: false,
  reauthGrace: null
}

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    activate: (state) => {
      state.active = true
    },
    deactivate: (state) => {
      state.active = false
      state.reauthGrace = null
    },
    setReauthGrace: (state, action: PayloadAction<ReauthGrace | null>) => {
      state.reauthGrace = action.payload
    }
  }
})

export const sessionActions = sessionSlice.actions
export const sessionReducer = sessionSlice.reducer
