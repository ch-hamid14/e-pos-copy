/** Styles for A4 ledger statement print / PDF. */
export const LEDGER_STATEMENT_PRINT_CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    color: #111827;
    font-size: 11px;
  }
  .ledger-page {
    width: 210mm;
    min-height: 297mm;
    padding: 14mm 12mm 16mm;
  }
  .ledger-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #111827;
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .ledger-brand {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .ledger-title {
    font-size: 14px;
    font-weight: 700;
    text-align: right;
  }
  .ledger-meta {
    color: #4b5563;
    margin-top: 4px;
  }
  .ledger-party {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 24px;
    margin-bottom: 14px;
  }
  .ledger-party-row {
    display: flex;
    gap: 8px;
  }
  .ledger-label {
    font-weight: 700;
    min-width: 72px;
  }
  .ledger-table {
    width: 100%;
    border-collapse: collapse;
  }
  .ledger-table th,
  .ledger-table td {
    border: 1px solid #d1d5db;
    padding: 6px 8px;
    vertical-align: top;
  }
  .ledger-table th {
    background: #f3f4f6;
    font-weight: 700;
    text-align: left;
  }
  .col-date { width: 88px; }
  .col-type { width: 54px; text-align: center; }
  .col-amt { width: 90px; text-align: right; white-space: nowrap; }
  .ledger-footer {
    margin-top: 16px;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #6b7280;
  }
  .ledger-summary {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end;
    gap: 24px;
    font-weight: 700;
  }
  @page { size: A4; margin: 0; }
`
