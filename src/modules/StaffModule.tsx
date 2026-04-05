import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  CalendarCheck,
  Banknote,
  Save,
  CheckCheck,
  Loader2,
} from 'lucide-react';
import type { User, AttendanceStatus, SalaryPaymentMethod, SalaryPayment } from '@/types';
import { getActiveUsers, updateUser, getUserById } from '@/lib/services/userService';
import {
  getAttendanceForDate,
  upsertAttendance,
  countPresentUnitsInPeriod,
  hasSalaryPaymentForPeriod,
  recordSalaryPayment,
  getSalaryPaymentsForPeriod,
  payAllUnpaidStaffForPeriod,
} from '@/lib/services/staffService';
import { toast } from 'sonner';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  reception: 'Receptionist',
  doctor: 'Doctor',
  lab_operator: 'Lab Operator',
  xray_operator: 'X-Ray Operator',
  surgery_operator: 'Surgery Operator',
  pharmacy: 'Pharmacist',
  accountant: 'Accountant',
};

const ATTENDANCE_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'half_day', label: 'Half day' },
  { value: 'leave', label: 'Leave' },
];

const PAY_METHODS: { value: SalaryPaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];

type AttRowState = {
  status: AttendanceStatus;
  check_in: string;
  check_out: string;
  notes: string;
};

