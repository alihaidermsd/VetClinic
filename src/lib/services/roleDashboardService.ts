import { listTable } from '../database';
import type { UserRole } from '@/types';
import { getClinicDateString } from './tokenService';
import { getDashboardStats } from './reportService';
import { getAllUsers } from './userService';
import { getAllRooms } from './roomService';
import { getStaffHrSnapshot, type HrSnapshot } from './staffService';

export type ActivityTotals = {
  /** Line items or payment rows */
  count: number;
  totalAmount: number;
  /** Distinct bills touched */
  uniqueBills: number;
};

export type TopServiceRow = {
  name: string;
  count: number;
  amount: number;
};

export type RoleDashboardPayload =
  | {
      mode: 'bill_lines';
      headline: string;
      subtext: string;
      countLabel: string;
      day: ActivityTotals;
      week: ActivityTotals;
      month: ActivityTotals;
      topThisMonth: TopServiceRow[];
      hr: HrSnapshot;
    }
  | {
      mode: 'payments';
      headline: string;
      subtext: string;
      countLabel: string;
      day: ActivityTotals;
      week: ActivityTotals;
      month: ActivityTotals;
      hr: HrSnapshot;
    }
  | {
      mode: 'admin';
      headline: string;
      subtext: string;
      today_tokens: number;
      waiting_patients: number;
      low_stock_items: number;
      active_users: number;
      active_rooms: number;
      today_revenue_gross: number;
      today_salary_paid: number;
      today_net_income: number;
      month_salary_paid: number;
      selfHr: HrSnapshot;
    };

function getYmdParts(value: unknown): { local: string; utc: string } | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { local: raw, utc: raw };
  }

  if (/^\d+$/.test(raw)) {
    const num = Number(raw);
    if (!Number.isFinite(num)) return null;
    const ms = raw.length <= 10 ? num * 1000 : num;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const utc = d.toISOString().split('T')[0];
    return { local, utc };
  }

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

function inYmdRange(parts: { local: string; utc: string }, start: string, end: string): boolean {
  const localOk = parts.local >= start && parts.local <= end;
  const utcOk = parts.utc >= start && parts.utc <= end;
  return localOk || utcOk;
}

function createdInRange(iso: unknown, start: string, end: string): boolean {
  const parts = getYmdParts(iso);
  if (!parts) return false;
  return inYmdRange(parts, start, end);
}

function todayRange(): { start: string; end: string } {
  const t = getClinicDateString();
  return { start: t, end: t };
}

/** Monday → today (clinic local calendar). */
function weekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const start = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  return { start, end: getClinicDateString() };
}

function monthRange(): { start: string; end: string } {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  return { start, end: getClinicDateString() };
}

function aggregateBillLines(
  operatorId: number,
  itemTypes: Set<string>,
  start: string,
  end: string
): ActivityTotals {
  const items = listTable('bill_items') as any[];
  const billIds = new Set<number>();
  let count = 0;
  let totalAmount = 0;

  for (const bi of items) {
    if (Number(bi.operator_id) !== Number(operatorId)) continue;
    const t = String(bi.item_type ?? '').trim();
    if (!itemTypes.has(t)) continue;
    if (!createdInRange(bi.created_at, start, end)) continue;
    count += 1;
    totalAmount += Number(bi.total_price) || 0;
    billIds.add(Number(bi.bill_id));
  }

  return { count, totalAmount, uniqueBills: billIds.size };
}

