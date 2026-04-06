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
  Percent,
  Ticket,
  Pencil,
  Trash2,
  Save,
  X,
} from 'lucide-react';
import {
  getBillWithDetails,
  searchBills,
  applyDiscount,
  addPayment,
  completeBill,
  getBillsForBillingPageDisplay,
  updateBillItem,
  removeBillItem,
} from '@/lib/services/billingService';
import { printBillReceipt, type BillDetailsForPrint } from '@/lib/printBill';
import { billItemProviderLabel } from '@/lib/billItemDisplay';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { Bill } from '@/types';

function buildPrintPayload(details: {
  bill: Bill;
  patient: Record<string, unknown> | null;
  animal: Record<string, unknown> | null;
  token: Record<string, unknown> | null;
  items: Record<string, unknown>[];
  payments: Record<string, unknown>[];
}): BillDetailsForPrint {
  const b = details.bill;
  return {
    bill: {
      bill_code: b.bill_code,
      total_amount: b.total_amount,
      discount_amount: b.discount_amount,
      discount_percent: b.discount_percent,
      final_amount: b.final_amount,
      paid_amount: b.paid_amount,
      payment_status: b.payment_status,
      status: b.status,
      payment_method: b.payment_method,
      completed_at: b.completed_at,
    },
    patient: details.patient as BillDetailsForPrint['patient'],
    animal: details.animal as BillDetailsForPrint['animal'],
    token: details.token as BillDetailsForPrint['token'],
    items: (details.items || []).map((item) => ({
      item_name: String(item.item_name ?? ''),
      room_name: item.room_name != null ? String(item.room_name) : undefined,
      operator_name: item.operator_name != null ? String(item.operator_name) : undefined,
      operator_id: item.operator_id != null ? Number(item.operator_id) : undefined,
      item_type: item.item_type != null ? String(item.item_type) : undefined,
      quantity: Number(item.quantity) || 0,
      unit_price: Number(item.unit_price) || 0,
      total_price: Number(item.total_price) || 0,
    })),
    payments: (details.payments || []).map((p) => ({
      amount: Number(p.amount) || 0,
      payment_method: String(p.payment_method ?? ''),
      received_by_name: p.received_by_name != null ? String(p.received_by_name) : undefined,
      created_at: p.created_at != null ? String(p.created_at) : undefined,
      transaction_id: p.transaction_id != null ? String(p.transaction_id) : undefined,
    })),
  };
}

