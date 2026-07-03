import { createSlice } from '@reduxjs/toolkit'

type SessionState = {
  active: boolean
}

const initialState: SessionState = {
  active: false
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
    }
  }
})

export const sessionActions = sessionSlice.actions
export const sessionReducer = sessionSlice.reducer
