import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { MemoryRouter } from 'react-router-dom'
import { persistor, store } from './redux'
import { PersistGate } from 'redux-persist/integration/react'
import { Provider } from 'react-redux'
import { ConfigProvider } from 'antd'
import { appTheme } from './theme/ant-theme'
import './main.scss'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate persistor={persistor}>
        <ConfigProvider theme={appTheme} modal={{ centered: true }}>
          <MemoryRouter>
            <App />
          </MemoryRouter>
        </ConfigProvider>
      </PersistGate>
    </Provider>
  </React.StrictMode>
)
