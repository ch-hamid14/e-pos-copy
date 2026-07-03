const BELOW_TWENTY = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen'
]

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return BELOW_TWENTY[n]
  const t = TENS[Math.floor(n / 10)]
  const o = BELOW_TWENTY[n % 10]
  return o ? `${t} ${o}` : t
}

function threeDigits(n: number): string {
  if (n === 0) return ''
  if (n < 100) return twoDigits(n)
  const h = BELOW_TWENTY[Math.floor(n / 100)]
  const rest = n % 100
  return rest ? `${h} Hundred ${twoDigits(rest)}` : `${h} Hundred`
}

export function amountInWords(amount: number): string {
  let n = Math.round(Number(amount) || 0)
  if (n === 0) return 'Zero Rupees'

  const parts: string[] = []
  const crore = Math.floor(n / 10000000)
  n %= 10000000
  const lac = Math.floor(n / 100000)
  n %= 100000
  const thousand = Math.floor(n / 1000)
  n %= 1000

  if (crore) parts.push(`${threeDigits(crore)} Crore`)
  if (lac) parts.push(`${twoDigits(lac)} Lac`)
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`)
  if (n) parts.push(threeDigits(n))

  return `${parts.join(' ')} Rupees`
}
