import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Package
} from 'lucide-react';
import { getPharmacyItems, searchInventory, getInventoryItemById } from '@/lib/services/inventoryService';
import { getBillByCode, getBillWithDetails, addBillItem } from '@/lib/services/billingService';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface CartItem {
  inventory_id: number;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export function PharmacyModule() {
  const { user } = useAuth();
  const [billCode, setBillCode] = useState('');
  const [currentBill, setCurrentBill] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [pharmacyItems, setPharmacyItems] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    loadPharmacyItems();
  }, []);

  const loadPharmacyItems = () => {
    const items = getPharmacyItems();
    setPharmacyItems(items);
  };

  const handleSearchBill = () => {
    if (!billCode.trim()) {
      toast.error('Please enter bill code');
      return;
    }

    const bill = getBillByCode(billCode);
    if (!bill) {
      toast.error('Bill not found');
      return;
    }

    const billDetails = getBillWithDetails(bill.id);
    setCurrentBill(billDetails);
    toast.success('Bill loaded');
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

    try {
      cart.forEach((item) => {
        addBillItem(
          currentBill.bill.id,
          {
            item_name: item.name,
            item_type: 'medicine',
            quantity: item.quantity,
            unit_price: item.unit_price,
            inventory_id: item.inventory_id,
          },
          0, // Pharmacy room ID
          'Pharmacy',
          user.id,
          user.name
        );
      });

      // Refresh bill
      const updatedBill = getBillWithDetails(currentBill.bill.id);
      setCurrentBill(updatedBill);

      toast.success('Items added to bill');
      setCart([]);
      loadPharmacyItems();
    } catch (error) {
      toast.error('Failed to add items to bill');
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
          {/* Bill Search */}
          {!currentBill && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Enter Bill Code
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter bill code..."
                    value={billCode}
                    onChange={(e) => setBillCode(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearchBill()}
                    className="flex-1"
                  />
                  <Button onClick={handleSearchBill}>
                    <Search className="w-4 h-4 mr-2" />
                    Load
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bill Details & Cart */}
          {currentBill && (
            <>
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{currentBill.bill.bill_code}</p>
                      <p className="text-sm text-slate-600">
                        {currentBill.patient?.owner_name} - {currentBill.animal?.name}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setCurrentBill(null)}>
                      Change
                    </Button>
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
                        placeholder="Search medicines..."
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
            </>
          )}
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
