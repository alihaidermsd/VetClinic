import { query, getOne, run, listTable } from '../database';
import type {
  StaffAttendance,
  AttendanceStatus,
  SalaryPayment,
  SalaryPaymentMethod,
  User,
} from '@/types';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { getClinicDateString } from './tokenService';
import { getActiveUsers, getUserById } from './userService';

export function getAttendanceForUserAndDate(
  userId: number,
  workDate: string
): StaffAttendance | null {
  return getOne('SELECT * FROM staff_attendance WHERE user_id = ? AND work_date = ?', [
    userId,
    workDate,
  ]) as StaffAttendance | null;
}

export function getAttendanceForDate(workDate: string): StaffAttendance[] {
  return query('SELECT * FROM staff_attendance WHERE work_date = ? ORDER BY user_id', [
    workDate,
  ]) as StaffAttendance[];
}

export function upsertAttendance(input: {
  user_id: number;
  work_date: string;
  status: AttendanceStatus;
  check_in?: string | null;
  check_out?: string | null;
  notes?: string | null;
}): StaffAttendance {
  const existing = getAttendanceForUserAndDate(input.user_id, input.work_date);
  const ts = new Date().toISOString();
  if (existing) {
    run(
      'UPDATE staff_attendance SET status = ?, check_in = ?, check_out = ?, notes = ?, updated_at = ? WHERE id = ?',
      [
        input.status,
        input.check_in ?? null,
        input.check_out ?? null,
        input.notes ?? null,
        ts,
        existing.id,
      ]
    );
    return getOne('SELECT * FROM staff_attendance WHERE id = ?', [existing.id]) as StaffAttendance;
  }
  const result = run(
    'INSERT INTO staff_attendance (user_id, work_date, status, check_in, check_out, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      input.user_id,
      input.work_date,
      input.status,
      input.check_in ?? null,
      input.check_out ?? null,
      input.notes ?? null,
      ts,
      ts,
    ]
  );
  return getOne('SELECT * FROM staff_attendance WHERE id = ?', [
    result.lastInsertRowid,
  ]) as StaffAttendance;
}

/** Present = 1, half_day = 0.5 for rough payroll context */
export function countPresentUnitsInPeriod(
  userId: number,
  periodStart: string,
  periodEnd: string
): { present_units: number; rows: number } {
  const rows = (listTable('staff_attendance') as StaffAttendance[]).filter(
    (r) =>
      Number(r.user_id) === userId &&
      String(r.work_date) >= periodStart &&
      String(r.work_date) <= periodEnd
  );
  let units = 0;
  for (const r of rows) {
    if (r.status === 'present') units += 1;
    else if (r.status === 'half_day') units += 0.5;
  }
  return { present_units: units, rows: rows.length };
}

export function hasSalaryPaymentForPeriod(
  userId: number,
  periodStart: string,
  periodEnd: string
): SalaryPayment | null {
  return getOne(
    'SELECT * FROM salary_payments WHERE user_id = ? AND period_start = ? AND period_end = ?',
    [userId, periodStart, periodEnd]
  ) as SalaryPayment | null;
}

export function recordSalaryPayment(input: {
  user_id: number;
  period_start: string;
  period_end: string;
  amount: number;
  payment_method: SalaryPaymentMethod;
  notes?: string | null;
  recorded_by_user_id: number;
}): SalaryPayment {
  const dup = hasSalaryPaymentForPeriod(
    input.user_id,
    input.period_start,
    input.period_end
  );
  if (dup) {
    throw new Error('Salary for this person and period is already recorded');
  }
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error('Amount must be zero or positive');
  }
  const ts = new Date().toISOString();
  const result = run(
    'INSERT INTO salary_payments (user_id, period_start, period_end, amount, paid_at, payment_method, notes, recorded_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      input.user_id,
      input.period_start,
      input.period_end,
      input.amount,
      ts,
      input.payment_method,
      input.notes ?? null,
      input.recorded_by_user_id,
      ts,
    ]
  );
  return getOne('SELECT * FROM salary_payments WHERE id = ?', [
    result.lastInsertRowid,
  ]) as SalaryPayment;
}

export function getSalaryPaymentsForPeriod(
  periodStart: string,
  periodEnd: string
): SalaryPayment[] {
  return query(
    'SELECT * FROM salary_payments WHERE period_start = ? AND period_end = ? ORDER BY paid_at',
    [periodStart, periodEnd]
  ) as SalaryPayment[];
}

export function payAllUnpaidStaffForPeriod(
  periodStart: string,
  periodEnd: string,
  paymentMethod: SalaryPaymentMethod,
  recordedByUserId: number,
  amountByUserId?: Record<number, number>
): { paid: number; skipped: { userId: number; reason: string }[] } {
  const users = getActiveUsers() as User[];
  let paid = 0;
  const skipped: { userId: number; reason: string }[] = [];

  for (const u of users) {
    if (hasSalaryPaymentForPeriod(u.id, periodStart, periodEnd)) {
      skipped.push({ userId: u.id, reason: 'Already paid' });
      continue;
    }
    const raw =
      amountByUserId?.[u.id] ?? Number(u.monthly_salary ?? 0);
    const amount = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    try {
      recordSalaryPayment({
        user_id: u.id,
        period_start: periodStart,
        period_end: periodEnd,
        amount,
        payment_method: paymentMethod,
        recorded_by_user_id: recordedByUserId,
      });
      paid++;
    } catch (e) {
      skipped.push({
        userId: u.id,
        reason: e instanceof Error ? e.message : 'Failed',
      });
    }
  }

  return { paid, skipped };
}

export type HrSnapshotTodayAttendance = AttendanceStatus | 'unmarked';

export interface HrSnapshot {
  todayDate: string;
  todayAttendance: HrSnapshotTodayAttendance;
  presentUnitsThisMonth: number;
  monthLabel: string;
  monthlySalary: number;
  salaryPaidThisMonth: boolean;
  salaryPaidAmountThisMonth: number;
}

/** For role dashboards: this user's attendance today + payroll status for the clinic calendar month. */
export function getStaffHrSnapshot(userId: number): HrSnapshot {
  const today = getClinicDateString();
  const att = getAttendanceForUserAndDate(userId, today);
  const todayAttendance: HrSnapshotTodayAttendance = att?.status ?? 'unmarked';

  const ref = new Date(`${today}T12:00:00`);
  const periodStart = format(startOfMonth(ref), 'yyyy-MM-dd');
  const periodEnd = format(endOfMonth(ref), 'yyyy-MM-dd');
  const { present_units } = countPresentUnitsInPeriod(userId, periodStart, periodEnd);

  const user = getUserById(userId);
  const monthlySalary = Number(user?.monthly_salary ?? 0);
  const paidRow = hasSalaryPaymentForPeriod(userId, periodStart, periodEnd);

  return {
    todayDate: today,
    todayAttendance,
    presentUnitsThisMonth: present_units,
    monthLabel: format(ref, 'MMMM yyyy'),
    monthlySalary,
    salaryPaidThisMonth: !!paidRow,
    salaryPaidAmountThisMonth: paidRow ? Number(paidRow.amount) || 0 : 0,
  };
}