function topBillLinesThisMonth(
  operatorId: number,
  itemTypes: Set<string>,
  start: string,
  end: string,
  limit: number
): TopServiceRow[] {
  const items = listTable('bill_items') as any[];
  const map = new Map<string, { count: number; amount: number }>();

  for (const bi of items) {
    if (Number(bi.operator_id) !== Number(operatorId)) continue;
    const t = String(bi.item_type ?? '').trim();
    if (!itemTypes.has(t)) continue;
    if (!createdInRange(bi.created_at, start, end)) continue;
    const name = String(bi.item_name ?? '—').trim() || '—';
    const cur = map.get(name) || { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Number(bi.total_price) || 0;
    map.set(name, cur);
  }

  return Array.from(map.entries())
    .map(([name, v]) => ({ name, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

function aggregatePayments(operatorId: number, start: string, end: string): ActivityTotals {
  const payments = listTable('payments') as any[];
  const billIds = new Set<number>();
  let count = 0;
  let totalAmount = 0;

  for (const p of payments) {
    if (Number(p.received_by) !== Number(operatorId)) continue;
    if (!createdInRange(p.created_at, start, end)) continue;
    count += 1;
    totalAmount += Number(p.amount) || 0;
    billIds.add(Number(p.bill_id));
  }

  return { count, totalAmount, uniqueBills: billIds.size };
}

function billLinesPayload(
  userId: number,
  itemTypes: string[],
  headline: string,
  subtext: string,
  countLabel: string
): RoleDashboardPayload {
  const types = new Set(itemTypes);
  const d = todayRange();
  const w = weekRange();
  const m = monthRange();

  return {
    mode: 'bill_lines',
    headline,
    subtext,
    countLabel,
    day: aggregateBillLines(userId, types, d.start, d.end),
    week: aggregateBillLines(userId, types, w.start, w.end),
    month: aggregateBillLines(userId, types, m.start, m.end),
    topThisMonth: topBillLinesThisMonth(userId, types, m.start, m.end, 8),
    hr: getStaffHrSnapshot(userId),
  };
}

function paymentsPayload(userId: number): RoleDashboardPayload {
  const d = todayRange();
  const w = weekRange();
  const m = monthRange();
  return {
    mode: 'payments',
    headline: 'Your collections',
    subtext:
      'Payments recorded under your login (daily, this week, and this month). Open Billing for more detail.',
    countLabel: 'Payments',
    day: aggregatePayments(userId, d.start, d.end),
    week: aggregatePayments(userId, w.start, w.end),
    month: aggregatePayments(userId, m.start, m.end),
    hr: getStaffHrSnapshot(userId),
  };
}

function adminPayload(userId: number): RoleDashboardPayload {
  const stats = getDashboardStats() as any;
  const users = getAllUsers().filter((u) => u.is_active);
  const rooms = getAllRooms().filter((r) => r.is_active);
  return {
    mode: 'admin',
    headline: 'Clinic overview',
    subtext:
      'Quick pulse of the practice. Only Reception sees the full front-desk dashboard with every widget.',
    today_tokens: stats.today_tokens,
    waiting_patients: stats.waiting_patients,
    low_stock_items: stats.low_stock_items,
    active_users: users.length,
    active_rooms: rooms.length,
    today_revenue_gross: Number(stats.today_revenue) || 0,
    today_salary_paid: Number(stats.today_salary_paid) || 0,
    today_net_income: Number(stats.today_net_income) || 0,
    month_salary_paid: Number(stats.month_salary_paid) || 0,
    selfHr: getStaffHrSnapshot(userId),
  };
}

/**
 * Personalized dashboard metrics for every role except Reception (main dashboard).
 * Uses bill line `created_at` (or payment `created_at`) in the clinic calendar.
 */
export function getRoleDashboardPayload(userId: number, role: UserRole): RoleDashboardPayload {
  switch (role) {
    case 'lab_operator':
      return billLinesPayload(
        userId,
        ['lab_test'],
        'Laboratory activity',
        'Tests and lab line items you added to bills — today, this week, and this month.',
        'Lab lines'
      );
    case 'xray_operator':
      return billLinesPayload(
        userId,
        ['xray'],
        'X-Ray activity',
        'Imaging line items you recorded on bills.',
        'X-ray lines'
      );
    case 'surgery_operator':
      return billLinesPayload(
        userId,
        ['surgery'],
        'Surgery activity',
        'Surgery charges you added to patient bills.',
        'Surgery lines'
      );
    case 'pharmacy':
      return billLinesPayload(
        userId,
        ['medicine'],
        'Pharmacy sales',
        'Medicine lines rung up under your account.',
        'Medicine lines'
      );
    case 'doctor':
      return billLinesPayload(
        userId,
        ['consultation', 'procedure'],
        'Clinical work you logged',
        'Consultations and procedures you added as the operator on bill lines.',
        'Clinical lines'
      );
    case 'accountant':
      return paymentsPayload(userId);
    case 'admin':
      return adminPayload(userId);
    default:
      return billLinesPayload(
        userId,
        [],
        'Your activity',
        'No specialized metrics for this role yet. Use the sections below to get started.',
        'Items'
      );
  }
}
