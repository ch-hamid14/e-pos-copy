export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

export function rowToCamel<T extends Record<string, unknown>>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    out[snakeToCamel(key)] = value
  }
  return out as T
}

export function rowsToCamel<T extends Record<string, unknown>>(rows: Record<string, unknown>[]): T[] {
  return rows.map((r) => rowToCamel<T>(r))
}

export function objectToSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    out[camelToSnake(key)] = value
  }
  return out
}
