import { billItemProviderLabel } from '@/lib/billItemDisplay';

/** Data needed to render a customer-facing bill receipt in a print window. */
export interface BillDetailsForPrint {
  bill: {
    bill_code: string;
    total_amount: number;
    discount_amount: number;
    discount_percent: number;
    final_amount: number;
    paid_amount: number;
    payment_status: string;
    status: string;
    payment_method?: string | null;
    completed_at?: string | null;
  };
  patient: { owner_name?: string; owner_phone?: string } | null;
  animal: { name?: string; type?: string } | null;
  token: { token_number?: number } | null;
  items: Array<{
    item_name: string;
    room_name?: string;
    operator_name?: string;
    operator_id?: number;
    item_type?: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  payments: Array<{
    amount: number;
    payment_method: string;
    received_by_name?: string;
    created_at?: string;
    transaction_id?: string;
  }>;
}

function formatRupee(value: unknown): string {
  const n = Number(value);
  if (Number.isNaN(n)) return '0';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paymentMethodLabel(m: string): string {
  const x = String(m || '').toLowerCase();
  if (x === 'cash') return 'Cash';
  if (x === 'card') return 'Card';
  if (x === 'online') return 'Online';
  return escapeHtml(String(m || '—'));
}

/** Opens a dedicated window and prints only the bill receipt. Returns false if the pop-up was blocked. */
export function printBillReceipt(d: BillDetailsForPrint): boolean {
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const bill = d.bill;
  const isFinal =
    String(bill.status).toLowerCase() === 'completed' &&
    String(bill.payment_status).toLowerCase() === 'paid';

  const owner = d.patient?.owner_name?.trim() || '—';
  const phone = d.patient?.owner_phone?.trim();
  const pet = d.animal?.name?.trim() || '—';
  const petType = d.animal?.type?.trim();
  const petLine = petType ? `${pet} (${petType})` : pet;
  const tokenNo = d.token?.token_number;

  const balance =
    Math.round((Number(bill.final_amount) || 0) * 100 - (Number(bill.paid_amount) || 0) * 100) / 100;

  const itemsRows = (d.items || [])
    .map((item) => {
      const provider = billItemProviderLabel({
        operator_name: item.operator_name,
        operator_id: item.operator_id,
        room_name: item.room_name,
        item_type: item.item_type,
      });
      const sub =
        provider && provider !== '—'
          ? `<div class="muted small">${escapeHtml(provider)}</div>`
          : '';
      return `<tr>
        <td class="item-cell">${escapeHtml(String(item.item_name))}${sub}</td>
        <td class="num">${escapeHtml(String(item.quantity))}</td>
        <td class="num">₹${formatRupee(item.unit_price)}</td>
        <td class="num">₹${formatRupee(item.total_price)}</td>
      </tr>`;
    })
    .join('');

  const paymentsBlock =
    d.payments && d.payments.length > 0
      ? `<div class="section-title">Payments</div>
         <table class="pay-table">
           <thead><tr><th>Method</th><th class="num">Amount</th></tr></thead>
           <tbody>
             ${d.payments
               .map(
                 (p) => `<tr>
               <td>${paymentMethodLabel(p.payment_method)}${p.transaction_id ? ` <span class="muted">#${escapeHtml(String(p.transaction_id))}</span>` : ''}</td>
               <td class="num">₹${formatRupee(p.amount)}</td>
             </tr>`
               )
               .join('')}
           </tbody>
         </table>`
      : '';

  const banner = isFinal
    ? `<div class="paid-banner">Paid — thank you</div>`
    : `<div class="draft-banner">Summary only — not a final receipt</div>`;

  const tokenLine =
    tokenNo != null && Number.isFinite(Number(tokenNo))
      ? `<div class="row"><span class="label">Token</span><span class="val">#${escapeHtml(String(tokenNo))}</span></div>`
      : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bill ${escapeHtml(bill.bill_code)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 20px 24px 32px;
      max-width: 520px;
      margin: 0 auto;
      color: #0f172a;
      font-size: 13px;
      line-height: 1.45;
    }
    .brand { text-align: center; font-size: 15px; font-weight: 800; color: #1e40af; letter-spacing: 0.02em; }
    .doc-title { text-align: center; font-size: 12px; color: #64748b; margin-top: 4px; margin-bottom: 14px; }
    .paid-banner {
      text-align: center;
      background: #ecfdf5;
      color: #047857;
      font-weight: 700;
      font-size: 12px;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid #6ee7b7;
      margin-bottom: 14px;
    }
    .draft-banner {
      text-align: center;
      background: #fffbeb;
      color: #b45309;
      font-weight: 600;
      font-size: 11px;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid #fcd34d;
      margin-bottom: 14px;
    }
    .meta {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 14px;
      background: #f8fafc;
    }
    .row { display: flex; justify-content: space-between; gap: 12px; margin: 6px 0; }
    .label { color: #64748b; flex-shrink: 0; }
    .val { font-weight: 600; text-align: right; word-break: break-word; }
    .bill-code { font-size: 18px; font-weight: 800; color: #0f172a; text-align: center; margin: 4px 0 12px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin: 16px 0 8px; }
    table.items { width: 100%; border-collapse: collapse; font-size: 12px; }
    table.items th {
      text-align: left;
      font-weight: 600;
      color: #475569;
      border-bottom: 2px solid #cbd5e1;
      padding: 8px 6px 8px 0;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    table.items th.num { text-align: right; }
    table.items td {
      padding: 10px 6px 10px 0;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: top;
    }
    table.items td.num { text-align: right; white-space: nowrap; }
    .item-cell { font-weight: 500; }
    .muted { color: #94a3b8; font-weight: 400; }
    .small { font-size: 11px; margin-top: 2px; }
    .totals { margin-top: 12px; border-top: 2px solid #e2e8f0; padding-top: 10px; }
    .totals .row { margin: 5px 0; }
    .totals .grand { font-size: 15px; font-weight: 800; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1; }
    .balance-due { color: #b91c1c; font-weight: 700; }
    table.pay-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
    table.pay-table th, table.pay-table td { padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
    table.pay-table th.num { text-align: right; }
    table.pay-table td.num { text-align: right; }
    .footer {
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
      margin-top: 22px;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
    }
    @media print {
      body { padding: 12px 16px 24px; }
      .paid-banner, .draft-banner { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="brand">Animal Care Hospital</div>
  <div class="doc-title">Customer bill / receipt</div>
  ${banner}
  <div class="bill-code">${escapeHtml(bill.bill_code)}</div>
  <div class="meta">
    <div class="row"><span class="label">Customer</span><span class="val">${escapeHtml(owner)}</span></div>
    ${phone ? `<div class="row"><span class="label">Phone</span><span class="val">${escapeHtml(phone)}</span></div>` : ''}
    <div class="row"><span class="label">Pet</span><span class="val">${escapeHtml(petLine)}</span></div>
    ${tokenLine}
  </div>
  <div class="section-title">Line items</div>
  <table class="items">
    <thead>
      <tr>
        <th>Item</th>
        <th class="num">Qty</th>
        <th class="num">Price</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows || `<tr><td colspan="4" class="muted" style="text-align:center;padding:16px;">No line items</td></tr>`}
    </tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>₹${formatRupee(bill.total_amount)}</span></div>
    ${
      Number(bill.discount_amount) > 0
        ? `<div class="row" style="color:#047857;"><span>Discount (${escapeHtml(String(bill.discount_percent))}%)</span><span>−₹${formatRupee(bill.discount_amount)}</span></div>`
        : ''
    }
    <div class="row grand"><span>Total</span><span>₹${formatRupee(bill.final_amount)}</span></div>
    <div class="row"><span>Paid</span><span style="color:#047857;">₹${formatRupee(bill.paid_amount)}</span></div>
    ${
      balance > 0.009
        ? `<div class="row balance-due"><span>Balance due</span><span>₹${formatRupee(balance)}</span></div>`
        : ''
    }
  </div>
  ${paymentsBlock}
  <div class="footer">
    Printed ${escapeHtml(dateStr)} · ${escapeHtml(timeStr)}
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=560,height=720');
  if (!w) {
    return false;
  }
  w.document.write(html);
  w.document.close();
  return true;
}
