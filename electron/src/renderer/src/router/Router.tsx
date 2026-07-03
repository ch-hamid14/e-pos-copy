import { Spin } from 'antd'
import { LazyExoticComponent, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppRoutes, LazyPages } from './routes'
import { IRootState } from '../redux'
import { App_Routes, Roles } from '@/common/constants'
import { useSelector } from 'react-redux'

const Router = () => {
  const user = useSelector((state: IRootState) => state.app.user)
  const sessionActive = useSelector((state: IRootState) => state.session.active)
  const userRole = user?.role || Roles.ANY
  const isAuthenticated = Boolean(user && sessionActive)

  const wrap = (Component: LazyExoticComponent<() => JSX.Element | null>) => (
    <Suspense fallback={<Spin className="flex justify-center mt-20" />}>
      <Component />
    </Suspense>
  )

  return (
    <Routes>
      <Route element={wrap(LazyPages.AuthLayout)}>
        <Route path={App_Routes.LOGIN} element={wrap(LazyPages.Login)} />
      </Route>

      {isAuthenticated ? (
        <Route element={wrap(LazyPages.AppLayout)}>
          {AppRoutes.filter((el) => el.roles.includes(userRole)).map((el, i) => (
            <Route key={i} path={el.path} element={wrap(el.component)} />
          ))}
          <Route path={App_Routes.LOGOUT} element={wrap(LazyPages.Logout)} />
          <Route path="*" element={wrap(LazyPages.NotFound)} />
        </Route>
      ) : null}

      <Route path="/" element={<Navigate to={App_Routes.LOGIN} replace />} />
      {!isAuthenticated && <Route path="*" element={<Navigate to={App_Routes.LOGIN} replace />} />}
    </Routes>
  )
}

export default Router
