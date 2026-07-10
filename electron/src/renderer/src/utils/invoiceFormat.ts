export function roundInvoiceAmount(value: number): number {
  return Math.round(Number(value) || 0)
}

export function formatIndianNumber(value: number): string {
  const n = roundInvoiceAmount(value)
  const s = String(n)
  if (s.length <= 3) return s
  const lastThree = s.slice(-3)
  const rest = s.slice(0, -3)
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}`
}

export function formatInvoicePrice(value: number): string {
  return `${formatIndianNumber(value)}/-`
}

export function formatInvoiceAmount(value: number): string {
  return formatIndianNumber(value)
}
