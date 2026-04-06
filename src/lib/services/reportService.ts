import { listTable } from '../database';
import type {
  DailyReport,
  RoomWiseReport,
  PaymentWiseReport,
  DoctorReport,
  PaymentMethod,
  BillReportRow,
  MonthlyDebitCreditReport,
  MonthlyDebitCreditCreditLine,
  MonthlyDebitCreditDebitLine,
  MonthlyDebitCreditExpenseLine,
  ExpenseCategory,
} from '@/types';
import { expenseCategoryLabel } from './expenseService';
import { getClinicDateString, isTokenFromToday } from './tokenService';

function datePart(iso: string | undefined | null): string | null {
  if (!iso || typeof iso !== 'string') return null;
  return iso.split('T')[0] ?? null;
}

function isDashboardCalendarDay(iso: string | undefined | null, clinicToday: string, utcToday: string): boolean {
  const d = datePart(iso);
  return d !== null && (d === clinicToday || d === utcToday);
}

function normalizeStatus(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** True if ISO timestamp falls on any calendar day within [start, end] (local or UTC day). */
function isIsoInClosedRange(iso: string | undefined | null, start: string, end: string): boolean {
  const parts = getYmdParts(iso);
  if (!parts) return false;
  return (
    (parts.local >= start && parts.local <= end) || (parts.utc >= start && parts.utc <= end)
  );
}

/**
 * Bills that should appear in revenue reports: completed, or fully paid (even if staff has not
 * pressed "Complete bill" yet). Cancelled bills are excluded.
 */
function isReportableClosedBill(b: { status?: unknown; payment_status?: unknown } | null | undefined): boolean {
  if (!b) return false;
  if (normalizeStatus(b.status) === 'cancelled') return false;
  const st = normalizeStatus(b.status);
  const pay = normalizeStatus(b.payment_status);
  return st === 'completed' || pay === 'paid';
}

function getYmdParts(value: unknown): { local: string; utc: string } | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Already in YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { local: raw, utc: raw };
  }

  // Epoch millis / seconds
  if (/^\d+$/.test(raw)) {
    const num = Number(raw);
    if (!Number.isFinite(num)) return null;
    // Heuristic: if seconds (10 digits), convert to millis
    const ms = raw.length <= 10 ? num * 1000 : num;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const utc = d.toISOString().split('T')[0];
    return { local, utc };
  }

  // "YYYY-MM-DD HH:MM:SS" (legacy SQL) — normalize so Date() parses reliably
  const sqlDt = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (sqlDt) {
    const d = new Date(`${sqlDt[1]}T${sqlDt[2]}`);
    if (!Number.isNaN(d.getTime())) {
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const utc = d.toISOString().split('T')[0];
      return { local, utc };
    }
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;

  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const utc = d.toISOString().split('T')[0];
  return { local, utc };
}

/** Date used for revenue reporting: completion time when set, otherwise bill creation. */
function billAccountingParts(b: any): { local: string; utc: string } | null {
  const ts = b.completed_at || b.created_at;
  return getYmdParts(ts);
}

function isCompletedBillOnDay(b: any, targetDay: string): boolean {
  if (!isReportableClosedBill(b)) return false;
  const parts = billAccountingParts(b);
  if (!parts) return false;
  return parts.local === targetDay || parts.utc === targetDay;
}

function isCompletedBillInRange(b: any, startDate: string, endDate: string): boolean {
  if (!isReportableClosedBill(b)) return false;
  const parts = billAccountingParts(b);
  if (!parts) return false;
  const localOk = parts.local >= startDate && parts.local <= endDate;
  const utcOk = parts.utc >= startDate && parts.utc <= endDate;
  return localOk || utcOk;
}

function aggregatePaymentsForBillSet(billIds: Set<number>): PaymentWiseReport[] {
  const payments = (listTable('payments') as any[]).filter((p) => billIds.has(p.bill_id));
  const m = new Map<string, { total_amount: number; count: number }>();
  for (const p of payments) {
    const method = String(p.payment_method || 'cash');
    const cur = m.get(method) || { total_amount: 0, count: 0 };
    cur.total_amount += Number(p.amount) || 0;
    cur.count += 1;
    m.set(method, cur);
  }
  return Array.from(m.entries()).map(([payment_method, v]) => ({
    payment_method: payment_method as PaymentMethod,
    total_amount: v.total_amount,
    count: v.count,
  }));
}

