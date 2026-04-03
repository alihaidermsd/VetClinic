import { listTable } from '../database';
import type { DailyReport, RoomWiseReport, PaymentWiseReport, DoctorReport, PaymentMethod } from '@/types';
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

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;

  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const utc = d.toISOString().split('T')[0];
  return { local, utc };
}

function isIsoOnDay(value: unknown, targetDay: string): boolean {
  const parts = getYmdParts(value);
  if (!parts) return false;
  return parts.local === targetDay || parts.utc === targetDay;
}

function isIsoWithinRange(value: unknown, startDate: string, endDate: string): boolean {
  const parts = getYmdParts(value);
  if (!parts) return false;
  const { local, utc } = parts;
  const localOk = local >= startDate && local <= endDate;
  const utcOk = utc >= startDate && utc <= endDate;
  return localOk || utcOk;
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
        b.status === 'completed' && isDashboardCalendarDay(b.completed_at, clinicToday, utcToday)
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

function aggregatePaymentsByDay(day: string): PaymentWiseReport[] {
  const payments = (listTable('payments') as any[]).filter((p) => isIsoOnDay(p.created_at, day));
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

function aggregatePaymentsInRange(startDate: string, endDate: string): PaymentWiseReport[] {
  const payments = (listTable('payments') as any[]).filter((p) => {
    return isIsoWithinRange(p.created_at, startDate, endDate);
  });
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

// Get daily report (completed bills by bill created_at date — in-memory safe)
export function getDailyReport(date?: string): DailyReport {
  const targetDate = date || getClinicDateString();
  const bills = listTable('bills') as any[];
  const completed = bills.filter(
    (b) => normalizeStatus(b.status) === 'completed' && isIsoOnDay(b.created_at, targetDate)
  );

  const total_bills = completed.length;
  const total_revenue = completed.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
  const total_discount = completed.reduce((s, b) => s + (Number(b.discount_amount) || 0), 0);
  const net_revenue = completed.reduce((s, b) => s + (Number(b.final_amount) || 0), 0);

  const billIds = new Set(completed.map((b) => b.id));
  const room_wise = aggregateRoomWise(billIds);
  const payment_wise = aggregatePaymentsByDay(targetDate);

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
  const completed = bills.filter((b) => {
    if (normalizeStatus(b.status) !== 'completed') return false;
    return isIsoWithinRange(b.created_at, startDate, endDate);
  });

  const summary = {
    total_bills: completed.length,
    total_revenue: completed.reduce((s, b) => s + (Number(b.total_amount) || 0), 0),
    total_discount: completed.reduce((s, b) => s + (Number(b.discount_amount) || 0), 0),
    net_revenue: completed.reduce((s, b) => s + (Number(b.final_amount) || 0), 0),
  };

  const byDay = new Map<string, { bill_count: number; revenue: number }>();
  for (const b of completed) {
    const parts = getYmdParts(b.created_at);
    if (!parts) continue;
    // Prefer local day if it fits range; otherwise use UTC day.
    const key =
      parts.local >= startDate && parts.local <= endDate ? parts.local : parts.utc;
    const d = key;
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
  const payment_wise = aggregatePaymentsInRange(startDate, endDate);

  return {
    start_date: startDate,
    end_date: endDate,
    summary,
    daily_breakdown,
    room_wise,
    payment_wise,
  };
}

// Get doctor-wise report (consultation line items on completed bills)
export function getDoctorReport(startDate?: string, endDate?: string): DoctorReport[] {
  const bills = listTable('bills') as any[];
  const billById = Object.fromEntries(bills.map((b) => [b.id, b]));
  const items = listTable('bill_items') as any[];

  function billMatches(b: any): boolean {
    if (!b) return false;
    if (normalizeStatus(b.status) !== 'completed') return false;
    if (!startDate && !endDate) return true;
    if (startDate && endDate) return isIsoWithinRange(b.created_at, startDate, endDate);
    if (startDate && !endDate) return isIsoOnDay(b.created_at, startDate);
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
    if (normalizeStatus(b.status) !== 'completed') return false;
    if (!startDate && !endDate) return true;
    if (startDate && endDate) return isIsoWithinRange(b.created_at, startDate, endDate);
    if (startDate && !endDate) return isIsoOnDay(b.created_at, startDate);
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
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  
  return getDateRangeReport(startDate, endDate);
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
    'bill_items', 'inventory', 'medical_records', 'payments', 'audit_logs'
  ];
  
  const data: Record<string, any[]> = {};
  
  tables.forEach((table) => {
    data[table] = listTable(table);
  });
  
  return data;
}
