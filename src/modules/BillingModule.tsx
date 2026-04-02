import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  CreditCard, 
  Printer, 
  CheckCircle,
  Clock,
  User,
  PawPrint,
  Receipt,
  Percent
} from 'lucide-react';
import { getBillWithDetails, searchBills, applyDiscount, addPayment, completeBill } from '@/lib/services/billingService';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function BillingModule() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [currentBill, setCurrentBill] = useState<any>(null);
  const [pendingBills, setPendingBills] = useState<any[]>([]);

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'online'>('cash');
  const [transactionId, setTransactionId] = useState('');

  // Discount form
  const [discountPercent, setDiscountPercent] = useState('');

  useEffect(() => {
    loadPendingBills();
  }, []);

  const loadPendingBills = () => {
    const bills = searchBills('');
    setPendingBills(bills.filter((b: any) => b.status === 'active').slice(0, 10));
  };

  const handleSearch = () => {
    if (!searchTerm.trim()) return;
    
    const results = searchBills(searchTerm);
    setSearchResults(results);
  };

  const handleSelectBill = (bill: any) => {
    const billDetails = getBillWithDetails(bill.id);
    if (billDetails) {
      setCurrentBill(billDetails);
      setSearchResults([]);
      setSearchTerm('');
    }
  };

  const handleApplyDiscount = () => {
    if (!currentBill || !discountPercent) return;

    try {
      applyDiscount(currentBill.bill.id, parseFloat(discountPercent));
      const updatedBill = getBillWithDetails(currentBill.bill.id);
      setCurrentBill(updatedBill);
      toast.success('Discount applied');
      setDiscountPercent('');
    } catch (error) {
      toast.error('Failed to apply discount');
    }
  };

  const handleAddPayment = () => {
    if (!currentBill || !paymentAmount || !user) return;

    const amount = parseFloat(paymentAmount);
    const remaining = currentBill.bill.final_amount - currentBill.bill.paid_amount;

    if (amount > remaining) {
      toast.error(`Amount exceeds remaining balance (₹${remaining})`);
      return;
    }

    try {
      addPayment(
        currentBill.bill.id,
        {
          amount,
          payment_method: paymentMethod,
          transaction_id: transactionId,
        },
        user.id,
        user.name
      );

      const updatedBill = getBillWithDetails(currentBill.bill.id);
      setCurrentBill(updatedBill);
      toast.success('Payment recorded');
      
      setPaymentAmount('');
      setTransactionId('');
    } catch (error) {
      toast.error('Failed to record payment');
    }
  };

  const handleCompleteBill = () => {
    if (!currentBill) return;

    const remaining = currentBill.bill.final_amount - currentBill.bill.paid_amount;
    if (remaining > 0) {
      toast.error(`₹${remaining} still pending`);
      return;
    }

    try {
      completeBill(currentBill.bill.id, currentBill.bill.payment_method);
      toast.success('Bill completed successfully');
      setCurrentBill(null);
      loadPendingBills();
    } catch (error) {
      toast.error('Failed to complete bill');
    }
  };

  const handlePrintInvoice = () => {
    toast.info('Printing invoice...');
    // In a real app, this would trigger a print dialog
    window.print();
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      partial: 'bg-blue-100 text-blue-800',
      paid: 'bg-green-100 text-green-800',
      active: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="search">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="search">Search Bill</TabsTrigger>
          <TabsTrigger value="pending">Pending Bills</TabsTrigger>
        </TabsList>

        {/* Search Tab */}
        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Search Bill
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Search by bill code, patient name, or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
                />
                <Button onClick={handleSearch}>
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium text-slate-900">Search Results</h3>
                  {searchResults.map((bill) => (
                    <Card 
                      key={bill.id} 
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => handleSelectBill(bill)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{bill.bill_code}</p>
                            <p className="text-sm text-slate-500">{bill.owner_name}</p>
                            <p className="text-sm text-slate-600">{bill.animal_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">₹{bill.final_amount}</p>
                            <Badge className={getStatusBadge(bill.payment_status)}>
                              {bill.payment_status}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pending Bills Tab */}
        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Pending Bills
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingBills.length > 0 ? (
                <div className="space-y-2">
                  {pendingBills.map((bill) => (
                    <Card 
                      key={bill.id} 
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => handleSelectBill(bill)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{bill.bill_code}</p>
                            <p className="text-sm text-slate-500">{bill.owner_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">₹{bill.final_amount}</p>
                            <p className="text-xs text-slate-500">
                              Paid: ₹{bill.paid_amount}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No pending bills</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bill Details */}
      {currentBill && (
        <Card className="border-2 border-blue-200">
          <CardHeader className="bg-blue-50">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Receipt className="w-5 h-5" />
                Bill Details
              </CardTitle>
              <Badge className={getStatusBadge(currentBill.bill.payment_status)}>
                {currentBill.bill.payment_status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Patient Info */}
            <div className="flex items-center gap-4 pb-4 border-b">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-slate-400" />
                <span className="font-medium">{currentBill.patient?.owner_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <PawPrint className="w-5 h-5 text-slate-400" />
                <span>{currentBill.animal?.name} ({currentBill.animal?.type})</span>
              </div>
              <div className="ml-auto">
                <span className="text-sm text-slate-500">Bill: {currentBill.bill?.bill_code}</span>
              </div>
            </div>

            {/* Bill Items */}
            <div>
              <h4 className="font-medium mb-2">Bill Items</h4>
              <div className="bg-slate-50 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left py-2 px-4 text-sm font-medium">Item</th>
                      <th className="text-left py-2 px-4 text-sm font-medium">Room</th>
                      <th className="text-right py-2 px-4 text-sm font-medium">Qty</th>
                      <th className="text-right py-2 px-4 text-sm font-medium">Price</th>
                      <th className="text-right py-2 px-4 text-sm font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentBill.items?.map((item: any) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="py-2 px-4 text-sm">{item.item_name}</td>
                        <td className="py-2 px-4 text-sm text-slate-500">{item.room_name}</td>
                        <td className="py-2 px-4 text-sm text-right">{item.quantity}</td>
                        <td className="py-2 px-4 text-sm text-right">₹{item.unit_price}</td>
                        <td className="py-2 px-4 text-sm text-right">₹{item.total_price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bill Summary */}
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>₹{currentBill.bill.total_amount}</span>
                </div>
                {currentBill.bill.discount_amount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount ({currentBill.bill.discount_percent}%):</span>
                    <span>-₹{currentBill.bill.discount_amount}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg border-t pt-2">
                  <span>Total:</span>
                  <span>₹{currentBill.bill.final_amount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Paid:</span>
                  <span className="text-green-600">₹{currentBill.bill.paid_amount}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span>Balance:</span>
                  <span className="text-red-600">
                    ₹{currentBill.bill.final_amount - currentBill.bill.paid_amount}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              {/* Apply Discount */}
              {currentBill.bill.discount_percent === 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Percent className="w-4 h-4" />
                    Apply Discount
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Discount %"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={handleApplyDiscount} variant="outline">
                      Apply
                    </Button>
                  </div>
                </div>
              )}

              {/* Add Payment */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Add Payment
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="flex-1"
                  />
                  <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {paymentMethod !== 'cash' && (
                  <Input
                    placeholder="Transaction ID"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                  />
                )}
                <Button onClick={handleAddPayment} className="w-full">
                  Record Payment
                </Button>
              </div>
            </div>

            {/* Complete & Print */}
            <div className="flex gap-2 pt-4">
              <Button onClick={handlePrintInvoice} variant="outline" className="flex-1">
                <Printer className="w-4 h-4 mr-2" />
                Print Invoice
              </Button>
              <Button 
                onClick={handleCompleteBill} 
                className="flex-1"
                disabled={currentBill.bill.final_amount - currentBill.bill.paid_amount > 0}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Complete Bill
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
