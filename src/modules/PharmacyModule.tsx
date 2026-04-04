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
  Package,
  Percent,
} from 'lucide-react';
import { getPharmacyItems, searchInventory, getInventoryItemById } from '@/lib/services/inventoryService';
import {
  getPendingBillsForDisplay,
  searchBills,
  getBillWithDetails,
  addBillItem,
  applyDiscount,
} from '@/lib/services/billingService';
import { getRoomsByType } from '@/lib/services/roomService';
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

  useEffect(() => {
    loadPharmacyItems();
    loadDispenseBills();
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

  const loadDispenseBills = () => {
    const pending = getPendingBillsForDisplay();
    setDispenseBills(pending);
    setBillSearchResults([]);
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
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add items (check stock)');
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.total_price, 0);

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
            {/* Bills side panel */}
            <Card className="xl:col-span-1">
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

            {/* Current bill / cart */}
            <div className="xl:col-span-2 space-y-4">
              {currentBill ? (
                <>
                  <Card className="bg-green-50 border-green-200">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{currentBill.bill.bill_code}</p>
                          <p className="text-sm text-slate-600">
                            {currentBill.patient?.owner_name} - {currentBill.animal?.name}
                          </p>
                        </div>
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
                                    Stock: {item.stock_quantity} | ₹{item.selling_price}
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
                                    <p className="text-sm text-slate-500">₹{item.unit_price} each</p>
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
                                <span className="text-xl font-bold">₹{cartTotal}</span>
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
                              currentBill.items.map((item: any) => (
                                <tr key={item.id} className="border-b border-slate-100">
                                  <td className="py-2">{item.item_name}</td>
                                  <td className="py-2 text-slate-500">{billItemProviderLabel(item)}</td>
                                  <td className="py-2 text-right">{item.quantity}</td>
                                  <td className="py-2 text-right">₹{formatRupee(item.unit_price)}</td>
                                  <td className="py-2 text-right">₹{formatRupee(item.total_price)}</td>
                                </tr>
                              ))
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
                              ₹{formatRupee(currentBill.bill?.total_amount)}
                            </span>
                          </div>
                          {Number(currentBill.bill?.discount_amount) > 0 && (
                            <div className="flex justify-between text-emerald-700">
                              <span>Discount ({currentBill.bill?.discount_percent}%):</span>
                              <span>-₹{formatRupee(currentBill.bill?.discount_amount)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-semibold border-t pt-2">
                            <span>Final Amount:</span>
                            <span>₹{formatRupee(currentBill.bill?.final_amount)}</span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Paid:</span>
                            <span>₹{formatRupee(currentBill.bill?.paid_amount)}</span>
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
                        <td className="py-3 text-right">₹{item.selling_price}</td>
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
