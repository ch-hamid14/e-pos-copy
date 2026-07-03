import express from 'express'
import cors from 'cors'
import { authRouter } from './modules/auth/routes'
import { adminRouter } from './modules/admin/routes'
import { syncRouter } from './modules/sync/routes'
import { requestLogger } from './middleware/request-logger'
import { controlDb } from './db'

const app = express()
const port = process.env.PORT || 4000

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(requestLogger)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'madix-e-pos-backend' })
})

app.use('/api/auth', authRouter(controlDb))
app.use('/api/admin', adminRouter(controlDb))
app.use('/api/sync', syncRouter(controlDb))

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`)
})

export { controlDb }
