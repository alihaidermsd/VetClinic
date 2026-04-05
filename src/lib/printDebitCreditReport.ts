import { brandLogoUrl } from '@/lib/brandLogoUrl';
import type { MonthlyDebitCreditReport } from '@/types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatRs(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function capMethod(m: string): string {
  const x = String(m || '').toLowerCase();
  if (x === 'cash') return 'Cash';
  if (x === 'card') return 'Card';
  if (x === 'online') return 'Online';
  if (x === 'bank') return 'Bank';
  return esc(String(m || '—'));
}

/** Opens a print window with the monthly debit & credit statement. Returns false if pop-up blocked. */
export function printMonthlyDebitCreditReport(report: MonthlyDebitCreditReport): boolean {
  const logoUrl = brandLogoUrl();
  const now = new Date();
  const printed = now.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const rowsCredit = report.credit_lines
    .map(
      (r) => `
    <tr>
      <td>${esc(r.bill_code)}</td>
      <td class="num">${formatRs(r.amount)}</td>
      <td>${capMethod(r.payment_method)}</td>
      <td class="small">${esc(new Date(r.received_at).toLocaleString())}</td>
      <td>${esc(r.received_by_name)}</td>
    </tr>`
    )
    .join('');

  const rowsDebit = report.debit_lines
    .map(
      (r) => `
    <tr>
      <td>${esc(r.staff_name)}</td>
      <td class="num">${formatRs(r.amount)}</td>
      <td>${capMethod(r.payment_method)}</td>
      <td class="small">${esc(new Date(r.paid_at).toLocaleString())}</td>
      <td class="small">${esc(r.period_start)} → ${esc(r.period_end)}</td>
    </tr>`
    )
    .join('');

  const methodRows = report.credit_by_method
    .map(
      (m) => `
    <tr>
      <td>${capMethod(m.payment_method)}</td>
      <td class="num">${m.count}</td>
      <td class="num">${formatRs(m.total_amount)}</td>
    </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Debit &amp; Credit — ${esc(report.month_label)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, Segoe UI, sans-serif; margin: 0; padding: 24px; color: #1e293b; font-size: 12px; }
    .head { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #5e3055; padding-bottom: 16px; }
    .head img { max-height: 56px; width: auto; }
    h1 { font-size: 18px; margin: 12px 0 4px; color: #5e3055; }
    .sub { color: #64748b; font-size: 11px; }
    .summary { display: table; width: 100%; margin: 16px 0; border-collapse: separate; border-spacing: 8px; }
    .sum-cell { display: table-cell; width: 33%; vertical-align: top; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #fafafa; }
    .sum-cell h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
    .sum-cell .big { font-size: 20px; font-weight: 700; }
    .credit .big { color: #166534; }
    .debit .big { color: #9a3412; }
    .net .big { color: #5e3055; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
    th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.small { font-size: 11px; color: #475569; }
    h2 { font-size: 13px; margin: 20px 0 8px; color: #334155; }
    .note { font-size: 10px; color: #64748b; margin-top: 16px; line-height: 1.5; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div class="head">
    <img src="${esc(logoUrl)}" alt="" />
    <h1>Monthly debit &amp; credit</h1>
    <p class="sub">${esc(report.month_label)} · ${esc(report.range_start)} to ${esc(report.range_end)}</p>
    <p class="sub">Printed ${esc(printed)}</p>
  </div>

  <div class="summary">
    <div class="sum-cell credit">
      <h3>Credit (collections)</h3>
      <div class="big">Rs. ${formatRs(report.credit_total)}</div>
      <div class="sub">${report.credit_payment_count} payment entries</div>
    </div>
    <div class="sum-cell debit">
      <h3>Debit (salary paid)</h3>
      <div class="big">Rs. ${formatRs(report.debit_total)}</div>
      <div class="sub">${report.debit_payment_count} payouts</div>
    </div>
    <div class="sum-cell net">
      <h3>Net position</h3>
      <div class="big">Rs. ${formatRs(report.net_position)}</div>
      <div class="sub">Credit − debit</div>
    </div>
  </div>

  <p class="note">
    <strong>Net billed (closed bills):</strong> Rs. ${formatRs(report.net_billed_closed_bills)} — same rules as the Period report (completed or fully paid bills; date on completion or creation).
    Collections can differ from net billed when payments are received in a different month than the bill was closed.
  </p>

  <h2>Collections by payment method</h2>
  <table>
    <thead><tr><th>Method</th><th>Count</th><th>Amount</th></tr></thead>
    <tbody>${methodRows || '<tr><td colspan="3">No collections</td></tr>'}</tbody>
  </table>

  <h2>Credit — payment lines</h2>
  <table>
    <thead>
      <tr><th>Bill</th><th>Amount</th><th>Method</th><th>Received</th><th>Received by</th></tr>
    </thead>
    <tbody>${rowsCredit || '<tr><td colspan="5">No payments in this month</td></tr>'}</tbody>
  </table>

  <h2>Debit — salary payouts</h2>
  <table>
    <thead>
      <tr><th>Staff</th><th>Amount</th><th>Method</th><th>Paid at</th><th>Salary period</th></tr>
    </thead>
    <tbody>${rowsDebit || '<tr><td colspan="5">No salary payouts in this month</td></tr>'}</tbody>
  </table>

  <p class="note">Animal Care Hospital — internal statement. Figures are derived from stored payments and salary records.</p>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'noopener');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
