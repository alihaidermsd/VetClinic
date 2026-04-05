import { getBillWithDetails } from '@/lib/services/billingService';
import type { MedicalRecord } from '@/types';

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: unknown): string {
  if (iso == null) return '—';
  const raw = String(iso);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 16).replace('T', ' ');
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseXrayImages(raw: unknown): string[] {
  if (raw == null || raw === '') return [];
  try {
    const p = JSON.parse(String(raw));
    return Array.isArray(p) ? p.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function section(title: string, body: string | null | undefined): string {
  const t = String(body ?? '').trim();
  if (!t) return '';
  return `
    <div class="sec">
      <h3>${escapeHtml(title)}</h3>
      <div class="body">${escapeHtml(t).replace(/\n/g, '<br/>')}</div>
    </div>`;
}

/** Build printable HTML for one visit (bill + medical record + line items). */
export function buildPatientRecordHtml(billId: number): string | null {
  const d = getBillWithDetails(billId);
  if (!d) return null;

  const { bill, patient, animal, token, items, medicalRecords } = d;
  const mr = (medicalRecords?.[0] ?? null) as MedicalRecord | null;

  const lines =
    items?.map((it: any) => {
      return `<tr>
        <td>${escapeHtml(it.item_name)}</td>
        <td>${escapeHtml(String(it.room_name ?? ''))}</td>
        <td class="num">${it.quantity}</td>
        <td class="num">Rs. ${Number(it.total_price || 0).toLocaleString('en-IN')}</td>
      </tr>`;
    }).join('') || '';

  const labImgs = mr ? parseXrayImages(mr.laboratory_images) : [];
  const labImgBlocks =
    labImgs.length === 0
      ? ''
      : `<div class="sec"><h3>Lab images</h3><div class="img-row">${labImgs
          .map(
            (src) =>
              `<div class="img-wrap"><img src="${src.replace(/"/g, '&quot;')}" alt="Lab" /></div>`
          )
          .join('')}</div></div>`;

  const imgs = mr ? parseXrayImages(mr.xray_images) : [];
  const imgBlocks =
    imgs.length === 0
      ? ''
      : `<div class="sec"><h3>X-ray images</h3><div class="img-row">${imgs
          .map(
            (src) =>
              `<div class="img-wrap"><img src="${src.replace(/"/g, '&quot;')}" alt="X-ray" /></div>`
          )
          .join('')}</div></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Patient record — ${escapeHtml(bill.bill_code)}</title>
  <style>
    body { font-family: system-ui, Segoe UI, sans-serif; color: #0f172a; padding: 24px; max-width: 900px; margin: 0 auto; }
    h1 { font-size: 1.35rem; margin: 0 0 8px; }
    h2 { font-size: 1.05rem; margin: 20px 0 8px; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    h3 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin: 12px 0 6px; }
    .meta { font-size: 0.9rem; color: #475569; margin-bottom: 16px; }
    .sec .body { font-size: 0.95rem; line-height: 1.45; white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 8px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; font-weight: 600; }
    .num { text-align: right; }
    .img-row { display: flex; flex-wrap: wrap; gap: 12px; }
    .img-wrap { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; max-width: 220px; }
    .img-wrap img { width: 100%; height: auto; display: block; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <h1>Animal Care Hospital — Patient clinical record</h1>
  <p class="meta">
    <strong>Bill:</strong> ${escapeHtml(bill.bill_code)} &nbsp;|&nbsp;
    <strong>Date:</strong> ${formatDate(bill.created_at)} &nbsp;|&nbsp;
    <strong>Token:</strong> ${token?.token_number != null ? `#${token.token_number}` : '—'}
  </p>
  <p class="meta">
    <strong>Owner:</strong> ${escapeHtml(patient?.owner_name ?? '—')}
    (${escapeHtml(patient?.owner_phone ?? '—')})<br/>
    <strong>Patient:</strong> ${escapeHtml(animal?.name ?? '—')} — ${escapeHtml(String(animal?.type ?? ''))}
    ${animal?.breed ? `, ${escapeHtml(animal.breed)}` : ''}
  </p>

  <h2>General examination</h2>
  ${section('Symptoms', mr?.symptoms)}
  ${section('Diagnosis', mr?.diagnosis)}
  ${section('Treatment', mr?.treatment)}
  ${section('Notes', mr?.notes)}
  ${section('Follow-up date', mr?.follow_up_date)}

  <h2>Laboratory</h2>
  ${section('Lab / technical notes', mr?.laboratory_notes)}
  ${section('Doctor examination after laboratory', mr?.laboratory_examination)}
  ${labImgBlocks}

  <h2>X-Ray</h2>
  ${section('X-ray / operator notes', mr?.xray_notes)}
  ${section('Doctor examination / report', mr?.xray_examination)}
  ${imgBlocks}

  <h2>Surgery</h2>
  ${section('Surgery room / operative notes', mr?.surgery_notes)}
  ${section('Doctor surgical examination & case summary', mr?.surgery_examination)}

  <h2>Bill line items</h2>
  <table>
    <thead><tr><th>Item</th><th>Room</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
    <tbody>${lines || '<tr><td colspan="4">No line items</td></tr>'}</tbody>
  </table>
  <p style="margin-top:16px;font-size:0.95rem;">
    <strong>Patient total:</strong> Rs. ${Number(bill.final_amount || 0).toLocaleString('en-IN')}
    &nbsp;|&nbsp; <strong>Payment:</strong> ${escapeHtml(String(bill.payment_status ?? ''))}
  </p>
  <p style="margin-top:24px;font-size:0.8rem;color:#94a3b8;">Printed ${formatDate(new Date().toISOString())}</p>
</body>
</html>`;
}

export function printPatientRecord(billId: number): boolean {
  const html = buildPatientRecordHtml(billId);
  if (!html) return false;
  // Must not use `noopener` here: many browsers return `null` from window.open, so nothing prints.
  const htmlPrint = html.replace(
    '</body>',
    '<script>window.onload=function(){try{window.focus();window.print();}catch(e){}};<\/script></body>'
  );
  const w = window.open('', '_blank', 'width=900,height=800');
  if (!w) return false;
  w.document.write(htmlPrint);
  w.document.close();
  return true;
}

export function downloadPatientRecordHtml(billId: number): boolean {
  const html = buildPatientRecordHtml(billId);
  if (!html) return false;
  const d = getBillWithDetails(billId);
  const code = d?.bill?.bill_code ?? `bill-${billId}`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `patient-record-${String(code).replace(/\s+/g, '-')}.html`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
