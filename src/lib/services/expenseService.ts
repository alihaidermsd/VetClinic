import { getOne, listTable, run } from '../database';
import type { ExpenseCategory, ExpensePaymentMethod, ExpenseRecord } from '@/types';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  daily: 'Daily / general',
  rent: 'Rent',
  fuel: 'Fuel',
  utilities: 'Utilities',
  supplies: 'Supplies',
  salary: 'Salary / wages (manual)',
  other: 'Other',
};

export function expenseCategoryLabel(c: ExpenseCategory): string {
  return CATEGORY_LABELS[c] ?? c;
}

export function listExpenseCategories(): { value: ExpenseCategory; label: string }[] {
  return (Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((value) => ({
    value,
    label: CATEGORY_LABELS[value],
  }));
}

function normalizeCategory(raw: unknown): ExpenseCategory {
  const s = String(raw ?? '').toLowerCase();
  if (s in CATEGORY_LABELS) return s as ExpenseCategory;
  return 'other';
}

function normalizePaymentMethod(raw: unknown): ExpensePaymentMethod {
  const s = String(raw ?? 'cash').toLowerCase();
  if (s === 'cash' || s === 'card' || s === 'online' || s === 'bank' || s === 'other') return s;
  return 'cash';
}

/** Parse datetime-local or ISO to ISO string. */
export function normalizePaidAt(input: string): string {
  const t = String(input || '').trim();
  if (!t) return new Date().toISOString();
  if (t.includes('T') && !t.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function listExpenses(): ExpenseRecord[] {
  const rows = listTable('expenses') as ExpenseRecord[];
  return rows
    .slice()
    .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));
}

export function addExpense(input: {
  category: ExpenseCategory;
  title: string;
  amount: number;
  paid_at: string;
  payment_method: ExpensePaymentMethod;
  notes?: string | null;
  recorded_by_user_id?: number | null;
}): ExpenseRecord {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Amount must be zero or positive');
  }
  const title = String(input.title ?? '').trim() || 'Expense';
  const ts = new Date().toISOString();
  const paidAt = normalizePaidAt(input.paid_at);
  const result = run(
    'INSERT INTO expenses (category, title, amount, paid_at, payment_method, notes, recorded_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      normalizeCategory(input.category),
      title,
      roundMoney(amount),
      paidAt,
      normalizePaymentMethod(input.payment_method),
      input.notes ?? null,
      input.recorded_by_user_id ?? null,
      ts,
      ts,
    ]
  );
  return getOne('SELECT * FROM expenses WHERE id = ?', [result.lastInsertRowid]) as ExpenseRecord;
}

export function updateExpense(
  id: number,
  input: {
    category: ExpenseCategory;
    title: string;
    amount: number;
    paid_at: string;
    payment_method: ExpensePaymentMethod;
    notes?: string | null;
  }
): ExpenseRecord | null {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Amount must be zero or positive');
  }
  const title = String(input.title ?? '').trim() || 'Expense';
  const paidAt = normalizePaidAt(input.paid_at);
  const ts = new Date().toISOString();
  run(
    'UPDATE expenses SET category = ?, title = ?, amount = ?, paid_at = ?, payment_method = ?, notes = ?, updated_at = ? WHERE id = ?',
    [
      normalizeCategory(input.category),
      title,
      roundMoney(amount),
      paidAt,
      normalizePaymentMethod(input.payment_method),
      input.notes ?? null,
      ts,
      id,
    ]
  );
  return getOne('SELECT * FROM expenses WHERE id = ?', [id]) as ExpenseRecord | null;
}

export function deleteExpense(id: number): boolean {
  const r = run('DELETE FROM expenses WHERE id = ?', [id]);
  return r.changes > 0;
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
