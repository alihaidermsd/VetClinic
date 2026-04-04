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
} from '@/lib/services/reportService';
import { getClinicDateString } from '@/lib/services/tokenService';
import type { BillReportRow } from '@/types';
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
            <p className="text-2xl font-bold text-slate-800">₹{formatInr(props.gross)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Discounts</p>
            <p className="text-2xl font-bold text-amber-700">₹{formatInr(props.discount)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-green-100 bg-green-50/40">
          <CardContent className="p-4">
            <p className="text-xs text-slate-600 uppercase tracking-wide">Net billed</p>
            <p className="text-2xl font-bold text-green-700">₹{formatInr(props.net)}</p>
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
                  <td className="py-2 px-3 text-right tabular-nums">₹{formatInr(r.final_amount)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-green-700">₹{formatInr(r.paid_amount)}</td>
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

  const refreshOverview = useCallback(() => {
    const d = dailyDate;
    setAllTime(getAllTimeCompletedSummary());
    setMtd(getMonthToDateReport());
    setDailyReport(getDailyReport(d));
    setDailyLedger(getBillLedgerForDay(d));
    toast.success('Reports refreshed');
  }, [dailyDate]);

  useEffect(() => {
    setDailyReport(getDailyReport(dailyDate));
    setDailyLedger(getBillLedgerForDay(dailyDate));
  }, [dailyDate]);

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
    downloadCsv(`vetclinic-daily-${dailyDate}.csv`, headers, billRowsToCsvRecords(dailyLedger));
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
      `vetclinic-${rangeReport.start_date}_to_${rangeReport.end_date}.csv`,
      headers,
      billRowsToCsvRecords(rangeLedger)
    );
    toast.success('CSV downloaded');
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
    downloadCsv('vetclinic-all-completed-bills.csv', headers, billRowsToCsvRecords(bills));
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
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-auto p-1 gap-1">
          <TabsTrigger value="overview" className="py-2.5">
            <Wallet className="w-4 h-4 mr-1.5 hidden sm:inline" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="period" className="py-2.5">
            <Calendar className="w-4 h-4 mr-1.5 hidden sm:inline" />
            Period
          </TabsTrigger>
          <TabsTrigger value="doctors" className="py-2.5">
            <Users className="w-4 h-4 mr-1.5 hidden sm:inline" />
            Doctors
          </TabsTrigger>
          <TabsTrigger value="medicines" className="py-2.5">
            <Pill className="w-4 h-4 mr-1.5 hidden sm:inline" />
            Medicines
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
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
                  <span className="font-semibold text-green-700">₹{formatInr(allTime.net_revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payments recorded</span>
                  <span className="font-medium">₹{formatInr(allTime.total_payments_recorded)}</span>
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
                  <Calendar className="w-4 h-4 text-indigo-600" />
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

          <Card className="border-blue-100 shadow-sm">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="w-5 h-5 text-blue-600" />
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
                                <td className="py-2 px-3 text-right tabular-nums">₹{formatInr(room.total_charges)}</td>
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
                                <td className="py-2 px-3 text-right tabular-nums">₹{formatInr(p.total_amount)}</td>
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
                              <td className="py-2 px-3 text-right tabular-nums">₹{formatInr(day.revenue)}</td>
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
                                <td className="py-2 px-3 text-right tabular-nums">₹{formatInr(room.total_charges)}</td>
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
                                <td className="py-2 px-3 text-right tabular-nums">₹{formatInr(p.total_amount)}</td>
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
                        <td className="py-2 px-3 text-right tabular-nums">₹{formatInr(doctor.total_charges)}</td>
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
                        <p className="text-xl font-bold text-green-700">₹{formatInr(medicineReport.summary.total_revenue)}</p>
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
                            <td className="py-2 px-3 text-right tabular-nums">₹{formatInr(item.total_revenue)}</td>
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
