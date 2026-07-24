/** Compact, useful A4 ledger statement — letterhead + summary + clean table. */
export const LEDGER_STATEMENT_PRINT_CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "IBM Plex Sans", "Segoe UI", Arial, sans-serif;
    color: #111827;
    font-size: 11px;
    background: #fff;
  }
  .ledger-page {
    width: 210mm;
    min-height: 297mm;
    padding: 14mm 14mm 12mm;
    display: flex;
    flex-direction: column;
  }

  /* ── Compact letterhead ── */
  .ledger-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding-bottom: 10px;
    border-bottom: 1.5px solid #111827;
  }
  .ledger-header-main {
    min-width: 0;
    flex: 1;
  }
  .ledger-company-name {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.01em;
    line-height: 1.2;
    color: #0f172a;
  }
  .ledger-company-address {
    margin-top: 4px;
    font-size: 10.5px;
    font-weight: 500;
    color: #4b5563;
    line-height: 1.4;
  }
  .ledger-header-side {
    text-align: right;
    flex-shrink: 0;
  }
  .ledger-contact-label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #6b7280;
  }
  .ledger-contact-value {
    margin-top: 2px;
    font-size: 12px;
    font-weight: 700;
    color: #111827;
  }

  /* ── Title + meta ── */
  .ledger-title-block {
    margin: 14px 0 12px;
  }
  .ledger-title {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #0f172a;
  }
  .ledger-meta,
  .ledger-party-line {
    margin-top: 4px;
    font-size: 10.5px;
    font-weight: 500;
    color: #4b5563;
  }
  .ledger-meta-sep {
    margin: 0 6px;
    color: #9ca3af;
  }

  /* ── Summary strip ── */
  .ledger-summary-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }
  .ledger-summary-item {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 8px 10px;
    background: #f9fafb;
  }
  .ledger-summary-item--accent {
    background: #f8fafc;
    border-color: #cbd5e1;
  }
  .ledger-summary-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #6b7280;
  }
  .ledger-summary-value {
    margin-top: 3px;
    font-size: 13px;
    font-weight: 800;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
  }

  /* ── Table ── */
  .ledger-table {
    width: 100%;
    border-collapse: collapse;
  }
  .ledger-table th,
  .ledger-table td {
    padding: 7px 8px;
    vertical-align: middle;
    border-bottom: 1px solid #e5e7eb;
    font-variant-numeric: tabular-nums;
  }
  .ledger-table th {
    background: #0f172a;
    color: #fff;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-align: left;
    border-bottom: none;
  }
  .ledger-table th.col-amt,
  .ledger-table th.col-type {
    text-align: center;
  }
  .ledger-table th.col-amt {
    text-align: right;
  }
  .ledger-table tbody tr:nth-child(even) {
    background: #f8fafc;
  }
  .ledger-table tbody tr:last-child td {
    border-bottom: 1.5px solid #111827;
  }
  .col-date { width: 92px; white-space: nowrap; }
  .col-type { width: 56px; text-align: center; }
  .col-ref {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10.5px;
    letter-spacing: 0.02em;
  }
  .col-amt { width: 92px; text-align: right; white-space: nowrap; }
  .col-balance { font-weight: 700; }
  .ledger-type-chip {
    display: inline-block;
    min-width: 28px;
    padding: 1px 6px;
    border-radius: 999px;
    background: #e2e8f0;
    color: #0f172a;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.03em;
  }
  .ledger-empty {
    text-align: center;
    color: #6b7280;
    padding: 18px 8px !important;
  }

  /* ── Footer ── */
  .ledger-footer {
    margin-top: auto;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .ledger-footer-logo {
    height: 22px;
    width: auto;
    display: block;
    border-radius: 3px;
  }
  .ledger-footer-powered {
    font-size: 10px;
    font-weight: 500;
    color: #6b7280;
    text-align: right;
  }
  .ledger-footer-powered strong {
    color: #111827;
    font-weight: 700;
  }

  @page { size: A4; margin: 0; }
`