function enrichBillReportRows(bills: any[]): BillReportRow[] {
  const patients = Object.fromEntries(listTable('patients').map((p: any) => [p.id, p]));
  const animals = Object.fromEntries(listTable('animals').map((a: any) => [a.id, a]));
  return bills
    .slice()
    .sort((a, b) =>
      String(b.completed_at || b.created_at || '').localeCompare(String(a.completed_at || a.created_at || ''))
    )
    .map(
      (b): BillReportRow => ({
        id: b.id,
        bill_code: String(b.bill_code ?? ''),
        created_at: String(b.created_at ?? ''),
        completed_at: b.completed_at ? String(b.completed_at) : undefined,
        total_amount: Number(b.total_amount) || 0,
        discount_amount: Number(b.discount_amount) || 0,
        final_amount: Number(b.final_amount) || 0,
        paid_amount: Number(b.paid_amount) || 0,
        payment_status: String(b.payment_status ?? ''),
        payment_method: b.payment_method ? String(b.payment_method) : undefined,
        owner_name: String(patients[b.patient_id]?.owner_name ?? '—'),
        animal_name: String(animals[b.animal_id]?.name ?? '—'),
      })
    );
}

/** Collections today (payments), else completed bill totals finished today — matches clinic or UTC calendar day. */
function computeTodayRevenue(
  clinicToday: string,
  utcToday: string,
  bills: any[],
  payments: any[]
): number {
  const paySum = payments
    .filter((p) => isDashboardCalendarDay(p.created_at, clinicToday, utcToday))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  if (paySum > 0) return paySum;
  return bills
    .filter(
      (b) =>
        isReportableClosedBill(b) &&
        isDashboardCalendarDay(b.completed_at || b.created_at, clinicToday, utcToday)
    )
    .reduce((s, b) => s + (Number(b.final_amount) || 0), 0);
}

// Get dashboard statistics
export function getDashboardStats() {
  const clinicToday = getClinicDateString();
  const utcToday = new Date().toISOString().split('T')[0];

  const allTokens = listTable('tokens');
  const tokensToday = allTokens.filter((t) => isTokenFromToday(t));

  const today_tokens = tokensToday.length;
  // Make dashboard robust to any legacy/casing differences in `token.status`.
  // "Waiting Patients" = everything that is NOT completed (and not cancelled).
  const waiting_patients = tokensToday.filter((t) => {
    const s = String(t.status ?? '').trim().toLowerCase();
    return s !== 'completed' && s !== 'cancelled';
  }).length;

  // Keep the same meaning for "pending tokens" in the in-app stats.
  const pending_tokens = waiting_patients;

  const bills = listTable('bills');
  const payments = listTable('payments');
  const today_revenue = computeTodayRevenue(clinicToday, utcToday, bills, payments);

  const salaryRows = listTable('salary_payments') as any[];
  const today_salary_paid = salaryRows
    .filter((p) => isDashboardCalendarDay(p.paid_at, clinicToday, utcToday))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const expenseRows = listTable('expenses') as any[];
  const today_expenses_paid = expenseRows
    .filter((e) => isDashboardCalendarDay(e.paid_at, clinicToday, utcToday))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const today_net_income = today_revenue - today_salary_paid - today_expenses_paid;

  const ym = clinicToday.slice(0, 7);
  const monthStart = `${ym}-01`;
  const [cy, cm] = ym.split('-').map((v) => parseInt(v, 10));
  const lastDom = new Date(cy, cm, 0).getDate();
  const monthEnd = `${ym}-${String(lastDom).padStart(2, '0')}`;
  const month_salary_paid = salaryRows.reduce((s, p) => {
    const parts = getYmdParts(p.paid_at);
    if (!parts) return s;
    const hit =
      (parts.local >= monthStart && parts.local <= monthEnd) ||
      (parts.utc >= monthStart && parts.utc <= monthEnd);
    return hit ? s + (Number(p.amount) || 0) : s;
  }, 0);

  const month_expenses_paid = expenseRows.reduce((s, e) => {
    const parts = getYmdParts(e.paid_at);
    if (!parts) return s;
    const hit =
      (parts.local >= monthStart && parts.local <= monthEnd) ||
      (parts.utc >= monthStart && parts.utc <= monthEnd);
    return hit ? s + (Number(e.amount) || 0) : s;
  }, 0);

  const inventoryRows = listTable('inventory');
  const low_stock_items = inventoryRows.filter(
    (row) =>
      (row.is_active === 1 || row.is_active === true) &&
      (Number(row.stock_quantity) || 0) <= (Number(row.min_stock_level) || 0)
  ).length;

  const patientsById = Object.fromEntries(
    listTable('patients').map((p: any) => [p.id, p])
  );
  const animalsById = Object.fromEntries(
    listTable('animals').map((a: any) => [a.id, a])
  );

  const recent_bills = bills
    .filter((b) => isDashboardCalendarDay(b.created_at, clinicToday, utcToday))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 10)
    .map((b) => ({
      ...b,
      owner_name: patientsById[b.patient_id]?.owner_name,
      animal_name: animalsById[b.animal_id]?.name,
    }));

  const rooms = listTable('rooms').filter((r) => r.is_active === 1);
  const room_stats = rooms.map((room: any) => ({
    room_name: room.name,
    token_count: tokensToday.filter((t) => t.room_id === room.id).length,
  }));

  return {
    today_tokens,
    today_revenue,
    today_salary_paid,
    today_expenses_paid,
    today_net_income,
    month_salary_paid,
    month_expenses_paid,
    pending_tokens,
    low_stock_items,
    waiting_patients,
    recent_bills,
    room_stats,
  };
}

