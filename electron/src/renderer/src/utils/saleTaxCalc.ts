/** Mirrors electron sale.service calcLine for UI previews. */

export type CustomTaxLine = {
  taxId?: string
  name: string
  percent: number
  inclusive: boolean
  amount?: number
}

export type SaleTaxInput = {
  salePrice: number
  quantity: number
  taxPercent: number
  whtPercent: number
  taxInclusive: boolean
  customTaxes?: CustomTaxLine[]
  fixedAmounts?: {
    base: number
    tax: number
    wht: number
    other: number
    total: number
  }
}

export function roundAmount(n: number): number {
  return Math.round(Number(n) || 0)
}

export function calcSaleLineAmounts(line: SaleTaxInput) {
  if (line.fixedAmounts) {
    return {
      base: line.fixedAmounts.base,
      tax: line.fixedAmounts.tax,
      wht: line.fixedAmounts.wht,
      other: line.fixedAmounts.other,
      total: line.fixedAmounts.total,
      customTaxes: (line.customTaxes || []).map((t) => ({
        ...t,
        amount: t.amount ?? 0
      }))
    }
  }

  const quantity = Math.max(1, Math.floor(Number(line.quantity || 1)))
  const taxPercent = Number(line.taxPercent || 0)
  const whtPercent = Number(line.whtPercent || 0)
  const systemInclusive = Boolean(line.taxInclusive)
  const enteredUnitPrice = Number(line.salePrice || 0)
  const enteredTotal = roundAmount(enteredUnitPrice * quantity)

  const customsIn = (line.customTaxes || [])
    .map((t) => ({
      taxId: t.taxId,
      name: String(t.name || '').trim() || 'Tax',
      percent: Number(t.percent || 0),
      inclusive: Boolean(t.inclusive)
    }))
    .filter((t) => t.percent > 0)

  type Piece = {
    id: string
    kind: 'sale' | 'wht' | 'custom'
    taxId?: string
    name: string
    percent: number
    inclusive: boolean
  }

  const pieces: Piece[] = []
  if (taxPercent > 0) {
    pieces.push({
      id: 'sale',
      kind: 'sale',
      name: 'Sale Tax',
      percent: taxPercent,
      inclusive: systemInclusive
    })
  }
  if (whtPercent > 0) {
    pieces.push({
      id: 'wht',
      kind: 'wht',
      name: 'Tax u/s 236 G/H',
      percent: whtPercent,
      inclusive: systemInclusive
    })
  }
  customsIn.forEach((c, i) => {
    pieces.push({
      id: `custom-${i}`,
      kind: 'custom',
      taxId: c.taxId,
      name: c.name,
      percent: c.percent,
      inclusive: c.inclusive
    })
  })

  const inclusivePieces = pieces.filter((p) => p.inclusive)
  const exclusivePieces = pieces.filter((p) => !p.inclusive)
  const hasInclusive = inclusivePieces.length > 0
  const inclusiveRateSum = inclusivePieces.reduce((s, p) => s + p.percent, 0)
  const factor = 1 + inclusiveRateSum / 100

  const unitPrice = hasInclusive ? roundAmount(enteredUnitPrice / factor) : enteredUnitPrice
  const extended = roundAmount(unitPrice * quantity)

  const amountById = new Map<string, number>()
  for (const p of pieces) {
    amountById.set(p.id, roundAmount((extended * p.percent) / 100))
  }

  let total: number
  if (hasInclusive) {
    const exclusiveSum = exclusivePieces.reduce((s, p) => s + (amountById.get(p.id) || 0), 0)
    const targetInclusive = roundAmount(enteredTotal - extended)
    let allocated = 0
    inclusivePieces.forEach((p, idx) => {
      if (idx === inclusivePieces.length - 1) {
        amountById.set(p.id, roundAmount(targetInclusive - allocated))
      } else {
        allocated += amountById.get(p.id) || 0
      }
    })
    total = roundAmount(enteredTotal + exclusiveSum)
  } else {
    const allSum = pieces.reduce((s, p) => s + (amountById.get(p.id) || 0), 0)
    total = roundAmount(extended + allSum)
  }

  const customTaxes = pieces
    .filter((p) => p.kind === 'custom')
    .map((p) => ({
      taxId: p.taxId,
      name: p.name,
      percent: p.percent,
      inclusive: p.inclusive,
      amount: amountById.get(p.id) || 0
    }))

  return {
    base: extended,
    tax: amountById.get('sale') || 0,
    wht: amountById.get('wht') || 0,
    other: roundAmount(customTaxes.reduce((s, t) => s + t.amount, 0)),
    total,
    customTaxes
  }
}
