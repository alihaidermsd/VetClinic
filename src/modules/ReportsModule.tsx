import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, 
  Calendar, 
  Download, 
  Users,
  Pill
} from 'lucide-react';
import { 
  getDailyReport, 
  getDateRangeReport, 
  getDoctorReport, 
  getMedicineSalesReport
} from '@/lib/services/reportService';
import { toast } from 'sonner';

export function ReportsModule() {
  const [activeTab, setActiveTab] = useState('daily');
  const [dailyReport, setDailyReport] = useState<any>(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [rangeReport, setRangeReport] = useState<any>(null);
  const [doctorReport, setDoctorReport] = useState<any[]>([]);
  const [medicineReport, setMedicineReport] = useState<any>(null);

  useEffect(() => {
    loadDailyReport();
    loadDoctorReport();
    loadMedicineReport();
  }, []);

  const loadDailyReport = () => {
    const report = getDailyReport();
    setDailyReport(report);
  };

  const loadDateRangeReport = () => {
    if (!dateRange.start || !dateRange.end) {
      toast.error('Please select both start and end dates');
      return;
    }
    const report = getDateRangeReport(dateRange.start, dateRange.end);
    setRangeReport(report);
  };

  const loadDoctorReport = () => {
    const report = getDoctorReport();
    setDoctorReport(report);
  };

  const loadMedicineReport = () => {
    const report = getMedicineSalesReport();
    setMedicineReport(report);
  };

  const handleExport = (type: string) => {
    toast.info(`Exporting ${type} report...`);
    // In a real app, this would generate and download a file
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="daily">Daily Report</TabsTrigger>
          <TabsTrigger value="range">Date Range</TabsTrigger>
          <TabsTrigger value="doctors">Doctors</TabsTrigger>
          <TabsTrigger value="medicines">Medicines</TabsTrigger>
        </TabsList>

        {/* Daily Report */}
        <TabsContent value="daily" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Daily Report
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => handleExport('daily')}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </CardHeader>
            <CardContent>
              {dailyReport && (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-slate-500">Total Bills</p>
                        <p className="text-2xl font-bold">{dailyReport.total_bills}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-slate-500">Total Revenue</p>
                        <p className="text-2xl font-bold text-green-600">
                          ₹{dailyReport.total_revenue.toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-slate-500">Discount</p>
                        <p className="text-2xl font-bold text-orange-600">
                          ₹{dailyReport.total_discount.toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-slate-500">Net Revenue</p>
                        <p className="text-2xl font-bold text-blue-600">
                          ₹{dailyReport.net_revenue.toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Room-wise Breakdown */}
                  <div>
                    <h4 className="font-medium mb-3">Room-wise Revenue</h4>
                    <div className="bg-slate-50 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="text-left py-2 px-4 text-sm font-medium">Room</th>
                            <th className="text-right py-2 px-4 text-sm font-medium">Items</th>
                            <th className="text-right py-2 px-4 text-sm font-medium">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(dailyReport.room_wise?.length ? dailyReport.room_wise : []).map((room: any) => (
                            <tr key={`${room.room_id}-${room.room_name}`} className="border-b border-slate-100">
                              <td className="py-2 px-4">{room.room_name}</td>
                              <td className="py-2 px-4 text-right">{room.item_count}</td>
                              <td className="py-2 px-4 text-right">₹{room.total_charges.toLocaleString()}</td>
                            </tr>
                          ))}
                          {(!dailyReport.room_wise || dailyReport.room_wise.length === 0) && (
                            <tr>
                              <td colSpan={3} className="py-6 px-4 text-center text-slate-500 text-sm">
                                No line items for completed bills on this date.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Payment-wise Breakdown */}
                  <div>
                    <h4 className="font-medium mb-3">Payment Methods</h4>
                    <div className="bg-slate-50 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="text-left py-2 px-4 text-sm font-medium">Method</th>
                            <th className="text-right py-2 px-4 text-sm font-medium">Transactions</th>
                            <th className="text-right py-2 px-4 text-sm font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(dailyReport.payment_wise?.length ? dailyReport.payment_wise : []).map((payment: any) => (
                            <tr key={payment.payment_method} className="border-b border-slate-100">
                              <td className="py-2 px-4 capitalize">{payment.payment_method}</td>
                              <td className="py-2 px-4 text-right">{payment.count}</td>
                              <td className="py-2 px-4 text-right">₹{payment.total_amount.toLocaleString()}</td>
                            </tr>
                          ))}
                          {(!dailyReport.payment_wise || dailyReport.payment_wise.length === 0) && (
                            <tr>
                              <td colSpan={3} className="py-6 px-4 text-center text-slate-500 text-sm">
                                No payments recorded for this date.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Date Range Report */}
        <TabsContent value="range" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Date Range Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-6">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={loadDateRangeReport}>
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Generate
                  </Button>
                </div>
              </div>

              {rangeReport && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-slate-500">Total Bills</p>
                        <p className="text-2xl font-bold">{rangeReport.summary.total_bills}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-slate-500">Total Revenue</p>
                        <p className="text-2xl font-bold text-green-600">
                          ₹{rangeReport.summary.total_revenue.toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-slate-500">Discount</p>
                        <p className="text-2xl font-bold text-orange-600">
                          ₹{rangeReport.summary.total_discount.toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-slate-500">Net Revenue</p>
                        <p className="text-2xl font-bold text-blue-600">
                          ₹{rangeReport.summary.net_revenue.toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Daily Breakdown */}
                  <div>
                    <h4 className="font-medium mb-3">Daily Breakdown</h4>
                    <div className="bg-slate-50 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="text-left py-2 px-4 text-sm font-medium">Date</th>
                            <th className="text-right py-2 px-4 text-sm font-medium">Bills</th>
                            <th className="text-right py-2 px-4 text-sm font-medium">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(rangeReport.daily_breakdown?.length ? rangeReport.daily_breakdown : []).map((day: any) => (
                            <tr key={day.date} className="border-b border-slate-100">
                              <td className="py-2 px-4">{day.date}</td>
                              <td className="py-2 px-4 text-right">{day.bill_count}</td>
                              <td className="py-2 px-4 text-right">₹{day.revenue.toLocaleString()}</td>
                            </tr>
                          ))}
                          {(!rangeReport.daily_breakdown || rangeReport.daily_breakdown.length === 0) && (
                            <tr>
                              <td colSpan={3} className="py-6 px-4 text-center text-slate-500 text-sm">
                                No completed bills in this range.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Doctors Report */}
        <TabsContent value="doctors" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Doctor Performance
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => handleExport('doctors')}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-50 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left py-2 px-4 text-sm font-medium">Doctor</th>
                      <th className="text-right py-2 px-4 text-sm font-medium">Patients</th>
                      <th className="text-right py-2 px-4 text-sm font-medium">Total Charges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctorReport.map((doctor: any) => (
                      <tr key={`${doctor.doctor_id}-${doctor.doctor_name}`} className="border-b border-slate-100">
                        <td className="py-2 px-4">{doctor.doctor_name}</td>
                        <td className="py-2 px-4 text-right">{doctor.total_patients}</td>
                        <td className="py-2 px-4 text-right">₹{doctor.total_charges.toLocaleString()}</td>
                      </tr>
                    ))}
                    {doctorReport.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-6 px-4 text-center text-slate-500 text-sm">
                          No consultation charges on completed bills yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Medicines Report */}
        <TabsContent value="medicines" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Pill className="w-5 h-5" />
                Medicine Sales
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => handleExport('medicines')}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </CardHeader>
            <CardContent>
              {medicineReport && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-slate-500">Total Sales</p>
                        <p className="text-2xl font-bold">{medicineReport.summary.total_sales}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-slate-500">Total Revenue</p>
                        <p className="text-2xl font-bold text-green-600">
                          ₹{medicineReport.summary.total_revenue.toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <div>
                    <h4 className="font-medium mb-3">Item-wise Sales</h4>
                    <div className="bg-slate-50 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="text-left py-2 px-4 text-sm font-medium">Item</th>
                            <th className="text-right py-2 px-4 text-sm font-medium">Quantity</th>
                            <th className="text-right py-2 px-4 text-sm font-medium">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(medicineReport.item_wise?.length ? medicineReport.item_wise : []).map((item: any) => (
                            <tr key={item.item_name} className="border-b border-slate-100">
                              <td className="py-2 px-4">{item.item_name}</td>
                              <td className="py-2 px-4 text-right">{item.total_quantity}</td>
                              <td className="py-2 px-4 text-right">₹{item.total_revenue.toLocaleString()}</td>
                            </tr>
                          ))}
                          {(!medicineReport.item_wise || medicineReport.item_wise.length === 0) && (
                            <tr>
                              <td colSpan={3} className="py-6 px-4 text-center text-slate-500 text-sm">
                                No medicine sales on completed bills yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
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
