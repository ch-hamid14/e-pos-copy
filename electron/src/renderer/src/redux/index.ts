import { configureStore, combineReducers } from '@reduxjs/toolkit'
import storage from 'redux-persist/es/storage'
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER
} from 'redux-persist'
import { appReducer, sessionReducer } from './slices'

const persistedAppReducer = persistReducer({ key: 'epos-app', version: 1, storage }, appReducer)

const rootReducer = combineReducers({
  app: persistedAppReducer,
  session: sessionReducer
})

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER]
      }
    })
})

export type IRootState = ReturnType<typeof store.getState>
export const persistor = persistStore(store)
export * from './slices'