function formatRupee(value: unknown): string {
  const n = Number(value);
  if (Number.isNaN(n)) return '0';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function billBalance(bill: { final_amount?: unknown; paid_amount?: unknown }): number {
  return Math.round((Number(bill.final_amount) || 0) * 100 - (Number(bill.paid_amount) || 0) * 100) / 100;
}

export function BillingModule() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [currentBill, setCurrentBill] = useState<any>(null);
  const [pendingBills, setPendingBills] = useState<any[]>([]);
  const [completedPaidBills, setCompletedPaidBills] = useState<any[]>([]);

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'online'>('cash');
  const [transactionId, setTransactionId] = useState('');

  // Discount form
  const [discountPercent, setDiscountPercent] = useState('');
  // Bill-item edit form
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemQty, setEditItemQty] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');

  useEffect(() => {
    loadBills();
  }, []);

  useEffect(() => {
    const b = currentBill?.bill;
    if (!b?.id) {
      setDiscountPercent('');
      return;
    }
    const p = Number(b.discount_percent);
    setDiscountPercent(Number.isFinite(p) && p > 0 ? String(p) : '');
  }, [currentBill?.bill?.id]);

  const loadBills = () => {
    const grouped = getBillsForBillingPageDisplay();
    setPendingBills(grouped.pending);
    setCompletedPaidBills(grouped.completedPaid);
  };

  const performSearch = (term: string) => {
    const t = term.trim();
    if (!t) {
      setSearchResults([]);
      return;
    }
    const results = searchBills(t);
    setSearchResults(results);
  };

  const handleSelectBill = (bill: any) => {
    const billId = Number(bill?.id);
    if (!Number.isFinite(billId)) return;

    // Optimistic render: allow payments even if getBillWithDetails fails.
    setCurrentBill({
      bill,
      patient: bill.owner_name
        ? { owner_name: bill.owner_name, owner_phone: bill.owner_phone ?? '' }
        : null,
      animal: bill.animal_name ? { name: bill.animal_name } : null,
      token: null,
      items: [],
      payments: [],
      medicalRecords: [],
    });

    try {
      const billDetails = getBillWithDetails(billId);
      if (billDetails) setCurrentBill(billDetails);
      else toast.error('Bill details not found, but you can still take payment.');

      loadBills();
      if (searchTerm.trim()) performSearch(searchTerm);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load bill details. Try again.');
    }
  };

  const handleApplyDiscount = () => {
    if (!currentBill || !discountPercent) return;

    const pct = parseFloat(discountPercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error('Enter discount between 0 and 100');
      return;
    }

    try {
      applyDiscount(currentBill.bill.id, pct);
      const updatedBill = getBillWithDetails(currentBill.bill.id);
      setCurrentBill(updatedBill);
      toast.success(pct === 0 ? 'Discount removed' : 'Discount updated');
      setDiscountPercent(pct === 0 ? '' : String(pct));
    } catch (error) {
      toast.error('Failed to apply discount');
    }
  };

  const handleRemoveBillDiscount = () => {
    if (!currentBill?.bill?.id) return;
    try {
      applyDiscount(currentBill.bill.id, 0);
      const updatedBill = getBillWithDetails(currentBill.bill.id);
      setCurrentBill(updatedBill);
      setDiscountPercent('');
      toast.success('Discount removed');
    } catch {
      toast.error('Failed to remove discount');
    }
  };

  const handleAddPayment = () => {
    if (!currentBill || !user) return;

    const amount = parseFloat(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    const remaining = billBalance(currentBill.bill);
    if (amount > remaining + 0.001) {
      toast.error(`Amount exceeds balance (Rs. ${formatRupee(remaining)})`);
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
      loadBills();
      toast.success('Payment recorded');

      setPaymentAmount('');
      setTransactionId('');
    } catch (error) {
      toast.error('Failed to record payment');
    }
  };

  const handlePayFullBalance = () => {
    if (!currentBill || !user) return;
    const remaining = billBalance(currentBill.bill);
    if (remaining <= 0) {
      toast.message('No balance due');
      return;
    }
    setPaymentAmount(String(remaining));
  };

  const handleCompleteBill = () => {
    if (!currentBill) return;

    const remaining = billBalance(currentBill.bill);
    if (remaining > 0.01) {
      toast.error(`Rs. ${formatRupee(remaining)} still due`);
      return;
    }

    const billId = currentBill.bill.id;

    try {
      const method = currentBill.bill.payment_method || paymentMethod || 'cash';
      completeBill(billId, method);
      const details = getBillWithDetails(billId);
      if (details) {
        const printed = printBillReceipt(buildPrintPayload(details));
        if (!printed) {
          toast.message(
            'Bill completed. Allow pop-ups to print the customer receipt, or use Print receipt below after selecting the bill again.'
          );
        } else {
          toast.success('Bill completed — print dialog opened for the customer.');
        }
      } else {
        toast.success('Bill completed successfully');
      }
      setCurrentBill(null);
      loadBills();
    } catch (error) {
      toast.error('Failed to complete bill');
    }
  };

  const handlePrintReceipt = () => {
    if (!currentBill?.bill?.id) return;
    const details = getBillWithDetails(currentBill.bill.id);
    if (!details) {
      toast.error('Could not load bill for printing');
      return;
    }
    const printed = printBillReceipt(buildPrintPayload(details));
    if (!printed) {
      toast.error('Pop-up blocked — allow pop-ups to print the receipt.');
    } else {
      toast.success('Receipt opened — use the print dialog to give a copy to the customer.');
    }
  };

  const refreshCurrentBill = (billId: number) => {
    const updatedBill = getBillWithDetails(billId);
    if (updatedBill) setCurrentBill(updatedBill);
    loadBills();
    if (searchTerm.trim()) performSearch(searchTerm);
  };

  const isLineItemEditLocked = (): boolean => {
    const paidAmount = Number(currentBill?.bill?.paid_amount ?? 0);
    const hasRecordedPayment = paidAmount > 0;
    return hasRecordedPayment;
  };

  const startEditItem = (item: any) => {
    if (isLineItemEditLocked()) {
      toast.error('Payment is already recorded. Editing line items is locked.');
      return;
    }
    setEditingItemId(Number(item.id));
    setEditItemName(String(item.item_name ?? ''));
    setEditItemQty(String(item.quantity ?? 1));
    setEditItemPrice(String(item.unit_price ?? 0));
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditItemName('');
    setEditItemQty('');
    setEditItemPrice('');
  };

  const handleSaveItemEdit = (itemId: number) => {
    if (!currentBill?.bill?.id) return;
    if (isLineItemEditLocked()) {
      toast.error('Payment is already recorded. Editing line items is locked.');
      cancelEditItem();
      return;
    }
    const name = editItemName.trim();
    const qty = parseInt(editItemQty, 10);
    const price = parseFloat(editItemPrice);
    if (!name) {
      toast.error('Item name is required');
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      toast.error('Quantity must be at least 1');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Unit price must be greater than 0');
      return;
    }

    try {
      const updated = updateBillItem(itemId, {
        item_name: name,
        quantity: qty,
        unit_price: price,
      });
      if (!updated) {
        toast.error('Line item not found');
        return;
      }
      refreshCurrentBill(currentBill.bill.id);
      cancelEditItem();
      toast.success('Line item updated');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update line item');
    }
  };

  const handleDeleteItem = (itemId: number) => {
    if (!currentBill?.bill?.id) return;
    if (isLineItemEditLocked()) {
      toast.error('Payment is already recorded. Deleting line items is locked.');
      return;
    }
    const ok = window.confirm('Delete this line item?');
    if (!ok) return;
    try {
      const removed = removeBillItem(itemId);
      if (!removed) {
        toast.error('Failed to delete line item');
        return;
      }
      if (editingItemId === itemId) cancelEditItem();
      refreshCurrentBill(currentBill.bill.id);
      toast.success('Line item deleted');
    } catch {
      toast.error('Failed to delete line item');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      partial: 'bg-secondary text-primary',
      paid: 'bg-green-100 text-green-800',
      active: 'bg-secondary text-primary',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const isPendingBill = (bill: any): boolean => {
    const billStatus = String(bill?.status ?? '').trim().toLowerCase();
    const payStatus = String(bill?.payment_status ?? '').trim().toLowerCase();
    return billStatus !== 'cancelled' && billStatus !== 'completed' && payStatus !== 'paid';
  };

  useEffect(() => {
    if (editingItemId != null && isLineItemEditLocked()) {
      cancelEditItem();
    }
  }, [currentBill?.bill?.paid_amount, editingItemId]);

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      <div className="w-full xl:w-96 shrink-0">
      {/* Search mode */}
      {searchTerm.trim() ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Search Bill
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-6 pb-6">
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Bill code, name, phone, or today’s token number…"
                  value={searchTerm}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSearchTerm(v);
                    if (!v.trim()) setSearchResults([]);
                    else performSearch(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') performSearch(searchTerm);
                  }}
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={() => performSearch(searchTerm)}>
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
              </div>

              {searchResults.length === 0 ? (
                <p className="text-sm text-slate-500">No matching bills.</p>
              ) : (
                (() => {
                  const pendingSearch = searchResults.filter(isPendingBill);
                  const paidSearch = searchResults.filter(
                    (b) => !isPendingBill(b) && String(b.status ?? '').toLowerCase() !== 'cancelled'
                  );
                  const defaultTab = pendingSearch.length > 0 ? 'pending' : 'paid';
                  return (
                    <Tabs
                      key={searchResults.map((b) => b.id).join(',')}
                      defaultValue={defaultTab}
                      className="w-full"
                    >
                      <TabsList className="mb-3 grid w-full grid-cols-2 h-auto p-1">
                        <TabsTrigger value="pending" className="py-2">
                          Pending ({pendingSearch.length})
                        </TabsTrigger>
                        <TabsTrigger value="paid" className="py-2">
                          Paid ({paidSearch.length})
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="pending" className="mt-0 max-h-[min(65vh,38rem)] overflow-y-auto pr-1">
                        {pendingSearch.length > 0 ? (
                          <div className="space-y-2">
                            {pendingSearch.map((bill) => (
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
                                      <p className="font-semibold">Rs. {formatRupee(bill.final_amount)}</p>
                                      <Badge className={getStatusBadge(bill.payment_status)}>
                                        {bill.payment_status}
                                      </Badge>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">No pending matches in this search.</p>
                        )}
                      </TabsContent>
                      <TabsContent value="paid" className="mt-0 max-h-[min(65vh,38rem)] overflow-y-auto pr-1">
                        {paidSearch.length > 0 ? (
                          <div className="space-y-2">
                            {paidSearch.map((bill) => (
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
                                      <p className="font-semibold">Rs. {formatRupee(bill.final_amount)}</p>
                                      <Badge className={getStatusBadge(bill.payment_status)}>
                                        {bill.payment_status}
                                      </Badge>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">No paid / completed matches in this search.</p>
                        )}
                      </TabsContent>
                    </Tabs>
                  );
                })()
              )}
            </CardContent>
          </Card>
      ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Bills
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-6 pb-6">
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Bill code, name, phone, or today’s token number…"
                  value={searchTerm}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSearchTerm(v);
                    if (!v.trim()) setSearchResults([]);
                    else performSearch(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') performSearch(searchTerm);
                  }}
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={() => performSearch(searchTerm)}>
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
              </div>

              {pendingBills.length === 0 && completedPaidBills.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No bills found</p>
                </div>
              ) : (
                <Tabs
                  defaultValue={pendingBills.length > 0 ? 'pending' : 'paid'}
                  className="w-full"
                >
                  <TabsList className="mb-3 grid w-full grid-cols-2 h-auto p-1">
                    <TabsTrigger value="pending" className="py-2">
                      Pending ({pendingBills.length})
                    </TabsTrigger>
                    <TabsTrigger value="paid" className="py-2">
                      Paid ({completedPaidBills.length})
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="pending" className="mt-0 max-h-[min(65vh,38rem)] overflow-y-auto pr-1">
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
                                  <p className="font-semibold">Rs. {formatRupee(bill.final_amount)}</p>
                                  <p className="text-xs text-slate-500">
                                    Paid: Rs. {formatRupee(bill.paid_amount)} · Due: Rs. 
                                    {formatRupee(billBalance(bill))}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No pending bills.</p>
                    )}
                  </TabsContent>
                  <TabsContent value="paid" className="mt-0 max-h-[min(65vh,38rem)] overflow-y-auto pr-1">
                    {completedPaidBills.length > 0 ? (
                      <div className="space-y-2">
                        {completedPaidBills.map((bill) => (
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
                                  <p className="font-semibold">Rs. {formatRupee(bill.final_amount)}</p>
                                  <Badge className={getStatusBadge(bill.payment_status)}>
                                    {bill.payment_status}
                                  </Badge>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No paid bills yet.</p>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
      )}
      </div>

      <div className="flex-1 min-w-0">
      {/* Bill Details */}
      {!currentBill && (
        <Card className="border-2 border-primary/25">
          <CardHeader className="bg-secondary/60">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Bill Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              Select a bill from the left to manage payment, discount, and completion.
            </p>
          </CardContent>
        </Card>
      )}
      {currentBill && (
        <Card className="border-2 border-primary/25">
          <CardHeader className="bg-secondary/60">
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
            <div className="flex flex-wrap items-center gap-4 pb-4 border-b">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-slate-400" />
                <span className="font-medium">{currentBill.patient?.owner_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <PawPrint className="w-5 h-5 text-slate-400" />
                <span>
                  {currentBill.animal?.name} ({currentBill.animal?.type})
                </span>
              </div>
              {currentBill.token?.token_number != null && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Ticket className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-medium">Token #{currentBill.token.token_number}</span>
                </div>
              )}
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
                      <th className="text-left py-2 px-4 text-sm font-medium">Provider</th>
                      <th className="text-right py-2 px-4 text-sm font-medium">Qty</th>
                      <th className="text-right py-2 px-4 text-sm font-medium">Price</th>
                      <th className="text-right py-2 px-4 text-sm font-medium">Total</th>
                      <th className="text-right py-2 px-4 text-sm font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentBill.items?.length ? (
                      currentBill.items.map((item: any) => (
                        <tr key={item.id} className="border-b border-slate-100">
                          {editingItemId === Number(item.id) ? (
                            <>
                              <td className="py-2 px-4 text-sm">
                                <Input
                                  value={editItemName}
                                  onChange={(e) => setEditItemName(e.target.value)}
                                  className="h-8"
                                />
                              </td>
                              <td className="py-2 px-4 text-sm text-slate-500">
                                {billItemProviderLabel(item)}
                              </td>
                              <td className="py-2 px-4 text-sm text-right">
                                <Input
                                  type="number"
                                  min="1"
                                  value={editItemQty}
                                  onChange={(e) => setEditItemQty(e.target.value)}
                                  className="h-8 w-20 ml-auto"
                                />
                              </td>
                              <td className="py-2 px-4 text-sm text-right">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={editItemPrice}
                                  onChange={(e) => setEditItemPrice(e.target.value)}
                                  className="h-8 w-28 ml-auto"
                                />
                              </td>
                              <td className="py-2 px-4 text-sm text-right">
                                Rs. 
                                {formatRupee(
                                  (Number(editItemQty) || 0) * (Number(editItemPrice) || 0)
                                )}
                              </td>
                              <td className="py-2 px-4">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8"
                                    onClick={() => handleSaveItemEdit(Number(item.id))}
                                  >
                                    <Save className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    onClick={cancelEditItem}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-2 px-4 text-sm">{item.item_name}</td>
                              <td className="py-2 px-4 text-sm text-slate-500">
                                {billItemProviderLabel(item)}
                              </td>
                              <td className="py-2 px-4 text-sm text-right">{item.quantity}</td>
                              <td className="py-2 px-4 text-sm text-right">Rs. {formatRupee(item.unit_price)}</td>
                              <td className="py-2 px-4 text-sm text-right">Rs. {formatRupee(item.total_price)}</td>
                              <td className="py-2 px-4">
                                {isLineItemEditLocked() ? (
                                  <span className="block text-right text-xs text-slate-400">Locked</span>
                                ) : (
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="outline"
                                      className="h-8 w-8"
                                      onClick={() => startEditItem(item)}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-red-600 hover:text-red-700"
                                      onClick={() => handleDeleteItem(Number(item.id))}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-6 px-4 text-sm text-center text-slate-500">
                          No charges yet — total will update when services are added.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bill Summary */}
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>Rs. {formatRupee(currentBill.bill.total_amount)}</span>
                </div>
                {Number(currentBill.bill.discount_amount) > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount ({currentBill.bill.discount_percent}%):</span>
                    <span>-Rs. {formatRupee(currentBill.bill.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg border-t pt-2">
                  <span>Total:</span>
                  <span>Rs. {formatRupee(currentBill.bill.final_amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Paid:</span>
                  <span className="text-green-600">Rs. {formatRupee(currentBill.bill.paid_amount)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span>Balance:</span>
                  <span className="text-red-600">Rs. {formatRupee(billBalance(currentBill.bill))}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              {/* Bill discount (%): add, change, or remove when the customer asks */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Percent className="w-4 h-4" />
                  Bill discount (%)
                </Label>
                <p className="text-xs text-slate-500">
                  Off the full bill subtotal (includes pharmacy items and all line items).
                </p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    placeholder="e.g. 10"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    className="min-w-[6rem] flex-1"
                  />
                  <Button type="button" onClick={handleApplyDiscount} variant="outline">
                    {Number(currentBill.bill.discount_percent) > 0 ? 'Update' : 'Apply'}
                  </Button>
                  {Number(currentBill.bill.discount_percent) > 0 && (
                    <Button type="button" onClick={handleRemoveBillDiscount} variant="secondary">
                      Remove
                    </Button>
                  )}
                </div>
              </div>

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
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" className="flex-1" onClick={handlePayFullBalance}>
                    Fill full balance (Rs. {formatRupee(billBalance(currentBill.bill))})
                  </Button>
                </div>
                <Button type="button" onClick={handleAddPayment} className="w-full">
                  Record Payment
                </Button>
              </div>
            </div>

            {/* Complete (prints customer receipt) & optional reprint */}
            <div className="flex flex-col sm:flex-row gap-2 pt-4">
              <Button type="button" onClick={handlePrintReceipt} variant="outline" className="flex-1">
                <Printer className="w-4 h-4 mr-2" />
                Print receipt
              </Button>
              <Button
                type="button"
                onClick={handleCompleteBill}
                className="flex-1"
                disabled={billBalance(currentBill.bill) > 0.01}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Complete bill &amp; print
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Completing a paid bill opens a clean receipt in a new window (like the queue token). Use &quot;Print receipt&quot; to reprint anytime.
            </p>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
