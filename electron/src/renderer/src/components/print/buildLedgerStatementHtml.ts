import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LedgerStatement } from './LedgerStatement'
import { LEDGER_STATEMENT_PRINT_CSS } from './ledgerStatementPrintStyles'
import {
  mapLedgerToStatement,
  type LedgerPartyData,
  type PrintCompanyHeader
} from './ledgerStatementTypes'

export function buildLedgerStatementHtml(
  party: LedgerPartyData,
  company: PrintCompanyHeader | string
): string | null {
  const data = mapLedgerToStatement(party, company)
  if (!data) return null

  const markup = renderToStaticMarkup(createElement(LedgerStatement, { data }))
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>${LEDGER_STATEMENT_PRINT_CSS}</style>
  </head>
  <body>${markup}</body>
</html>`
}
