/** Opens a small window and prints a queue token slip for the customer. Returns false if pop-up was blocked. */
export function printTokenSlip(opts: {
  tokenNumber: number;
  customerName: string;
  petName: string;
  billCode: string;
}): boolean {
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Token #${opts.tokenNumber}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      margin: 0;
      padding: 24px;
      max-width: 320px;
      margin: 0 auto;
    }
    .brand { text-align: center; font-size: 14px; font-weight: 700; color: #1e40af; margin-bottom: 4px; }
    .sub { text-align: center; font-size: 11px; color: #64748b; margin-bottom: 20px; }
    .token-box {
      border: 3px dashed #2563eb;
      border-radius: 12px;
      padding: 20px 16px;
      text-align: center;
      margin-bottom: 16px;
    }
    .token-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .token-num { font-size: 48px; font-weight: 800; color: #0f172a; line-height: 1.1; margin: 8px 0; }
    .row { font-size: 14px; margin: 8px 0; color: #334155; }
    .row strong { color: #0f172a; }
    .bill { font-size: 13px; color: #475569; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
    .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 20px; }
    @media print {
      body { padding: 16px; }
    }
  </style>
</head>
<body>
  <div class="brand">VetClinic Pro</div>
  <div class="sub">Queue token — please wait for your number</div>
  <div class="token-box">
    <div class="token-label">Your token</div>
    <div class="token-num">#${opts.tokenNumber}</div>
  </div>
  <div class="row"><strong>Customer:</strong> ${escapeHtml(opts.customerName)}</div>
  <div class="row"><strong>Pet:</strong> ${escapeHtml(opts.petName)}</div>
  <div class="bill"><strong>Bill ref:</strong> ${escapeHtml(opts.billCode)}</div>
  <div class="footer">${escapeHtml(dateStr)} · ${escapeHtml(timeStr)}</div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) {
    return false;
  }
  w.document.write(html);
  w.document.close();
  return true;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