function aggregateRoomWise(billIds: Set<number>): RoomWiseReport[] {
  const items = (listTable('bill_items') as any[]).filter((bi) => billIds.has(bi.bill_id));
  const roomMap = new Map<string, RoomWiseReport>();
  for (const bi of items) {
    const key = `${bi.room_id}__${bi.room_name || ''}`;
    const prev = roomMap.get(key) || {
      room_id: Number(bi.room_id) || 0,
      room_name: bi.room_name || '—',
      total_charges: 0,
      item_count: 0,
    };
    prev.total_charges += Number(bi.total_price) || 0;
    prev.item_count += 1;
    roomMap.set(key, prev);
  }
  return Array.from(roomMap.values());
}

// Get daily report (completed bills attributed to calendar day of completion, else creation)
export function getDailyReport(date?: string): DailyReport {
  const targetDate = date || getClinicDateString();
  const bills = listTable('bills') as any[];
  const completed = bills.filter((b) => isCompletedBillOnDay(b, targetDate));

  const total_bills = completed.length;
  const total_revenue = completed.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
  const total_discount = completed.reduce((s, b) => s + (Number(b.discount_amount) || 0), 0);
  const net_revenue = completed.reduce((s, b) => s + (Number(b.final_amount) || 0), 0);

  const billIds = new Set(completed.map((b) => b.id));
  const room_wise = aggregateRoomWise(billIds);
  const payment_wise = aggregatePaymentsForBillSet(billIds);

  return {
    date: targetDate,
    total_bills,
    total_revenue,
    total_discount,
    net_revenue,
    room_wise,
    payment_wise,
  };
}

