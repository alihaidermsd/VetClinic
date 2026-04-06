import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  Calendar,
  Download,
  Users,
  Pill,
  RefreshCw,
  TrendingUp,
  Wallet,
  FileSpreadsheet,
  Scale,
  Printer,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
} from 'lucide-react';
import {
  getDailyReport,
  getDateRangeReport,
  getDoctorReport,
  getMedicineSalesReport,
  getBillLedgerForDay,
  getBillLedgerForRange,
  getAllTimeCompletedSummary,
  getMonthToDateReport,
  getMonthlyDebitCreditReport,
} from '@/lib/services/reportService';
import { getClinicDateString } from '@/lib/services/tokenService';
import { printMonthlyDebitCreditReport } from '@/lib/printDebitCreditReport';
import type { BillReportRow, MonthlyDebitCreditReport } from '@/types';
import { toast } from 'sonner';

function formatInr(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function downloadCsv(filename: string, headers: string[], rows: Record<string, string | number>[]) {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const line = (cells: string[]) => cells.map(esc).join(',');
  const body = rows.map((r) => line(headers.map((h) => String(r[h] ?? ''))));
  const csv = '\uFEFF' + [line(headers), ...body].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function debitCreditToCsvRecords(r: MonthlyDebitCreditReport): Record<string, string | number>[] {
  const out: Record<string, string | number>[] = [];
  out.push({ section: 'SUMMARY', kind: '', ref: '', amount: '', detail: '', extra: '' });
  out.push({
    section: 'Credit total',
    kind: '',
    ref: '',
    amount: r.credit_total,
    detail: `${r.credit_payment_count} payments`,
    extra: '',
  });
  out.push({
    section: 'Debit total (all outflows)',
    kind: '',
    ref: '',
    amount: r.debit_total,
    detail: `${r.debit_payment_count} lines (salary + expenses)`,
    extra: '',
  });
  out.push({
    section: '  — Salary debit',
    kind: '',
    ref: '',
    amount: r.salary_debit_total,
    detail: `${r.salary_payout_count} payouts`,
    extra: '',
  });
  out.push({
    section: '  — Operating expenses',
    kind: '',
    ref: '',
    amount: r.expense_debit_total,
    detail: `${r.expense_entry_count} entries`,
    extra: '',
  });
  out.push({
    section: 'Net position',
    kind: '',
    ref: '',
    amount: r.net_position,
    detail: 'credit - debit',
    extra: '',
  });
  out.push({
    section: 'Net billed (closed bills)',
    kind: '',
    ref: '',
    amount: r.net_billed_closed_bills,
    detail: r.month_label,
    extra: '',
  });
  out.push({ section: 'CREDIT_LINES', kind: '', ref: '', amount: '', detail: '', extra: '' });
  for (const line of r.credit_lines) {
    out.push({
      section: 'credit',
      kind: line.payment_method,
      ref: line.bill_code,
      amount: line.amount,
      detail: line.received_at,
      extra: line.received_by_name,
    });
  }
  out.push({ section: 'DEBIT_SALARY', kind: '', ref: '', amount: '', detail: '', extra: '' });
  for (const line of r.debit_lines) {
    out.push({
      section: 'debit_salary',
      kind: line.payment_method,
      ref: line.staff_name,
      amount: line.amount,
      detail: line.paid_at,
      extra: `${line.period_start}–${line.period_end}`,
    });
  }
  out.push({ section: 'DEBIT_EXPENSES', kind: '', ref: '', amount: '', detail: '', extra: '' });
  for (const line of r.expense_lines) {
    out.push({
      section: 'debit_expense',
      kind: line.payment_method,
      ref: line.title,
      amount: line.amount,
      detail: line.paid_at,
      extra: `${line.category_label}`,
    });
  }
  return out;
}

function billRowsToCsvRecords(rows: BillReportRow[]): Record<string, string | number>[] {
  return rows.map((r) => ({
    bill_code: r.bill_code,
    owner_name: r.owner_name,
    animal_name: r.animal_name,
    total_amount: r.total_amount,
    discount_amount: r.discount_amount,
    final_amount: r.final_amount,
    paid_amount: r.paid_amount,
    payment_status: r.payment_status,
    payment_method: r.payment_method ?? '',
    created_at: r.created_at,
    completed_at: r.completed_at ?? '',
  }));
}

function SummaryCards(props: {
  title: string;
  bills: number;
  gross: number;
  discount: number;
  net: number;
  extra?: { label: string; value: string } | null;
}) {
  return (
    <div className="space-y-3">
      {props.title ? <h4 className="text-sm font-semibold text-slate-700">{props.title}</h4> : null}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Closed bills</p>
            <p className="text-2xl font-bold text-slate-900">{props.bills}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Gross (subtotal)</p>
            <p className="text-2xl font-bold text-slate-800">Rs. {formatInr(props.gross)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Discounts</p>
            <p className="text-2xl font-bold text-amber-700">Rs. {formatInr(props.discount)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-green-100 bg-green-50/40">
          <CardContent className="p-4">
            <p className="text-xs text-slate-600 uppercase tracking-wide">Net billed</p>
            <p className="text-2xl font-bold text-green-700">Rs. {formatInr(props.net)}</p>
            {props.extra && (
              <p className="text-xs text-slate-600 mt-2">
                {props.extra.label}: <span className="font-semibold">{props.extra.value}</span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BillLedgerTable({ rows, title }: { rows: BillReportRow[]; title: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-medium text-slate-900">{title}</h4>
        <Badge variant="secondary">{rows.length} bills</Badge>
      </div>
      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
        <div className="max-h-[min(28rem,50vh)] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 sticky top-0 z-10">
              <tr>
                <th className="text-left py-2.5 px-3 font-medium text-slate-600">Bill</th>
                <th className="text-left py-2.5 px-3 font-medium text-slate-600">Customer / Pet</th>
                <th className="text-right py-2.5 px-3 font-medium text-slate-600">Net</th>
                <th className="text-right py-2.5 px-3 font-medium text-slate-600">Paid</th>
                <th className="text-left py-2.5 px-3 font-medium text-slate-600">Status</th>
                <th className="text-left py-2.5 px-3 font-medium text-slate-600 hidden lg:table-cell">Completed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="py-2 px-3 font-mono text-xs font-medium">{r.bill_code}</td>
                  <td className="py-2 px-3">
                    <div className="font-medium text-slate-800">{r.owner_name}</div>
                    <div className="text-xs text-slate-500">{r.animal_name}</div>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">Rs. {formatInr(r.final_amount)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-green-700">Rs. {formatInr(r.paid_amount)}</td>
                  <td className="py-2 px-3">
                    <span className="capitalize text-xs">{r.payment_status}</span>
                    {r.payment_method && (
                      <span className="block text-xs text-slate-500 capitalize">{r.payment_method}</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-500 hidden lg:table-cell whitespace-nowrap">
                    {r.completed_at
                      ? new Date(r.completed_at).toLocaleString()
                      : '—'}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No bills match this selection (need completed or fully paid).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ReportsModule() {
  const [activeTab, setActiveTab] = useState('overview');

  const [dailyDate, setDailyDate] = useState(() => getClinicDateString());
  const [dailyReport, setDailyReport] = useState(() => getDailyReport(getClinicDateString()));
  const [dailyLedger, setDailyLedger] = useState<BillReportRow[]>(() =>
    getBillLedgerForDay(getClinicDateString())
  );

  const [allTime, setAllTime] = useState(() => getAllTimeCompletedSummary());
  const [mtd, setMtd] = useState(() => getMonthToDateReport());

  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [rangeReport, setRangeReport] = useState<ReturnType<typeof getDateRangeReport> | null>(null);
  const [rangeLedger, setRangeLedger] = useState<BillReportRow[]>([]);

  const [doctorRange, setDoctorRange] = useState({ start: '', end: '' });
  const [doctorReport, setDoctorReport] = useState<any[]>([]);

  const [medRange, setMedRange] = useState({ start: '', end: '' });
  const [medicineReport, setMedicineReport] = useState<any>(null);

  const [dcMonth, setDcMonth] = useState(() => getClinicDateString().slice(0, 7));
  const [dcReport, setDcReport] = useState<MonthlyDebitCreditReport | null>(() => {
    const t = getClinicDateString();
    const [y, m] = t.split('-').map(Number);
    return getMonthlyDebitCreditReport(y, m);
  });

  const refreshOverview = useCallback(() => {
    const d = dailyDate;
    setAllTime(getAllTimeCompletedSummary());
    setMtd(getMonthToDateReport());
    setDailyReport(getDailyReport(d));
    setDailyLedger(getBillLedgerForDay(d));
    const [yy, mm] = dcMonth.split('-').map(Number);
    if (yy && mm) setDcReport(getMonthlyDebitCreditReport(yy, mm));
    toast.success('Reports refreshed');
  }, [dailyDate, dcMonth]);

  useEffect(() => {
    setDailyReport(getDailyReport(dailyDate));
    setDailyLedger(getBillLedgerForDay(dailyDate));
  }, [dailyDate]);

  useEffect(() => {
    const [y, m] = dcMonth.split('-').map(Number);
    if (!y || !m) return;
    setDcReport(getMonthlyDebitCreditReport(y, m));
  }, [dcMonth]);

  useEffect(() => {
    setDoctorReport(getDoctorReport());
    setMedicineReport(getMedicineSalesReport());
  }, []);

  const loadDateRangeReport = () => {
    if (!dateRange.start || !dateRange.end) {
      toast.error('Choose both start and end dates');
      return;
    }
    if (dateRange.start > dateRange.end) {
      toast.error('Start date must be before end date');
      return;
    }
    const report = getDateRangeReport(dateRange.start, dateRange.end);
    setRangeReport(report);
    setRangeLedger(getBillLedgerForRange(dateRange.start, dateRange.end));
  };

  const loadDoctorReport = () => {
    const { start, end } = doctorRange;
    if (start && end) setDoctorReport(getDoctorReport(start, end));
    else if (start) setDoctorReport(getDoctorReport(start, start));
    else setDoctorReport(getDoctorReport());
  };

  const loadMedicineReport = () => {
    const { start, end } = medRange;
    if (start && end) setMedicineReport(getMedicineSalesReport(start, end));
    else if (start) setMedicineReport(getMedicineSalesReport(start, start));
    else setMedicineReport(getMedicineSalesReport());
  };

  const exportDailyCsv = () => {
    const headers = [
      'bill_code',
      'owner_name',
      'animal_name',
      'total_amount',
      'discount_amount',
      'final_amount',
      'paid_amount',
      'payment_status',
      'payment_method',
      'created_at',
      'completed_at',
    ];
    downloadCsv(`animal-care-hospital-daily-${dailyDate}.csv`, headers, billRowsToCsvRecords(dailyLedger));
    toast.success('CSV downloaded');
  };

  const exportRangeCsv = () => {
    if (!rangeReport) {
      toast.error('Generate a period report first');
      return;
    }
    const headers = [
      'bill_code',
      'owner_name',
      'animal_name',
      'total_amount',
      'discount_amount',
      'final_amount',
      'paid_amount',
      'payment_status',
      'payment_method',
      'created_at',
      'completed_at',
    ];
    downloadCsv(
      `animal-care-hospital-${rangeReport.start_date}_to_${rangeReport.end_date}.csv`,
      headers,
      billRowsToCsvRecords(rangeLedger)
    );
    toast.success('CSV downloaded');
  };

  const exportDebitCreditCsv = () => {
    if (!dcReport) {
      toast.error('Load a month first');
      return;
    }
    downloadCsv(
      `animal-care-hospital-debit-credit-${dcReport.year}-${String(dcReport.month).padStart(2, '0')}.csv`,
      ['section', 'kind', 'ref', 'amount', 'detail', 'extra'],
      debitCreditToCsvRecords(dcReport)
    );
    toast.success('CSV downloaded');
  };

  const handlePrintDebitCredit = () => {
    if (!dcReport) return;
    const ok = printMonthlyDebitCreditReport(dcReport);
    if (!ok) toast.error('Allow pop-ups to print');
  };

  const exportAllTimeCsv = () => {
    const bills = getBillLedgerForRange('1970-01-01', '2999-12-31');
    const headers = [
      'bill_code',
      'owner_name',
      'animal_name',
      'total_amount',
      'discount_amount',
      'final_amount',
      'paid_amount',
      'payment_status',
      'payment_method',
      'created_at',
      'completed_at',
    ];
    downloadCsv('animal-care-hospital-all-completed-bills.csv', headers, billRowsToCsvRecords(bills));
    toast.success('CSV downloaded');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Reports &amp; income</h2>
          <p className="text-sm text-slate-600 mt-1">
            Includes bills that are <strong>completed</strong> or <strong>fully paid</strong> (even if you have not
            pressed Complete yet). Totals use <strong>completion time</strong> when saved, otherwise{' '}
            <strong>bill creation</strong> date. Payments shown are linked to those bills.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refreshOverview} className="shrink-0">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh data
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-3 lg:grid-cols-5">
          <TabsTrigger value="overview" className="py-2.5">
            <Wallet className="mr-1.5 hidden h-4 w-4 sm:inline" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="period" className="py-2.5">
            <Calendar className="mr-1.5 hidden h-4 w-4 sm:inline" />
            Period
          </TabsTrigger>
          <TabsTrigger value="debit-credit" className="py-2.5">
            <Scale className="mr-1.5 hidden h-4 w-4 sm:inline" />
            Debit &amp; credit
          </TabsTrigger>
          <TabsTrigger value="doctors" className="py-2.5">
            <Users className="mr-1.5 hidden h-4 w-4 sm:inline" />
            Doctors
          </TabsTrigger>
          <TabsTrigger value="medicines" className="py-2.5">
            <Pill className="mr-1.5 hidden h-4 w-4 sm:inline" />
            Medicines
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  All time
                </CardTitle>
                <CardDescription>Completed or fully paid bills (cancelled excluded)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Bills</span>
                  <span className="font-semibold">{allTime.total_bills}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Net billed</span>
                  <span className="font-semibold text-green-700">Rs. {formatInr(allTime.net_revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payments recorded</span>
                  <span className="font-medium">Rs. {formatInr(allTime.total_payments_recorded)}</span>
                </div>
                <Button type="button" variant="secondary" size="sm" className="w-full mt-3" onClick={exportAllTimeCsv}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Export all bills (CSV)
                </Button>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-accent" />
                  Month to date
                </CardTitle>
                <CardDescription>
                  {mtd.start_date} → {mtd.end_date} (clinic calendar)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SummaryCards
                  title=""
                  bills={mtd.summary.total_bills}
                  gross={mtd.summary.total_revenue}
                  discount={mtd.summary.total_discount}
                  net={mtd.summary.net_revenue}
                />
              </CardContent>
            </Card>
          </div>

          <Card className="border-primary/15 shadow-sm">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="w-5 h-5 text-primary" />
                  Daily report
                </CardTitle>
                <CardDescription>Pick any day — see totals, room split, payments, and each bill.</CardDescription>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rep-day" className="text-xs">
                    Report date
                  </Label>
                  <Input
                    id="rep-day"
                    type="date"
                    value={dailyDate}
                    onChange={(e) => setDailyDate(e.target.value)}
                    className="w-[11rem]"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={exportDailyCsv} disabled={dailyLedger.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {dailyReport && (
                <>
                  <SummaryCards
                    title={`Totals for ${dailyReport.date}`}
                    bills={dailyReport.total_bills}
                    gross={dailyReport.total_revenue}
                    discount={dailyReport.total_discount}
                    net={dailyReport.net_revenue}
                  />

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-2 text-slate-900">Room-wise charges (line items)</h4>
                      <div className="rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="text-left py-2 px-3">Room</th>
                              <th className="text-right py-2 px-3">Lines</th>
                              <th className="text-right py-2 px-3">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(dailyReport.room_wise?.length ? dailyReport.room_wise : []).map((room: any) => (
                              <tr key={`${room.room_id}-${room.room_name}`} className="border-t border-slate-100">
                                <td className="py-2 px-3">{room.room_name}</td>
                                <td className="py-2 px-3 text-right">{room.item_count}</td>
                                <td className="py-2 px-3 text-right tabular-nums">Rs. {formatInr(room.total_charges)}</td>
                              </tr>
                            ))}
                            {(!dailyReport.room_wise || dailyReport.room_wise.length === 0) && (
                              <tr>
                                <td colSpan={3} className="py-8 text-center text-slate-500">
                                  No line items for these bills.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2 text-slate-900">Payments (linked bills)</h4>
                      <div className="rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="text-left py-2 px-3">Method</th>
                              <th className="text-right py-2 px-3">Count</th>
                              <th className="text-right py-2 px-3">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(dailyReport.payment_wise?.length ? dailyReport.payment_wise : []).map((p: any) => (
                              <tr key={p.payment_method} className="border-t border-slate-100">
                                <td className="py-2 px-3 capitalize">{p.payment_method}</td>
                                <td className="py-2 px-3 text-right">{p.count}</td>
                                <td className="py-2 px-3 text-right tabular-nums">Rs. {formatInr(p.total_amount)}</td>
                              </tr>
                            ))}
                            {(!dailyReport.payment_wise || dailyReport.payment_wise.length === 0) && (
                              <tr>
                                <td colSpan={3} className="py-8 text-center text-slate-500">
                                  No payments on bills for this day.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <BillLedgerTable rows={dailyLedger} title="Bill detail (closed on this day)" />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="period" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Historical period
              </CardTitle>
              <CardDescription>Compare days, see room and payment mix, and export the full bill list.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-2">
                  <Label>From</Label>
                  <Input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>To</Label>
                  <Input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  />
                </div>
                <Button type="button" onClick={loadDateRangeReport}>
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Generate
                </Button>
                <Button type="button" variant="outline" onClick={exportRangeCsv} disabled={!rangeReport || rangeLedger.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </div>

              {rangeReport && (
                <div className="space-y-8">
                  <SummaryCards
                    title={`${rangeReport.start_date} → ${rangeReport.end_date}`}
                    bills={rangeReport.summary.total_bills}
                    gross={rangeReport.summary.total_revenue}
                    discount={rangeReport.summary.total_discount}
                    net={rangeReport.summary.net_revenue}
                  />

                  <div>
                    <h4 className="font-medium mb-2">Daily net (completed bills)</h4>
                    <div className="rounded-lg border border-slate-200 overflow-x-auto">
                      <table className="w-full text-sm min-w-[320px]">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="text-left py-2 px-3">Date</th>
                            <th className="text-right py-2 px-3">Bills</th>
                            <th className="text-right py-2 px-3">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(rangeReport.daily_breakdown?.length ? rangeReport.daily_breakdown : []).map((day: any) => (
                            <tr key={day.date} className="border-t border-slate-100">
                              <td className="py-2 px-3 whitespace-nowrap">{day.date}</td>
                              <td className="py-2 px-3 text-right">{day.bill_count}</td>
                              <td className="py-2 px-3 text-right tabular-nums">Rs. {formatInr(day.revenue)}</td>
                            </tr>
                          ))}
                          {(!rangeReport.daily_breakdown || rangeReport.daily_breakdown.length === 0) && (
                            <tr>
                              <td colSpan={3} className="py-8 text-center text-slate-500">
                                No data in this range.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-2">Room-wise (period)</h4>
                      <div className="rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="text-left py-2 px-3">Room</th>
                              <th className="text-right py-2 px-3">Lines</th>
                              <th className="text-right py-2 px-3">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(rangeReport.room_wise?.length ? rangeReport.room_wise : []).map((room: any) => (
                              <tr key={`${room.room_id}-${room.room_name}`} className="border-t border-slate-100">
                                <td className="py-2 px-3">{room.room_name}</td>
                                <td className="py-2 px-3 text-right">{room.item_count}</td>
                                <td className="py-2 px-3 text-right tabular-nums">Rs. {formatInr(room.total_charges)}</td>
                              </tr>
                            ))}
                            {(!rangeReport.room_wise || rangeReport.room_wise.length === 0) && (
                              <tr>
                                <td colSpan={3} className="py-6 text-center text-slate-500">
                                  No line items.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Payments (period)</h4>
                      <div className="rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="text-left py-2 px-3">Method</th>
                              <th className="text-right py-2 px-3">Count</th>
                              <th className="text-right py-2 px-3">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(rangeReport.payment_wise?.length ? rangeReport.payment_wise : []).map((p: any) => (
                              <tr key={p.payment_method} className="border-t border-slate-100">
                                <td className="py-2 px-3 capitalize">{p.payment_method}</td>
                                <td className="py-2 px-3 text-right">{p.count}</td>
                                <td className="py-2 px-3 text-right tabular-nums">Rs. {formatInr(p.total_amount)}</td>
                              </tr>
                            ))}
                            {(!rangeReport.payment_wise || rangeReport.payment_wise.length === 0) && (
                              <tr>
                                <td colSpan={3} className="py-6 text-center text-slate-500">
                                  No payments.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <BillLedgerTable rows={rangeLedger} title="All bills in period" />
                </div>
              )}

              {!rangeReport && (
                <p className="text-sm text-slate-500 text-center py-8">
                  Choose a date range and press Generate to load historical totals and every bill.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debit-credit" className="mt-6 space-y-6">
          <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-secondary/25 via-background to-muted/40 p-1 shadow-sm">
            <Card className="border-0 bg-card/95 shadow-none">
              <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Landmark className="h-6 w-6 text-primary" />
                    Monthly debit &amp; credit
                  </CardTitle>
                  <CardDescription className="max-w-2xl text-sm leading-relaxed">
                    <strong className="text-foreground">Credit</strong> is cash collected: every{' '}
                    <strong>payment</strong> dated in the month (bills not cancelled).{' '}
                    <strong className="text-foreground">Debit</strong> is all cash out:{' '}
                    <strong>staff payroll</strong> (Staff module) plus <strong>operating expenses</strong> (Expenses
                    page), both by paid date. Net position = credit − total debit.{' '}
                    <strong>Net billed</strong> matches the Period report (closed bills). Collections can differ when
                    payments fall in a different month than the bill was closed.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="dc-month" className="text-xs">
                      Calendar month
                    </Label>
                    <Input
                      id="dc-month"
                      type="month"
                      value={dcMonth}
                      onChange={(e) => setDcMonth(e.target.value)}
                      className="w-[11rem] font-medium"
                    />
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={exportDebitCreditCsv} disabled={!dcReport}>
                    <Download className="mr-2 h-4 w-4" />
                    CSV
                  </Button>
                  <Button type="button" size="sm" onClick={handlePrintDebitCredit} disabled={!dcReport}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-8 pt-6">
                {dcReport && (
                  <>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="group relative overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 p-5 shadow-sm ring-1 ring-emerald-900/5 transition hover:shadow-md">
                        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-400/15 blur-2xl" />
                        <div className="relative flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-inner">
                            <ArrowDownLeft className="h-6 w-6" strokeWidth={2.25} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/90">
                              Credit — collections
                            </p>
                            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-900">
                              Rs. {formatInr(dcReport.credit_total)}
                            </p>
                            <p className="mt-1 text-xs text-emerald-800/75">
                              {dcReport.credit_payment_count} payment line
                              {dcReport.credit_payment_count === 1 ? '' : 's'} · bill payments only
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="group relative overflow-hidden rounded-2xl border border-orange-200/90 bg-gradient-to-br from-orange-50 via-white to-amber-50/40 p-5 shadow-sm ring-1 ring-orange-900/5 transition hover:shadow-md">
                        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-orange-400/20 blur-2xl" />
                        <div className="relative flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-inner">
                            <ArrowUpRight className="h-6 w-6" strokeWidth={2.25} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-900/85">
                              Debit — cash out
                            </p>
                            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-orange-950">
                              Rs. {formatInr(dcReport.debit_total)}
                            </p>
                            <p className="mt-1 text-xs text-orange-900/75 leading-snug">
                              Payroll Rs. {formatInr(dcReport.salary_debit_total)} ({dcReport.salary_payout_count}) ·
                              Expenses Rs. {formatInr(dcReport.expense_debit_total)} ({dcReport.expense_entry_count}) ·{' '}
                              {dcReport.debit_payment_count} line{dcReport.debit_payment_count === 1 ? '' : 's'} total
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="group relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-background to-accent/15 p-5 shadow-sm ring-1 ring-primary/10 transition hover:shadow-md">
                        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />
                        <div className="relative flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-inner">
                            <TrendingUp className="h-6 w-6" strokeWidth={2.25} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/90">
                              Net cash position
                            </p>
                            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-primary">
                              Rs. {formatInr(dcReport.net_position)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {dcReport.month_label} · credit minus debit
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-primary/20 bg-muted/30 px-4 py-3 text-sm">
                      <span className="text-muted-foreground">
                        <strong className="text-foreground">Net billed (closed bills)</strong> this month (same as
                        Period report)
                      </span>
                      <span className="font-mono text-base font-semibold tabular-nums text-foreground">
                        Rs. {formatInr(dcReport.net_billed_closed_bills)}
                      </span>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-2">
                      <div className="space-y-3">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          By payment method
                        </h4>
                        <div className="overflow-hidden rounded-xl border border-border bg-card">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/60">
                              <tr>
                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Method</th>
                                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Count</th>
                                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dcReport.credit_by_method.map((row) => (
                                <tr key={row.payment_method} className="border-t border-border/80">
                                  <td className="px-3 py-2 capitalize">{row.payment_method}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{row.count}</td>
                                  <td className="px-3 py-2 text-right font-medium tabular-nums text-emerald-800">
                                    Rs. {formatInr(row.total_amount)}
                                  </td>
                                </tr>
                              ))}
                              {dcReport.credit_by_method.length === 0 && (
                                <tr>
                                  <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                                    No collections this month.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <span className="h-2 w-2 rounded-full bg-primary" />
                          Reporting window
                        </h4>
                        <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed text-muted-foreground">
                          <p>
                            <strong className="text-foreground">{dcReport.month_label}</strong>
                          </p>
                          <p className="mt-2 font-mono text-xs">
                            {dcReport.range_start} → {dcReport.range_end}
                          </p>
                          <p className="mt-3 text-xs">
                            Figures use the same data as the dashboard:{' '}
                            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">payments</code>,{' '}
                            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">salary_payments</code>, and{' '}
                            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">expenses</code>, with bill
                            cancellation rules applied to credits.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-foreground">Credit — every payment line</h4>
                      <div className="overflow-hidden rounded-xl border border-border">
                        <div className="max-h-[min(22rem,45vh)] overflow-auto">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
                              <tr>
                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Bill</th>
                                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Amount</th>
                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Method</th>
                                <th className="hidden px-3 py-2.5 text-left font-medium text-muted-foreground lg:table-cell">
                                  Received
                                </th>
                                <th className="hidden px-3 py-2.5 text-left font-medium text-muted-foreground xl:table-cell">
                                  By
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {dcReport.credit_lines.map((r) => (
                                <tr key={r.id} className="border-t border-border/70 hover:bg-muted/30">
                                  <td className="px-3 py-2 font-mono text-xs font-medium">{r.bill_code}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-emerald-800">
                                    Rs. {formatInr(r.amount)}
                                  </td>
                                  <td className="px-3 py-2 capitalize">{r.payment_method}</td>
                                  <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                                    {r.received_at ? new Date(r.received_at).toLocaleString() : '—'}
                                  </td>
                                  <td className="hidden px-3 py-2 text-xs xl:table-cell">{r.received_by_name}</td>
                                </tr>
                              ))}
                              {dcReport.credit_lines.length === 0 && (
                                <tr>
                                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                                    No payment lines in this month.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-foreground">Debit — staff payroll</h4>
                      <div className="overflow-hidden rounded-xl border border-border">
                        <div className="max-h-[min(22rem,45vh)] overflow-auto">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
                              <tr>
                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Staff</th>
                                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Amount</th>
                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Method</th>
                                <th className="hidden px-3 py-2.5 text-left font-medium text-muted-foreground md:table-cell">
                                  Paid at
                                </th>
                                <th className="hidden px-3 py-2.5 text-left font-medium text-muted-foreground lg:table-cell">
                                  Period
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {dcReport.debit_lines.map((r) => (
                                <tr key={r.id} className="border-t border-border/70 hover:bg-muted/30">
                                  <td className="px-3 py-2 font-medium">{r.staff_name}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-orange-900">
                                    Rs. {formatInr(r.amount)}
                                  </td>
                                  <td className="px-3 py-2 capitalize">{r.payment_method}</td>
                                  <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-muted-foreground md:table-cell">
                                    {r.paid_at ? new Date(r.paid_at).toLocaleString() : '—'}
                                  </td>
                                  <td className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                                    {r.period_start} → {r.period_end}
                                  </td>
                                </tr>
                              ))}
                              {dcReport.debit_lines.length === 0 && (
                                <tr>
                                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                                    No salary payouts recorded in this month.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-foreground">Debit — operating expenses</h4>
                      <div className="overflow-hidden rounded-xl border border-border">
                        <div className="max-h-[min(22rem,45vh)] overflow-auto">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
                              <tr>
                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Category</th>
                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Description</th>
                                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Amount</th>
                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Method</th>
                                <th className="hidden px-3 py-2.5 text-left font-medium text-muted-foreground lg:table-cell">
                                  Paid at
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {dcReport.expense_lines.map((r) => (
                                <tr key={r.id} className="border-t border-border/70 hover:bg-muted/30">
                                  <td className="px-3 py-2 text-xs">{r.category_label}</td>
                                  <td className="px-3 py-2 max-w-[180px] truncate" title={r.title}>
                                    {r.title}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-orange-900">
                                    Rs. {formatInr(r.amount)}
                                  </td>
                                  <td className="px-3 py-2 capitalize">{r.payment_method}</td>
                                  <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                                    {r.paid_at ? new Date(r.paid_at).toLocaleString() : '—'}
                                  </td>
                                </tr>
                              ))}
                              {dcReport.expense_lines.length === 0 && (
                                <tr>
                                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                                    No operating expenses in this month (add them under Expenses).
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="doctors" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Doctor charges
                </CardTitle>
                <CardDescription>Consultation line items on completed bills. Leave dates empty for all time.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={doctorRange.start}
                    onChange={(e) => setDoctorRange({ ...doctorRange, start: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    value={doctorRange.end}
                    onChange={(e) => setDoctorRange({ ...doctorRange, end: e.target.value })}
                  />
                </div>
                <Button type="button" size="sm" onClick={loadDoctorReport}>
                  Apply
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left py-2 px-3">Doctor</th>
                      <th className="text-right py-2 px-3">Bills</th>
                      <th className="text-right py-2 px-3">Charges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctorReport.map((doctor: any) => (
                      <tr key={`${doctor.doctor_id}-${doctor.doctor_name}`} className="border-t border-slate-100">
                        <td className="py-2 px-3">{doctor.doctor_name}</td>
                        <td className="py-2 px-3 text-right">{doctor.total_patients}</td>
                        <td className="py-2 px-3 text-right tabular-nums">Rs. {formatInr(doctor.total_charges)}</td>
                      </tr>
                    ))}
                    {doctorReport.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-500">
                          No consultation charges in the selected window.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="medicines" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Pill className="w-5 h-5" />
                  Medicine sales
                </CardTitle>
                <CardDescription>Medicine line items on completed bills. Leave dates empty for all time.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={medRange.start}
                    onChange={(e) => setMedRange({ ...medRange, start: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    value={medRange.end}
                    onChange={(e) => setMedRange({ ...medRange, end: e.target.value })}
                  />
                </div>
                <Button type="button" size="sm" onClick={loadMedicineReport}>
                  Apply
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {medicineReport && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3 max-w-md">
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-slate-500">Line items</p>
                        <p className="text-xl font-bold">{medicineReport.summary.total_sales}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-slate-500">Revenue</p>
                        <p className="text-xl font-bold text-green-700">Rs. {formatInr(medicineReport.summary.total_revenue)}</p>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="text-left py-2 px-3">Item</th>
                          <th className="text-right py-2 px-3">Qty</th>
                          <th className="text-right py-2 px-3">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(medicineReport.item_wise?.length ? medicineReport.item_wise : []).map((item: any) => (
                          <tr key={item.item_name} className="border-t border-slate-100">
                            <td className="py-2 px-3">{item.item_name}</td>
                            <td className="py-2 px-3 text-right">{item.total_quantity}</td>
                            <td className="py-2 px-3 text-right tabular-nums">Rs. {formatInr(item.total_revenue)}</td>
                          </tr>
                        ))}
                        {(!medicineReport.item_wise || medicineReport.item_wise.length === 0) && (
                          <tr>
                            <td colSpan={3} className="py-8 text-center text-slate-500">
                              No medicine lines in this window.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
