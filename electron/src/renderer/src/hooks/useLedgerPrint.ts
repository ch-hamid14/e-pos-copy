import { useCallback } from 'react'
import { printAPI } from '@/renderer/services'
import { buildLedgerStatementHtml } from '@/renderer/components/print/buildLedgerStatementHtml'
import type {
  LedgerPartyData,
  PrintCompanyHeader
} from '@/renderer/components/print/ledgerStatementTypes'
import dayjs from 'dayjs'

function runPrint(html: string) {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument || frame.contentWindow?.document
  if (!doc) {
    frame.remove()
    throw new Error('Could not open print frame')
  }
  doc.open()
  doc.write(html)
  doc.close()
  const cleanup = () => {
    frame.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  setTimeout(() => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
  }, 50)
}

function ledgerFileName(party: LedgerPartyData): string {
  const name = (party.partyName || party.partyType).replace(/[^\w\-]+/g, '_')
  const date = dayjs().format('YYYYMMDD')
  return `${party.partyType}-ledger-${name}-${date}.pdf`
}

export function useLedgerPrint() {
  const printLedger = useCallback(
    async (party: LedgerPartyData, company: PrintCompanyHeader | string) => {
      const html = buildLedgerStatementHtml(party, company)
      if (!html) throw new Error('Could not build ledger statement')
      runPrint(html)
    },
    []
  )

  const downloadLedger = useCallback(
    async (party: LedgerPartyData, company: PrintCompanyHeader | string) => {
      const html = buildLedgerStatementHtml(party, company)
      if (!html) throw new Error('Could not build ledger statement')
      return printAPI.downloadLedgerStatement(ledgerFileName(party), html)
    },
    []
  )

  return { printLedger, downloadLedger }
}