// Get date range report
export function getDateRangeReport(startDate: string, endDate: string) {
  const bills = listTable('bills') as any[];
  const completed = bills.filter((b) => isCompletedBillInRange(b, startDate, endDate));

  const summary = {
    total_bills: completed.length,
    total_revenue: completed.reduce((s, b) => s + (Number(b.total_amount) || 0), 0),
    total_discount: completed.reduce((s, b) => s + (Number(b.discount_amount) || 0), 0),
    net_revenue: completed.reduce((s, b) => s + (Number(b.final_amount) || 0), 0),
  };

  const byDay = new Map<string, { bill_count: number; revenue: number }>();
  for (const b of completed) {
    const parts = billAccountingParts(b);
    if (!parts) continue;
    let d: string | null = null;
    if (parts.local >= startDate && parts.local <= endDate) d = parts.local;
    else if (parts.utc >= startDate && parts.utc <= endDate) d = parts.utc;
    if (!d) continue;
    const cur = byDay.get(d) || { bill_count: 0, revenue: 0 };
    cur.bill_count += 1;
    cur.revenue += Number(b.final_amount) || 0;
    byDay.set(d, cur);
  }
  const daily_breakdown = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, bill_count: v.bill_count, revenue: v.revenue }));

  const billIds = new Set(completed.map((b) => b.id));
  const room_wise = aggregateRoomWise(billIds);
  const payment_wise = aggregatePaymentsForBillSet(billIds);

  return {
    start_date: startDate,
    end_date: endDate,
    summary,
    daily_breakdown,
    room_wise,
    payment_wise,
  };
}

export function getBillLedgerForDay(date: string): BillReportRow[] {
  const bills = listTable('bills') as any[];
  const completed = bills.filter((b) => isCompletedBillOnDay(b, date));
  return enrichBillReportRows(completed);
}

export function getBillLedgerForRange(startDate: string, endDate: string): BillReportRow[] {
  const bills = listTable('bills') as any[];
  const completed = bills.filter((b) => isCompletedBillInRange(b, startDate, endDate));
  return enrichBillReportRows(completed);
}

export function getAllTimeCompletedSummary() {
  const bills = (listTable('bills') as any[]).filter((b) => isReportableClosedBill(b));
  const billIds = new Set(bills.map((b) => b.id));
  const payments = (listTable('payments') as any[]).filter((p) => billIds.has(p.bill_id));
  const total_payments_recorded = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return {
    total_bills: bills.length,
    total_revenue: bills.reduce((s, b) => s + (Number(b.total_amount) || 0), 0),
    total_discount: bills.reduce((s, b) => s + (Number(b.discount_amount) || 0), 0),
    net_revenue: bills.reduce((s, b) => s + (Number(b.final_amount) || 0), 0),
    total_payments_recorded,
  };
}

/** From first of current month through today (clinic calendar). */
export function getMonthToDateReport() {
  const today = getClinicDateString();
  const [y, m] = today.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  return getDateRangeReport(start, today);
}

// Get doctor-wise report (consultation line items on completed bills)
export function getDoctorReport(startDate?: string, endDate?: string): DoctorReport[] {
  const bills = listTable('bills') as any[];
  const billById = Object.fromEntries(bills.map((b) => [b.id, b]));
  const items = listTable('bill_items') as any[];

  function billMatches(b: any): boolean {
    if (!b) return false;
    if (!isReportableClosedBill(b)) return false;
    if (!startDate && !endDate) return true;
    if (startDate && endDate) return isCompletedBillInRange(b, startDate, endDate);
    if (startDate && !endDate) return isCompletedBillOnDay(b, startDate);
    return true;
  }

  const docMap = new Map<
    string,
    { doctor_id: number; doctor_name: string; billIds: Set<number>; total_charges: number }
  >();

  for (const bi of items) {
    if (bi.item_type !== 'consultation') continue;
    const b = billById[bi.bill_id];
    if (!billMatches(b)) continue;
    const key = `${bi.operator_id}__${bi.operator_name || ''}`;
    let row = docMap.get(key);
    if (!row) {
      row = {
        doctor_id: Number(bi.operator_id) || 0,
        doctor_name: String(bi.operator_name || '—'),
        billIds: new Set<number>(),
        total_charges: 0,
      };
      docMap.set(key, row);
    }
    row.billIds.add(bi.bill_id);
    row.total_charges += Number(bi.total_price) || 0;
  }

  return Array.from(docMap.values())
    .map((v) => ({
      doctor_id: v.doctor_id,
      doctor_name: v.doctor_name,
      total_patients: v.billIds.size,
      total_charges: v.total_charges,
    }))
    .sort((a, b) => b.total_charges - a.total_charges);
}