function periodFromMonthInput(monthStr: string): { start: string; end: string } {
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

export function StaffModule({ currentUserId }: { currentUserId: number }) {
  const [staff, setStaff] = useState<User[]>([]);
  const [salaryDraft, setSalaryDraft] = useState<Record<number, string>>({});

  const [attendanceDate, setAttendanceDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [attRows, setAttRows] = useState<Record<number, AttRowState>>({});
  const [savingAttendance, setSavingAttendance] = useState(false);

  const [payrollMonth, setPayrollMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const { start: periodStart, end: periodEnd } = useMemo(
    () => periodFromMonthInput(payrollMonth),
    [payrollMonth]
  );
  const [payAmounts, setPayAmounts] = useState<Record<number, string>>({});
  const [bulkPayMethod, setBulkPayMethod] = useState<SalaryPaymentMethod>('bank');
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);

  const loadStaff = useCallback(() => {
    const list = getActiveUsers() as User[];
    setStaff(list);
    setSalaryDraft(() => {
      const next: Record<number, string> = {};
      for (const u of list) {
        next[u.id] = String(Number(u.monthly_salary ?? 0));
      }
      return next;
    });
  }, []);

  const refreshPayments = useCallback(() => {
    setPayments(getSalaryPaymentsForPeriod(periodStart, periodEnd));
  }, [periodStart, periodEnd]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  useEffect(() => {
    refreshPayments();
  }, [refreshPayments]);

  useEffect(() => {
    const dayRows = getAttendanceForDate(attendanceDate);
    const next: Record<number, AttRowState> = {};
    for (const u of staff) {
      const a = dayRows.find((r) => r.user_id === u.id);
      next[u.id] = {
        status: (a?.status as AttendanceStatus) || 'absent',
        check_in: a?.check_in ? String(a.check_in).slice(0, 5) : '',
        check_out: a?.check_out ? String(a.check_out).slice(0, 5) : '',
        notes: a?.notes ? String(a.notes) : '',
      };
    }
    setAttRows(next);
  }, [attendanceDate, staff]);

  useEffect(() => {
    const next: Record<number, string> = {};
    for (const u of staff) {
      next[u.id] = String(Number(u.monthly_salary ?? 0));
    }
    setPayAmounts(next);
  }, [staff, payrollMonth]);

  const saveSalary = (userId: number) => {
    const raw = salaryDraft[userId];
    const n = parseFloat(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Enter a valid non-negative salary');
      return;
    }
    try {
      updateUser(userId, { monthly_salary: n });
      toast.success('Salary updated');
      loadStaff();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    }
  };

  const markAllPresent = () => {
    setAttRows((prev) => {
      const next = { ...prev };
      for (const u of staff) {
        next[u.id] = {
          ...(next[u.id] || {
            status: 'absent' as AttendanceStatus,
            check_in: '',
            check_out: '',
            notes: '',
          }),
          status: 'present',
        };
      }
      return next;
    });
    toast.info('All set to Present — click Save day to store');
  };

  const saveAttendanceDay = async () => {
    setSavingAttendance(true);
    try {
      for (const u of staff) {
        const row = attRows[u.id];
        if (!row) continue;
        upsertAttendance({
          user_id: u.id,
          work_date: attendanceDate,
          status: row.status,
          check_in: row.check_in.trim() || null,
          check_out: row.check_out.trim() || null,
          notes: row.notes.trim() || null,
        });
      }
      toast.success('Attendance saved for ' + attendanceDate);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingAttendance(false);
    }
  };

  const payOne = (userId: number, method: SalaryPaymentMethod) => {
    const existing = hasSalaryPaymentForPeriod(userId, periodStart, periodEnd);
    if (existing) {
      toast.error('This person is already marked paid for this period');
      return;
    }
    const amt = parseFloat(String(payAmounts[userId] ?? '0').replace(/,/g, ''));
    if (!Number.isFinite(amt) || amt < 0) {
      toast.error('Invalid amount');
      return;
    }
    try {
      recordSalaryPayment({
        user_id: userId,
        period_start: periodStart,
        period_end: periodEnd,
        amount: amt,
        payment_method: method,
        recorded_by_user_id: currentUserId,
      });
      toast.success('Salary payment recorded');
      refreshPayments();
      loadStaff();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record payment');
    }
  };

  const payEveryone = async () => {
    setPayrollLoading(true);
    try {
      const amountByUserId: Record<number, number> = {};
      for (const u of staff) {
        const amt = parseFloat(String(payAmounts[u.id] ?? '0').replace(/,/g, ''));
        amountByUserId[u.id] = Number.isFinite(amt) && amt >= 0 ? amt : 0;
      }
      const { paid, skipped } = payAllUnpaidStaffForPeriod(
        periodStart,
        periodEnd,
        bulkPayMethod,
        currentUserId,
        amountByUserId
      );
      if (paid) toast.success(`Recorded ${paid} payment(s)`);
      if (skipped.length) {
        toast.info(
          `${skipped.length} skipped (${skipped.filter((s) => s.reason === 'Already paid').length} already paid)`
        );
      }
      refreshPayments();
      loadStaff();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk pay failed');
    } finally {
      setPayrollLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Staff &amp; payroll</h3>
        <p className="text-sm text-slate-500">
          Manage team salaries, daily attendance, and salary payouts for each period.
        </p>
      </div>

      <Tabs defaultValue="staff" className="space-y-4">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="staff" className="gap-1">
            <Users className="w-4 h-4" />
            Staff
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1">
            <CalendarCheck className="w-4 h-4" />
            Attendance
          </TabsTrigger>
          <TabsTrigger value="payroll" className="gap-1">
            <Banknote className="w-4 h-4" />
            Payroll
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staff">
          <Card>
            <CardHeader>
              <CardTitle>Active staff</CardTitle>
              <CardDescription>
                Set each person&apos;s monthly salary (Rs.). User accounts are still created under Admin.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[min(480px,calc(100vh-320px))] rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="p-3 font-medium">Name</th>
                      <th className="p-3 font-medium">Role</th>
                      <th className="p-3 font-medium text-right">Monthly salary (Rs.)</th>
                      <th className="p-3 w-[100px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((u) => (
                      <tr key={u.id} className="border-b border-border/60">
                        <td className="p-3 font-medium">{u.name}</td>
                        <td className="p-3 text-muted-foreground">
                          {ROLE_LABELS[u.role] || u.role}
                        </td>
                        <td className="p-3 text-right">
                          <Input
                            className="max-w-[140px] ml-auto text-right"
                            type="number"
                            min={0}
                            step={1}
                            value={salaryDraft[u.id] ?? ''}
                            onChange={(e) =>
                              setSalaryDraft((prev) => ({ ...prev, [u.id]: e.target.value }))
                            }
                          />
                        </td>
                        <td className="p-3">
                          <Button size="sm" variant="secondary" onClick={() => saveSalary(u.id)}>
                            Save
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
              {staff.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">No active users</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>Daily attendance</CardTitle>
                <CardDescription>
                  Mark status and optional check-in / check-out times, then save the day.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input
                    type="date"
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
                <Button type="button" variant="outline" onClick={markAllPresent}>
                  <CheckCheck className="w-4 h-4 mr-2" />
                  Mark all present
                </Button>
                <Button type="button" onClick={saveAttendanceDay} disabled={savingAttendance}>
                  {savingAttendance ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save day
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[min(520px,calc(100vh-360px))] rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="p-2 font-medium">Staff</th>
                      <th className="p-2 font-medium">Status</th>
                      <th className="p-2 font-medium">In</th>
                      <th className="p-2 font-medium">Out</th>
                      <th className="p-2 font-medium min-w-[120px]">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((u) => {
                      const row = attRows[u.id];
                      if (!row) return null;
                      return (
                        <tr key={u.id} className="border-b border-border/60 align-middle">
                          <td className="p-2">
                            <div className="font-medium">{u.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {ROLE_LABELS[u.role] || u.role}
                            </div>
                          </td>
                          <td className="p-2">
                            <Select
                              value={row.status}
                              onValueChange={(v: AttendanceStatus) =>
                                setAttRows((prev) => ({
                                  ...prev,
                                  [u.id]: { ...prev[u.id], status: v },
                                }))
                              }
                            >
                              <SelectTrigger className="w-[130px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ATTENDANCE_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Input
                              type="time"
                              className="w-[110px]"
                              value={row.check_in}
                              onChange={(e) =>
                                setAttRows((prev) => ({
                                  ...prev,
                                  [u.id]: { ...prev[u.id], check_in: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="time"
                              className="w-[110px]"
                              value={row.check_out}
                              onChange={(e) =>
                                setAttRows((prev) => ({
                                  ...prev,
                                  [u.id]: { ...prev[u.id], check_out: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              placeholder="Optional"
                              value={row.notes}
                              onChange={(e) =>
                                setAttRows((prev) => ({
                                  ...prev,
                                  [u.id]: { ...prev[u.id], notes: e.target.value },
                                }))
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll">
          <Card>
            <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle>Salary for period</CardTitle>
                <CardDescription>
                  {periodStart} → {periodEnd}. Present units = full days + half days (½). Adjust amounts
                  before paying.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Month</Label>
                  <Input
                    type="month"
                    value={payrollMonth}
                    onChange={(e) => setPayrollMonth(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Pay everyone via</Label>
                  <Select
                    value={bulkPayMethod}
                    onValueChange={(v: SalaryPaymentMethod) => setBulkPayMethod(v)}
                  >
                    <SelectTrigger className="w-[150px]">
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
                <Button onClick={payEveryone} disabled={payrollLoading}>
                  {payrollLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Pay everyone (unpaid)
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <ScrollArea className="h-[min(280px,calc(100vh-480px))] rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="p-2 font-medium">Staff</th>
                      <th className="p-2 font-medium text-right">Present units</th>
                      <th className="p-2 font-medium text-right">Monthly</th>
                      <th className="p-2 font-medium">Status</th>
                      <th className="p-2 font-medium text-right">Pay amount</th>
                      <th className="p-2 w-[90px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((u) => {
                      const { present_units } = countPresentUnitsInPeriod(
                        u.id,
                        periodStart,
                        periodEnd
                      );
                      const paid = hasSalaryPaymentForPeriod(u.id, periodStart, periodEnd);
                      return (
                        <tr key={u.id} className="border-b border-border/60 align-middle">
                          <td className="p-2 font-medium">{u.name}</td>
                          <td className="p-2 text-right tabular-nums">{present_units}</td>
                          <td className="p-2 text-right tabular-nums">
                            Rs. {Number(u.monthly_salary ?? 0).toLocaleString()}
                          </td>
                          <td className="p-2">
                            {paid ? (
                              <Badge className="bg-green-100 text-green-800">Paid</Badge>
                            ) : (
                              <Badge variant="secondary">Unpaid</Badge>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <Input
                              className="max-w-[120px] ml-auto text-right"
                              type="number"
                              min={0}
                              disabled={!!paid}
                              value={payAmounts[u.id] ?? ''}
                              onChange={(e) =>
                                setPayAmounts((prev) => ({ ...prev, [u.id]: e.target.value }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!!paid}
                              onClick={() => payOne(u.id, bulkPayMethod)}
                            >
                              Pay
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>

              <div>
                <h4 className="text-sm font-medium mb-2">Payments recorded this period</h4>
                <ScrollArea className="h-[200px] rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th className="p-2 font-medium">Staff</th>
                        <th className="p-2 font-medium text-right">Amount</th>
                        <th className="p-2 font-medium">Method</th>
                        <th className="p-2 font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-muted-foreground">
                            No payments for this month yet
                          </td>
                        </tr>
                      ) : (
                        payments.map((p) => {
                          const person = getUserById(p.user_id);
                          return (
                            <tr key={p.id} className="border-b border-border/60">
                              <td className="p-2">{person?.name ?? `User #${p.user_id}`}</td>
                              <td className="p-2 text-right tabular-nums">
                                Rs. {Number(p.amount).toLocaleString()}
                              </td>
                              <td className="p-2 capitalize">{p.payment_method}</td>
                              <td className="p-2 text-muted-foreground text-xs">
                                {format(new Date(p.paid_at), 'MMM d, yyyy HH:mm')}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
