import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, 
  Pill, 
  Plus, 
  ShoppingCart, 
  Minus,
  Trash2,
  Pencil,
  Save,
  Package,
  Percent,
  ListOrdered,
  RefreshCw,
  X,
} from 'lucide-react';
import { getPharmacyItems, searchInventory, getInventoryItemById } from '@/lib/services/inventoryService';
import {
  getPendingBillsForDisplay,
  searchBills,
  getBillWithDetails,
  addBillItem,
  applyDiscount,
  updateBillItem,
  removeBillItem,
} from '@/lib/services/billingService';
import { getRoomsByType } from '@/lib/services/roomService';
import {
  getWaitingTokensByRoomType,
  getTokenById,
  activateReferralAtRoom,
  hasPendingReferralToRoom,
  completeOperatorRoomVisit,
} from '@/lib/services/tokenService';
import type { RoomQueueItem } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { billItemProviderLabel } from '@/lib/billItemDisplay';

interface CartItem {
  inventory_id: number;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

function formatRupee(value: unknown): string {
  const n = Number(value);
  if (Number.isNaN(n)) return '0';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function PharmacyModule() {
  type QueueTab = 'waiting' | 'in_progress' | 'completed' | 'all';
  const { user } = useAuth();
  const [currentBill, setCurrentBill] = useState<any>(null);
  const [dispenseBills, setDispenseBills] = useState<any[]>([]);
  const [billSearch, setBillSearch] = useState('');
  const [billSearchResults, setBillSearchResults] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [pharmacyItems, setPharmacyItems] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState('');
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemQty, setEditItemQty] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [referralQueue, setReferralQueue] = useState<RoomQueueItem[]>([]);
  const [queueTab, setQueueTab] = useState<QueueTab>('all');

  const refreshReferralQueue = () => {
    try {
      setReferralQueue(getWaitingTokensByRoomType('pharmacy'));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadPharmacyItems();
    loadDispenseBills();
  }, []);

  useEffect(() => {
    refreshReferralQueue();
    const t = setInterval(refreshReferralQueue, 15000);
    return () => clearInterval(t);
  }, []);

  const loadPharmacyItems = () => {
    const items = getPharmacyItems();
    setPharmacyItems(items);
  };

  const isBillPendingForPharmacy = (b: any) => {
    const billStatus = String(b?.status ?? '').trim().toLowerCase();
    const payStatus = String(b?.payment_status ?? '').trim().toLowerCase();
    return billStatus !== 'completed' && billStatus !== 'cancelled' && payStatus !== 'paid';
  };

  const visitLocked =
    !currentBill?.bill ||
    !isBillPendingForPharmacy(currentBill?.bill) ||
    currentBill?.token?.status === 'completed' ||
    currentBill?.token?.status === 'cancelled';

  const visibleReferralQueue =
    queueTab === 'all'
      ? referralQueue
      : referralQueue.filter((row) => row.status === queueTab);

  const canModifyBillItem = (item: any): boolean => {
    if (!user) return false;
    if (visitLocked) return false;
    if (user.role === 'admin') return true;
    const sameId = Number(item?.operator_id) === Number(user.id);
    const sameName =
      String(item?.operator_name ?? '').trim().toLowerCase() ===
      String(user?.name ?? '').trim().toLowerCase();
    return sameId || sameName;
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditItemName('');
    setEditItemQty('');
    setEditItemPrice('');
  };

  const startEditItem = (item: any) => {
    const itemId = Number(item?.id);
    if (!Number.isFinite(itemId)) return;

    setEditingItemId(itemId);
    setEditItemName(String(item?.item_name ?? ''));
    setEditItemQty(String(Number(item?.quantity ?? 1) || 1));

    const unit = item?.unit_price != null ? Number(item.unit_price) : 0;
    setEditItemPrice(String(Number(unit) || 0));
  };

  const handleSaveItemEdit = (itemId: number) => {
    if (!currentBill?.bill?.id) return;
    const item = currentBill?.items?.find((i: any) => Number(i?.id) === Number(itemId));
    if (!item) {
      toast.error('Line item not found');
      return;
    }
    if (!canModifyBillItem(item)) {
      toast.error('You can edit only the lines you created');
      return;
    }
    if (visitLocked) return;

    const name = editItemName.trim();
    const qty = parseInt(editItemQty, 10);
    const unitPrice = parseFloat(String(editItemPrice).replace(/,/g, ''));

    if (!name) {
      toast.error('Item name is required');
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      toast.error('Quantity must be at least 1');
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      toast.error('Unit price must be greater than 0');
      return;
    }

    try {
      updateBillItem(itemId, { item_name: name, quantity: qty, unit_price: unitPrice });
      const updatedBill = getBillWithDetails(currentBill.bill.id);
      if (updatedBill) setCurrentBill(updatedBill);
      cancelEditItem();
      toast.success('Line item updated');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update line item');
    }
  };

  const handleDeleteItem = (itemId: number) => {
    if (!currentBill?.bill?.id) return;
    const item = currentBill?.items?.find((i: any) => Number(i?.id) === Number(itemId));
    if (!item) {
      toast.error('Line item not found');
      return;
    }
    if (!canModifyBillItem(item)) {
      toast.error('You can delete only the lines you created');
      return;
    }
    if (visitLocked) return;

    const ok = window.confirm('Delete this line item?');
    if (!ok) return;

    try {
      const removed = removeBillItem(itemId);
      if (!removed) {
        toast.error('Failed to delete line item');
        return;
      }
      if (editingItemId === itemId) cancelEditItem();
      const updatedBill = getBillWithDetails(currentBill.bill.id);
      if (updatedBill) setCurrentBill(updatedBill);
      toast.success('Line item deleted');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete line item');
    }
  };

  const loadDispenseBills = () => {
    const pending = getPendingBillsForDisplay();
    setDispenseBills(pending);
    setBillSearchResults([]);
  };

  const handleOpenReferralQueueRow = (row: RoomQueueItem) => {
    const token = getTokenById(row.token_id);
    if (!token) {
      toast.error('Token no longer available');
      refreshReferralQueue();
      return;
    }
    const pharmacyRooms = getRoomsByType('pharmacy');
    const pharmacyRoom = pharmacyRooms[0];
    if (!pharmacyRoom?.id) {
      toast.error('No Pharmacy room configured. Add it under Admin → Rooms.');
      return;
    }
    if (hasPendingReferralToRoom(token.id, pharmacyRoom.id) && Number(token.room_id) !== pharmacyRoom.id) {
      activateReferralAtRoom(token.id, pharmacyRoom.id);
    }
    const details = getBillWithDetails(token.bill_id);
    if (!details) {
      toast.error('Failed to load bill details');
      return;
    }
    setCurrentBill(details);
    setCart([]);
    setSearchResults([]);
    setSearchTerm('');
    const p = Number(details.bill?.discount_percent);
    setDiscountPercent(Number.isFinite(p) && p > 0 ? String(p) : '');
    toast.success(`Bill loaded for token #${token.token_number}`);
    refreshReferralQueue();
  };

  const handleCompletePharmacyReferral = () => {
    if (!currentBill?.token?.id || !currentBill?.bill?.id) {
      toast.error('No token for this bill');
      return;
    }
    const pharmacyRooms = getRoomsByType('pharmacy');
    const pharmacyRoom = pharmacyRooms[0];
    if (!pharmacyRoom?.id) {
      toast.error('No Pharmacy room configured');
      return;
    }
    const tid = currentBill.token.id;
    const tok = getTokenById(tid);
    if (!tok) {
      toast.error('Token no longer available');
      return;
    }
    const atPharmacy = Number(tok.room_id) === Number(pharmacyRoom.id);
    const hasPharmacyRef = hasPendingReferralToRoom(tid, pharmacyRoom.id);
    if (!hasPharmacyRef && !atPharmacy) {
      toast.error('No active pharmacy step for this visit — open a patient from the queue on the left.');
      return;
    }
    const result = completeOperatorRoomVisit(tid, pharmacyRoom.id);
    if (result.legacyCompleted) {
      toast.success('Visit completed');
    } else if (result.returnedToDoctor) {
      toast.success('Pharmacy step done — patient returned to doctor queue');
    } else if (result.moreReferralsPending) {
      toast.success('Pharmacy step done — patient has other referrals today');
    } else {
      toast.success('Pharmacy referral completed');
    }
    const updated = getBillWithDetails(currentBill.bill.id);
    if (updated) setCurrentBill(updated);
    refreshReferralQueue();
    loadDispenseBills();
  };

  const handleSearchBillsForDispense = () => {
    const term = billSearch.trim();
    if (!term) {
      setBillSearchResults([]);
      return;
    }

    // searchBills returns enriched bills; filter to pending for safe dispensing
    const results = searchBills(term).filter(isBillPendingForPharmacy);
    setBillSearchResults(results);
  };

  const handleSelectBillForDispense = (bill: any) => {
    const details = getBillWithDetails(bill.id);
    if (!details) {
      toast.error('Failed to load bill details');
      return;
    }
    setCurrentBill(details);
    setCart([]);
    setSearchResults([]);
    setSearchTerm('');
    const p = Number(details.bill?.discount_percent);
    setDiscountPercent(Number.isFinite(p) && p > 0 ? String(p) : '');
    toast.success('Bill loaded for dispensing');
    refreshReferralQueue();
  };

  const handleApplyDiscount = () => {
    if (!currentBill?.bill?.id) return;
    const pct = parseFloat(discountPercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error('Enter a discount between 0 and 100');
      return;
    }
    try {
      applyDiscount(currentBill.bill.id, pct);
      const updated = getBillWithDetails(currentBill.bill.id);
      if (updated) setCurrentBill(updated);
      toast.success(pct === 0 ? 'Discount removed from bill' : 'Discount updated on bill');
      setDiscountPercent(pct === 0 ? '' : String(pct));
    } catch {
      toast.error('Could not apply discount');
    }
  };

  const handleRemoveBillDiscount = () => {
    if (!currentBill?.bill?.id) return;
    try {
      applyDiscount(currentBill.bill.id, 0);
      const updated = getBillWithDetails(currentBill.bill.id);
      if (updated) setCurrentBill(updated);
      setDiscountPercent('');
      toast.success('Discount removed from bill');
    } catch {
      toast.error('Could not remove discount');
    }
  };

  const handleSearchItems = () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const results = searchInventory(searchTerm);
    setSearchResults(results.filter((item: any) => item.stock_quantity > 0));
  };

