import { useState, useEffect, useCallback, useMemo } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Receipt, Plus, Pencil, Trash2, Info, Save } from 'lucide-react';
import type { ExpenseCategory, ExpensePaymentMethod, ExpenseRecord } from '@/types';
import {
  listExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  listExpenseCategories,
  normalizePaidAt,
} from '@/lib/services/expenseService';
import { toast } from 'sonner';

const PAY_METHODS: { value: ExpensePaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'online', label: 'Online' },
  { value: 'bank', label: 'Bank' },
  { value: 'other', label: 'Other' },
];

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return format(new Date(), "yyyy-MM-dd'T'HH:mm");
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

function monthFilterRange(monthStr: string): { start: string; end: string } {
  const [y, m] = monthStr.split('-').map((v) => parseInt(v, 10));
  if (!y || !m) {
    const d = new Date();
    return {
      start: format(startOfMonth(d), 'yyyy-MM-dd'),
      end: format(endOfMonth(d), 'yyyy-MM-dd'),
    };
  }
  const d = new Date(y, m - 1, 1);
  return {
    start: format(startOfMonth(d), 'yyyy-MM-dd'),
    end: format(endOfMonth(d), 'yyyy-MM-dd'),
  };
}

function isPaidAtInRange(paidAt: string, start: string, end: string): boolean {
  const day = String(paidAt).split('T')[0];
  return day >= start && day <= end;
}

export function ExpenseModule({ currentUserId }: { currentUserId: number }) {
  const [rows, setRows] = useState<ExpenseRecord[]>([]);
  const [filterMonth, setFilterMonth] = useState(() => format(new Date(), 'yyyy-MM'));

  const [editingId, setEditingId] = useState<number | null>(null);
  const [category, setCategory] = useState<ExpenseCategory>('daily');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [paidAtLocal, setPaidAtLocal] = useState(() => toDatetimeLocalValue(new Date().toISOString()));
  const [payMethod, setPayMethod] = useState<ExpensePaymentMethod>('cash');
  const [notes, setNotes] = useState('');

  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => monthFilterRange(filterMonth),
    [filterMonth]
  );

  const refresh = useCallback(() => {
    setRows(listExpenses());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    return rows.filter((r) => isPaidAtInRange(r.paid_at, rangeStart, rangeEnd));
  }, [rows, rangeStart, rangeEnd]);

  const monthTotal = useMemo(
    () => filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [filtered]
  );

  const resetForm = () => {
    setEditingId(null);
    setCategory('daily');
    setTitle('');
    setAmount('');
    setPaidAtLocal(toDatetimeLocalValue(new Date().toISOString()));
    setPayMethod('cash');
    setNotes('');
  };

  const startEdit = (r: ExpenseRecord) => {
    setEditingId(r.id);
    setCategory(r.category);
    setTitle(r.title);
    setAmount(String(r.amount));
    setPaidAtLocal(toDatetimeLocalValue(r.paid_at));
    setPayMethod(r.payment_method);
    setNotes(r.notes ? String(r.notes) : '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(amount.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Enter a valid amount');
      return;
    }
    const paidIso = normalizePaidAt(paidAtLocal);
    try {
      if (editingId != null) {
        updateExpense(editingId, {
          category,
          title,
          amount: n,
          paid_at: paidIso,
          payment_method: payMethod,
          notes: notes.trim() || null,
        });
        toast.success('Expense updated');
      } else {
        addExpense({
          category,
          title,
          amount: n,
          paid_at: paidIso,
          payment_method: payMethod,
          notes: notes.trim() || null,
          recorded_by_user_id: currentUserId,
        });
        toast.success('Expense recorded');
      }
      refresh();
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    }
  };

  const handleDelete = (id: number) => {
    if (!window.confirm('Delete this expense entry?')) return;
    if (deleteExpense(id)) {
      toast.success('Deleted');
      if (editingId === id) resetForm();
      refresh();
    }
  };

  const cats = listExpenseCategories();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Receipt className="h-7 w-7 text-primary" />
          Expenses
        </h2>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Record rent, fuel, daily costs, utilities, supplies, and other cash outflows.{' '}
          <strong className="text-foreground">Staff payroll</strong> stays under{' '}
          <strong className="text-foreground">Staff</strong>; this page feeds the operating-expense side of{' '}
          <strong className="text-foreground">Reports → Debit &amp; credit</strong>.
        </p>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm text-blue-950 flex gap-2">
        <Info className="w-5 h-5 shrink-0 mt-0.5" />
        <p>
          Use category <strong>Salary / wages (manual)</strong> only for ad-hoc wages not recorded in Staff payroll,
          to avoid double counting regular salaries.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2 border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{editingId ? 'Edit expense' : 'Add expense'}</CardTitle>
            <CardDescription>Amounts are included in monthly debit totals by <strong>paid date</strong>.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as ExpenseCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cats.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-title">Description</Label>
                <Input
                  id="exp-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Shop rent April, diesel for generator"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="exp-amt">Amount (Rs.)</Label>
                  <Input
                    id="exp-amt"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exp-paid">Paid at</Label>
                  <Input
                    id="exp-paid"
                    type="datetime-local"
                    value={paidAtLocal}
                    onChange={(e) => setPaidAtLocal(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Payment method</Label>
                <Select value={payMethod} onValueChange={(v) => setPayMethod(v as ExpensePaymentMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAY_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-notes">Notes (optional)</Label>
                <Textarea
                  id="exp-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm">
                  {editingId ? (
                    <Save className="w-4 h-4 mr-1.5" />
                  ) : (
                    <Plus className="w-4 h-4 mr-1.5" />
                  )}
                  {editingId ? 'Save changes' : 'Add expense'}
                </Button>
                {editingId != null && (
                  <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                    Cancel edit
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 border-slate-200 shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-3">
            <div>
              <CardTitle className="text-base">Recorded expenses</CardTitle>
              <CardDescription>Filter by calendar month (paid date).</CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Month</Label>
                <Input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="w-[11rem] font-medium"
                />
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Month total</p>
                <p className="text-lg font-semibold tabular-nums text-orange-900">
                  Rs. {monthTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="max-h-[min(28rem,55vh)] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Category</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Description</th>
                      <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Amount</th>
                      <th className="px-3 py-2.5 text-right font-medium text-muted-foreground w-[88px]"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const catLabel = cats.find((c) => c.value === r.category)?.label ?? r.category;
                      return (
                        <tr key={r.id} className="border-t border-border/70 hover:bg-muted/30">
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                            {r.paid_at ? new Date(r.paid_at).toLocaleString() : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="secondary" className="font-normal">
                              {catLabel}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 max-w-[200px] truncate" title={r.title}>
                            {r.title}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-orange-900">
                            Rs. {Number(r.amount).toLocaleString('en-IN')}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEdit(r)}
                              aria-label="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => handleDelete(r.id)}
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-12 text-center text-muted-foreground">
                          No expenses in this month.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
