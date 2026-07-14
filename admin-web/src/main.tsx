import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#0f8f7a',
          colorInfo: '#0f8f7a',
          colorSuccess: '#1f7a4d',
          colorWarning: '#b7791f',
          colorError: '#c23b3b',
          colorText: '#15202b',
          colorTextSecondary: '#5b6b7c',
          colorBorder: '#d5dde6',
          colorBgLayout: '#e8edf2',
          colorBgContainer: '#ffffff',
          borderRadius: 8,
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          controlHeight: 36
        },
        components: {
          Layout: {
            siderBg: '#0f1419',
            headerBg: '#ffffff',
            bodyBg: '#e8edf2'
          },
          Menu: {
            darkItemBg: '#0f1419',
            darkSubMenuItemBg: '#0f1419',
            darkItemSelectedBg: 'rgba(15, 143, 122, 0.22)',
            darkItemHoverBg: 'rgba(255, 255, 255, 0.06)'
          },
          Card: {
            paddingLG: 20
          },
          Table: {
            headerBg: '#f4f7fa'
          },
          Button: {
            primaryShadow: 'none'
          }
        }
      }}
    >
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
)