  const addToCart = (item: any) => {
    const existingItem = cart.find((c) => c.inventory_id === item.id);
    
    if (existingItem) {
      if (existingItem.quantity >= item.stock_quantity) {
        toast.error('Not enough stock');
        return;
      }
      setCart(cart.map((c) => 
        c.inventory_id === item.id 
          ? { ...c, quantity: c.quantity + 1, total_price: (c.quantity + 1) * c.unit_price }
          : c
      ));
    } else {
      setCart([...cart, {
        inventory_id: item.id,
        name: item.name,
        quantity: 1,
        unit_price: item.selling_price,
        total_price: item.selling_price,
      }]);
    }
    toast.success(`${item.name} added to cart`);
  };

  const updateQuantity = (inventoryId: number, delta: number) => {
    const item = cart.find((c) => c.inventory_id === inventoryId);
    if (!item) return;

    const inventoryItem = getInventoryItemById(inventoryId);
    if (!inventoryItem) return;

    const newQuantity = item.quantity + delta;
    
    if (newQuantity <= 0) {
      setCart(cart.filter((c) => c.inventory_id !== inventoryId));
    } else if (newQuantity > inventoryItem.stock_quantity) {
      toast.error('Not enough stock');
    } else {
      setCart(cart.map((c) => 
        c.inventory_id === inventoryId 
          ? { ...c, quantity: newQuantity, total_price: newQuantity * c.unit_price }
          : c
      ));
    }
  };