// Get medicine sales report
export function getMedicineSalesReport(startDate?: string, endDate?: string) {
  const bills = listTable('bills') as any[];
  const billById = Object.fromEntries(bills.map((b) => [b.id, b]));
  const items = listTable('bill_items') as any[];

  function billMatches(b: any): boolean {
    if (!b) return false;
    if (!isReportableClosedBill(b)) return false;
    if (!startDate && !endDate) return true;
    if (startDate && endDate) return isCompletedBillInRange(b, startDate, endDate);
    if (startDate && !endDate) return isCompletedBillOnDay(b, startDate);
    return true;
  }

  const itemWiseMap = new Map<string, { total_quantity: number; total_revenue: number }>();
  let total_sales = 0;
  let total_revenue = 0;

  for (const bi of items) {
    if (bi.item_type !== 'medicine') continue;
    const b = billById[bi.bill_id];
    if (!billMatches(b)) continue;
    total_sales += 1;
    const rev = Number(bi.total_price) || 0;
    total_revenue += rev;
    const name = String(bi.item_name || '—');
    const cur = itemWiseMap.get(name) || { total_quantity: 0, total_revenue: 0 };
    cur.total_quantity += Number(bi.quantity) || 0;
    cur.total_revenue += rev;
    itemWiseMap.set(name, cur);
  }

  const item_wise = Array.from(itemWiseMap.entries())
    .map(([item_name, v]) => ({
      item_name,
      total_quantity: v.total_quantity,
      total_revenue: v.total_revenue,
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue);

  return {
    summary: { total_sales, total_revenue },
    item_wise,
  };
}

// Get monthly report
export function getMonthlyReport(year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return getDateRangeReport(startDate, endDate);
}

/**
 * Monthly credit (cash in) vs debit (cash out).
 * - Credit: sum of `payments.amount` dated in the month, only where the linked bill is not cancelled.
 * - Debit: sum of `salary_payments.amount` with `paid_at` in the month, plus `expenses.amount` with `paid_at` in the month.
 * - Net billed: closed-bill revenue for the month (same attribution as Period report).
 */
export function getMonthlyDebitCreditReport(year: number, month: number): MonthlyDebitCreditReport {
  const range_start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const range_end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const month_label = new Date(year, month - 1, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  const bills = listTable('bills') as any[];
  const billById = Object.fromEntries(bills.map((b) => [b.id, b]));

  const payments = listTable('payments') as any[];
  const creditLinesRaw: MonthlyDebitCreditCreditLine[] = [];

  for (const p of payments) {
    const bill = billById[p.bill_id];
    if (!bill) continue;
    if (normalizeStatus(bill.status) === 'cancelled') continue;
    if (!isIsoInClosedRange(p.created_at, range_start, range_end)) continue;

    creditLinesRaw.push({
      id: Number(p.id),
      bill_id: Number(p.bill_id),
      bill_code: String(bill.bill_code ?? '—'),
      amount: roundMoney(Number(p.amount) || 0),
      payment_method: String(p.payment_method ?? 'cash'),
      received_at: String(p.created_at ?? ''),
      received_by_name: String(p.received_by_name ?? '—'),
      transaction_id: p.transaction_id ?? null,
      notes: p.notes ?? null,
    });
  }

  creditLinesRaw.sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));

  const methodMap = new Map<string, { total_amount: number; count: number }>();
  let credit_total = 0;
  for (const row of creditLinesRaw) {
    credit_total += row.amount;
    const m = String(row.payment_method || 'cash');
    const cur = methodMap.get(m) || { total_amount: 0, count: 0 };
    cur.total_amount = roundMoney(cur.total_amount + row.amount);
    cur.count += 1;
    methodMap.set(m, cur);
  }
  credit_total = roundMoney(credit_total);

  const credit_by_method = Array.from(methodMap.entries())
    .map(([payment_method, v]) => ({
      payment_method,
      total_amount: roundMoney(v.total_amount),
      count: v.count,
    }))
    .sort((a, b) => b.total_amount - a.total_amount);

  const users = listTable('users') as any[];
  const userById = Object.fromEntries(users.map((u) => [u.id, u]));

  const salaryRows = listTable('salary_payments') as any[];
  const debit_lines: MonthlyDebitCreditDebitLine[] = [];

  for (const sp of salaryRows) {
    if (!isIsoInClosedRange(sp.paid_at, range_start, range_end)) continue;
    const u = userById[sp.user_id];
    debit_lines.push({
      id: Number(sp.id),
      user_id: Number(sp.user_id),
      staff_name: String(u?.name ?? `User #${sp.user_id}`),
      amount: roundMoney(Number(sp.amount) || 0),
      paid_at: String(sp.paid_at ?? ''),
      period_start: String(sp.period_start ?? ''),
      period_end: String(sp.period_end ?? ''),
      payment_method: String(sp.payment_method ?? 'cash'),
      notes: sp.notes ?? null,
    });
  }

  debit_lines.sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));

  const salary_debit_total = roundMoney(debit_lines.reduce((s, r) => s + r.amount, 0));

  const expenseRowsRaw = listTable('expenses') as any[];
  const expense_lines: MonthlyDebitCreditExpenseLine[] = [];
  const validCats: ExpenseCategory[] = [
    'daily',
    'rent',
    'fuel',
    'utilities',
    'supplies',
    'salary',
    'other',
  ];
  for (const ex of expenseRowsRaw) {
    if (!isIsoInClosedRange(ex.paid_at, range_start, range_end)) continue;
    const rawCat = String(ex.category ?? 'other').toLowerCase();
    const cat = (validCats.includes(rawCat as ExpenseCategory) ? rawCat : 'other') as ExpenseCategory;
    expense_lines.push({
      id: Number(ex.id),
      category: cat,
      category_label: expenseCategoryLabel(cat),
      title: String(ex.title ?? '—'),
      amount: roundMoney(Number(ex.amount) || 0),
      paid_at: String(ex.paid_at ?? ''),
      payment_method: String(ex.payment_method ?? 'cash'),
      notes: ex.notes ?? null,
    });
  }
  expense_lines.sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));

  const expense_debit_total = roundMoney(expense_lines.reduce((s, r) => s + r.amount, 0));
  const debit_total = roundMoney(salary_debit_total + expense_debit_total);

  const rangeSummary = getDateRangeReport(range_start, range_end).summary;
  const net_billed_closed_bills = roundMoney(Number(rangeSummary.net_revenue) || 0);

  return {
    year,
    month,
    month_label,
    range_start,
    range_end,
    credit_total,
    credit_payment_count: creditLinesRaw.length,
    credit_by_method,
    credit_lines: creditLinesRaw,
    salary_debit_total,
    salary_payout_count: debit_lines.length,
    debit_lines,
    expense_debit_total,
    expense_entry_count: expense_lines.length,
    expense_lines,
    debit_total,
    debit_payment_count: debit_lines.length + expense_lines.length,
    net_billed_closed_bills,
    net_position: roundMoney(credit_total - debit_total),
  };
}

// Get yearly report
export function getYearlyReport(year: number) {
  const monthlyData = [];
  
  for (let month = 1; month <= 12; month++) {
    const report = getMonthlyReport(year, month);
    monthlyData.push({
      month,
      month_name: new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' }),
      ...report.summary,
    });
  }
  
  const yearlySummary = monthlyData.reduce(
    (acc, curr) => ({
      total_bills: acc.total_bills + curr.total_bills,
      total_revenue: acc.total_revenue + curr.total_revenue,
      total_discount: acc.total_discount + curr.total_discount,
      net_revenue: acc.net_revenue + curr.net_revenue,
    }),
    { total_bills: 0, total_revenue: 0, total_discount: 0, net_revenue: 0 }
  );
  
  return {
    year,
    summary: yearlySummary,
    monthly_breakdown: monthlyData,
  };
}

// Export data for backup
export function exportAllData() {
  const tables = [
    'users', 'rooms', 'patients', 'animals', 'tokens', 'bills',
    'bill_items', 'inventory', 'medical_records', 'payments', 'audit_logs', 'salary_payments', 'expenses',
  ];
  
  const data: Record<string, any[]> = {};
  
  tables.forEach((table) => {
    data[table] = listTable(table);
  });
  
  return data;
}
