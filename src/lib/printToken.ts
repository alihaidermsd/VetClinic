import { brandLogoUrl } from '@/lib/brandLogoUrl';

/** Opens a small window and prints a queue token slip for the customer. Returns false if pop-up was blocked. */
export function printTokenSlip(opts: {
  tokenNumber: number;
  customerName: string;
  petName: string;
  billCode: string;
  /** e.g. "Direct — Laboratory" when reception sends patient straight to a department */
  visitNote?: string;
}): boolean {
  const logoUrl = brandLogoUrl();
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
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 0;
      color: #0f172a;
      background: #fff;
    }
    .slip {
      width: 80mm;
      max-width: 320px;
      margin: 0 auto;
      padding: 12px 10px 14px;
    }
    .logo-wrap {
      text-align: center;
      margin-bottom: 6px;
    }
    .logo-wrap img {
      max-height: 72px;
      width: auto;
      display: inline-block;
      vertical-align: middle;
    }
    .brand {
      text-align: center;
      font-size: 13px;
      font-weight: 800;
      color: #1e3a8a;
      line-height: 1.2;
      margin-bottom: 2px;
      letter-spacing: 0.02em;
    }
    .sub {
      text-align: center;
      font-size: 10px;
      color: #64748b;
      margin: 0 auto 10px;
      line-height: 1.35;
      max-width: 95%;
    }
    .token-box {
      border: 2px dashed #2563eb;
      border-radius: 10px;
      padding: 12px 10px;
      text-align: center;
      margin-bottom: 10px;
      background: #f8fbff;
    }
    .token-label {
      font-size: 10px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      margin-bottom: 2px;
    }
    .token-num {
      font-size: 42px;
      font-weight: 900;
      color: #0f172a;
      line-height: 1;
      margin: 2px 0 0;
      letter-spacing: 0.01em;
    }
    .meta {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px;
      background: #fff;
    }
    .row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin: 5px 0;
      font-size: 12px;
      color: #334155;
      line-height: 1.3;
    }
    .row .k {
      color: #64748b;
      flex-shrink: 0;
      min-width: 62px;
    }
    .row .v {
      color: #0f172a;
      font-weight: 600;
      text-align: right;
      word-break: break-word;
    }
    .bill {
      font-size: 12px;
      color: #334155;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #cbd5e1;
    }
    .footer {
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
      margin-top: 10px;
      border-top: 1px solid #f1f5f9;
      padding-top: 8px;
      line-height: 1.35;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .slip { width: 80mm; max-width: 80mm; margin: 0 auto; padding: 10px 8px 12px; }
      .token-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="slip">
    <div class="logo-wrap"><img src="${escapeHtml(logoUrl)}" alt="Animal Care Hospital" /></div>
    <div class="brand">Animal Care Hospital</div>
    <div class="sub">${
      opts.visitNote
        ? `${escapeHtml(opts.visitNote)}<br/><span style="opacity:.9">Please wait to be called at that counter.</span>`
        : 'Queue token - please wait for your number'
    }</div>
    <div class="token-box">
      <div class="token-label">Your token</div>
      <div class="token-num">#${opts.tokenNumber}</div>
    </div>
    <div class="meta">
      <div class="row"><span class="k">Customer</span><span class="v">${escapeHtml(opts.customerName)}</span></div>
      <div class="row"><span class="k">Pet</span><span class="v">${escapeHtml(opts.petName)}</span></div>
      <div class="row bill"><span class="k">Bill ref</span><span class="v">${escapeHtml(opts.billCode)}</span></div>
    </div>
    <div class="footer">Print date: ${escapeHtml(dateStr)}<br/>Print time: ${escapeHtml(timeStr)}</div>
  </div>
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
