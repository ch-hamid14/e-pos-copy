import type { Request, Response, NextFunction } from 'express'

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()
  const { method, originalUrl } = req

  res.on('finish', () => {
    const ms = Date.now() - start
    const line = `${method} ${originalUrl} ${res.statusCode} ${ms}ms`
    if (res.statusCode >= 400) {
      console.error(`[http] ${line}`)
    } else {
      console.log(`[http] ${line}`)
    }
  })

  next()
}