  const removeFromCart = (inventoryId: number) => {
    setCart(cart.filter((c) => c.inventory_id !== inventoryId));
  };

  const handleAddToBill = () => {
    if (!currentBill || !user || cart.length === 0) return;

    const pharmacyRooms = getRoomsByType('pharmacy');
    const pharmacyRoom = pharmacyRooms[0];
    const roomId = pharmacyRoom?.id ?? 0;
    const roomName = pharmacyRoom?.name ?? 'Pharmacy';

    try {
      for (const item of cart) {
        addBillItem(
          currentBill.bill.id,
          {
            item_name: item.name,
            item_type: 'medicine',
            quantity: item.quantity,
            // Use the cart unit_price (comes from inventory.selling_price)
            unit_price: item.unit_price,
            inventory_id: item.inventory_id,
          },
          roomId,
          roomName,
          user.id,
          user.name
        );
      }

      const updatedBill = getBillWithDetails(currentBill.bill.id);
      setCurrentBill(updatedBill);

      toast.success('Items added to bill');
      setCart([]);
      loadPharmacyItems();
      loadDispenseBills();
      refreshReferralQueue();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add items (check stock)');
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.total_price, 0);

  const pharmacyRoom = getRoomsByType('pharmacy')[0];
  const showCompletePharmacyStep =
    currentBill?.token?.id != null &&
    pharmacyRoom != null &&
    (() => {
      const tid = currentBill.token.id;
      const tok = getTokenById(tid);
      if (!tok) return false;
      const atPharmacy = Number(tok.room_id) === Number(pharmacyRoom.id);
      return hasPendingReferralToRoom(tid, pharmacyRoom.id) || atPharmacy;
    })();

  return (
    <div className="space-y-6">
      <Tabs defaultValue="dispense">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="dispense">Dispense Medicines</TabsTrigger>
          <TabsTrigger value="browse">Browse Items</TabsTrigger>
        </TabsList>

        {/* Dispense Tab */}
        <TabsContent value="dispense" className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
            <div className="xl:col-span-1 space-y-4">
            {/* Bills side panel */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Search className="w-5 h-5" />
                  Dispense Medicines
                </CardTitle>
                <p className="text-sm text-slate-500">
                  Select a bill, then search medicines and dispense.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-3">
                  <Input
                    placeholder="Search bills (code/name/phone)..."
                    value={billSearch}
                    onChange={(e) => setBillSearch(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearchBillsForDispense()}
                    className="flex-1"
                  />
                  <Button type="button" onClick={handleSearchBillsForDispense}>
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </Button>
                </div>

                <div className="max-h-[min(70vh,32rem)] overflow-y-auto space-y-1 pr-1 -mr-1">
                  {(
                    (billSearch.trim() ? billSearchResults : dispenseBills) || []
                  ).length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">No bills found.</p>
                  ) : (
                    (billSearch.trim() ? billSearchResults : dispenseBills).map((bill: any) => {
                      const active = currentBill?.bill?.id === bill.id;
                      return (
                        <button
                          key={bill.id}
                          type="button"
                          onClick={() => handleSelectBillForDispense(bill)}
                          className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                            active
                              ? 'border-emerald-300 bg-emerald-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900">
                              {bill.bill_code}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase"
                            >
                              {bill.payment_status}
                            </Badge>
                          </div>
                          <p className="text-slate-700 truncate mt-0.5">
                            {bill.owner_name}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{bill.animal_name}</p>
                        </button>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-violet-200 bg-violet-50/40 self-start xl:fixed xl:top-4 xl:right-4 xl:w-[22rem]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ListOrdered className="w-5 h-5 text-violet-700" />
                    Pharmacy queue (today)
                  </CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8"
                    onClick={refreshReferralQueue}
                    title="Refresh queue"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-sm text-slate-600">
                  Doctor referrals and direct walk-ins from reception. Click a row to load their bill.
                </p>
              </CardHeader>
              <CardContent>
                <Tabs value={queueTab} onValueChange={(v) => setQueueTab(v as QueueTab)} className="mb-3">
                  <TabsList className="w-full grid grid-cols-4 h-auto p-1 gap-1">
                    <TabsTrigger value="waiting" className="text-xs px-1.5 py-2">Waiting</TabsTrigger>
                    <TabsTrigger value="in_progress" className="text-xs px-1.5 py-2">In progress</TabsTrigger>
                    <TabsTrigger value="completed" className="text-xs px-1.5 py-2">Completed</TabsTrigger>
                    <TabsTrigger value="all" className="text-xs px-1.5 py-2">All</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1 -mr-1">
                  {visibleReferralQueue.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">No patients in pharmacy queue.</p>
                  ) : (
                    visibleReferralQueue.map((row) => (
                      <button
                        key={row.token_id}
                        type="button"
                        onClick={() => handleOpenReferralQueueRow(row)}
                        className="w-full text-left rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm hover:bg-violet-50/80 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">Token #{row.token_number}</span>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {row.status}
                          </Badge>
                        </div>
                        <p className="text-slate-700 truncate mt-0.5">{row.patient_name}</p>
                        <p className="text-xs text-slate-500 truncate">{row.animal_name}</p>
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
            </div>

            {/* Current bill / cart */}
            <div className="xl:col-span-2 space-y-4">
              {currentBill ? (
                <>
                  <Card className="bg-green-50 border-green-200">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold">{currentBill.bill.bill_code}</p>
                          <p className="text-sm text-slate-600">
                            {currentBill.patient?.owner_name} - {currentBill.animal?.name}
                          </p>
                          {currentBill.token?.token_number != null && (
                            <p className="text-xs text-slate-500 mt-1">
                              Token #{currentBill.token.token_number}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col sm:items-end gap-2 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCurrentBill(null);
                              setCart([]);
                              setSearchResults([]);
                              setSearchTerm('');
                              setDiscountPercent('');
                            }}
                          >
                            Change
                          </Button>
                          {showCompletePharmacyStep && (
                            <Button type="button" size="sm" onClick={handleCompletePharmacyReferral}>
                              Complete pharmacy visit
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-amber-100 bg-amber-50/50">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3">
                        <div>
                          <Label htmlFor="ph-discount" className="flex items-center gap-2 text-slate-800">
                            <Percent className="w-4 h-4" />
                            Bill discount (%)
                          </Label>
                          <p className="text-xs text-slate-600 mt-1">
                            Percentage off the whole bill (medicines, food, and any other charges). Update or remove if
                            the customer asks.
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2">
                          <Input
                            id="ph-discount"
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            placeholder="e.g. 10"
                            value={discountPercent}
                            onChange={(e) => setDiscountPercent(e.target.value)}
                            className="max-w-[10rem] bg-white"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="secondary" onClick={handleApplyDiscount}>
                              {Number(currentBill.bill?.discount_percent) > 0 ? 'Update discount' : 'Apply discount'}
                            </Button>
                            {Number(currentBill.bill?.discount_percent) > 0 && (
                              <Button type="button" variant="outline" onClick={handleRemoveBillDiscount}>
                                Remove discount
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Item Search */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Search className="w-5 h-5" />
                          Search Items
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex gap-2 mb-4">
                          <Input
                            placeholder="Search medicines or food..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSearchItems()}
                            className="flex-1"
                          />
                          <Button onClick={handleSearchItems}>
                            <Search className="w-4 h-4 mr-2" />
                            Search
                          </Button>
                        </div>

                        {/* Search Results */}
                        {searchResults.length > 0 && (
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {searchResults.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                              >
                                <div>
                                  <p className="font-medium">{item.name}</p>
                                  <p className="text-sm text-slate-500">
                                    Stock: {item.stock_quantity} | Rs. {item.selling_price}
                                  </p>
                                </div>
                                <Button size="sm" onClick={() => addToCart(item)}>
                                  <Plus className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Quick Items */}
                        <div className="mt-4">
                          <h4 className="font-medium mb-2">Quick Select</h4>
                          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                            {pharmacyItems.slice(0, 10).map((item) => (
                              <Button
                                key={item.id}
                                variant="outline"
                                size="sm"
                                onClick={() => addToCart(item)}
                                className="justify-start"
                              >
                                <Pill className="w-4 h-4 mr-2" />
                                {item.name}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Shopping Cart */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <ShoppingCart className="w-5 h-5" />
                          Cart
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {cart.length > 0 ? (
                          <>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {cart.map((item) => (
                                <div
                                  key={item.inventory_id}
                                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                                >
                                  <div className="flex-1">
                                    <p className="font-medium">{item.name}</p>
                                    <p className="text-sm text-slate-500">Rs. {item.unit_price} each</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => updateQuantity(item.inventory_id, -1)}
                                    >
                                      <Minus className="w-4 h-4" />
                                    </Button>
                                    <span className="w-8 text-center">{item.quantity}</span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => updateQuantity(item.inventory_id, 1)}
                                    >
                                      <Plus className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => removeFromCart(item.inventory_id)}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 pt-4 border-t">
                              <div className="flex justify-between items-center mb-4">
                                <span className="font-semibold">Total:</span>
                                <span className="text-xl font-bold">Rs. {cartTotal}</span>
                              </div>
                              <Button onClick={handleAddToBill} className="w-full">
                                Add to Bill
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-8 text-slate-500">
                            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>Cart is empty</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Current bill items & summary (read-only) */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Package className="w-4 h-4" />
                        Bill Items (after dispensing)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b border-slate-200">
                            <tr>
                              <th className="text-left py-2 font-medium text-slate-600">Item</th>
                              <th className="text-left py-2 font-medium text-slate-600">Provider</th>
                              <th className="text-right py-2 font-medium text-slate-600">Qty</th>
                              <th className="text-right py-2 font-medium text-slate-600">Price</th>
                              <th className="text-right py-2 font-medium text-slate-600">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentBill.items?.length ? (
                              currentBill.items.map((item: any) => {
                                const itemId = Number(item?.id);
                                const isEditing = editingItemId === itemId;
                                const canEdit = canModifyBillItem(item);

                                const qtyNum = isEditing ? parseInt(editItemQty, 10) : Number(item?.quantity);
                                const unitNum = isEditing
                                  ? parseFloat(String(editItemPrice).replace(/,/g, ''))
                                  : Number(item?.unit_price);
                                const totalNum = Number.isFinite(qtyNum) && Number.isFinite(unitNum) ? qtyNum * unitNum : 0;

                                return (
                                  <tr key={item.id} className="border-b border-slate-100">
                                    <td className="py-2">
                                      {isEditing ? (
                                        <Input
                                          value={editItemName}
                                          onChange={(e) => setEditItemName(e.target.value)}
                                          disabled={visitLocked}
                                          className="h-8 w-56"
                                        />
                                      ) : (
                                        item.item_name
                                      )}
                                    </td>
                                    <td className="py-2 text-slate-500">{billItemProviderLabel(item)}</td>
                                    <td className="py-2 text-right">
                                      {isEditing ? (
                                        <Input
                                          type="number"
                                          min={1}
                                          value={editItemQty}
                                          onChange={(e) => setEditItemQty(e.target.value)}
                                          disabled={visitLocked}
                                          className="h-8 w-20 ml-auto"
                                        />
                                      ) : (
                                        item.quantity
                                      )}
                                    </td>
                                    <td className="py-2 text-right">
                                      {isEditing ? (
                                        <Input
                                          type="number"
                                          min={0}
                                          step={0.01}
                                          value={editItemPrice}
                                          onChange={(e) => setEditItemPrice(e.target.value)}
                                          disabled={visitLocked}
                                          className="h-8 w-28"
                                        />
                                      ) : (
                                        `Rs. ${formatRupee(item.unit_price)}`
                                      )}
                                    </td>
                                    <td className="py-2 text-right">
                                      {isEditing ? (
                                        <div className="flex flex-col items-end gap-1">
                                          <div className="text-sm text-slate-900">
                                            Rs. {Number(totalNum).toLocaleString('en-IN')}
                                          </div>
                                          <div className="flex items-center gap-1 pt-1">
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="outline"
                                              className="h-8 w-8"
                                              onClick={() => handleSaveItemEdit(itemId)}
                                              disabled={visitLocked}
                                            >
                                              <Save className="w-4 h-4" />
                                            </Button>
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="ghost"
                                              className="h-8 w-8"
                                              onClick={cancelEditItem}
                                              disabled={visitLocked}
                                            >
                                              <X className="w-4 h-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex justify-end items-center gap-2">
                                          <span>Rs. {formatRupee(item.total_price)}</span>
                                          {canEdit && (
                                            <>
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
                                                className="h-8 w-8 text-red-500 hover:text-red-600"
                                                onClick={() => handleDeleteItem(itemId)}
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </Button>
                                            </>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td
                                  colSpan={5}
                                  className="py-6 text-center text-sm text-slate-500"
                                >
                                  No items on this bill yet. Dispense medicines using the cart above.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <div className="w-64 space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Subtotal:</span>
                            <span>
                              Rs. {formatRupee(currentBill.bill?.total_amount)}
                            </span>
                          </div>
                          {Number(currentBill.bill?.discount_amount) > 0 && (
                            <div className="flex justify-between text-emerald-700">
                              <span>Discount ({currentBill.bill?.discount_percent}%):</span>
                              <span>-Rs. {formatRupee(currentBill.bill?.discount_amount)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-semibold border-t pt-2">
                            <span>Final Amount:</span>
                            <span>Rs. {formatRupee(currentBill.bill?.final_amount)}</span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Paid:</span>
                            <span>Rs. {formatRupee(currentBill.bill?.paid_amount)}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Search className="w-5 h-5" />
                      Choose a bill
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-500">
                      Pick a bill from the left panel to dispense medicines.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Browse Tab */}
        <TabsContent value="browse" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                All Pharmacy Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Name</th>
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Category</th>
                      <th className="text-right py-2 text-sm font-medium text-slate-500">Stock</th>
                      <th className="text-right py-2 text-sm font-medium text-slate-500">Price</th>
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pharmacyItems.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="py-3">{item.name}</td>
                        <td className="py-3 text-sm text-slate-500">{item.category}</td>
                        <td className="py-3 text-right">{item.stock_quantity}</td>
                        <td className="py-3 text-right">Rs. {item.selling_price}</td>
                        <td className="py-3">
                          {item.stock_quantity <= item.min_stock_level ? (
                            <Badge className="bg-red-100 text-red-800">Low Stock</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800">In Stock</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
