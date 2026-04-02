import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Package, 
  Plus, 
  Search, 
  AlertTriangle,
  TrendingUp,
  Edit,
  Trash2
} from 'lucide-react';
import { 
  getAllInventory, 
  getLowStockItems, 
  createInventoryItem, 
  updateInventoryItem,
  addStock,
  deleteInventoryItem,
  getInventoryStats
} from '@/lib/services/inventoryService';
import type { InventoryCategory } from '@/types';
import { toast } from 'sonner';

const CATEGORIES: { value: InventoryCategory; label: string }[] = [
  { value: 'medicine', label: 'Medicine' },
  { value: 'food', label: 'Food' },
  { value: 'supplement', label: 'Supplement' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'other', label: 'Other' },
];

export function InventoryModule() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    category: 'medicine' as InventoryCategory,
    description: '',
    stock_quantity: 0,
    min_stock_level: 10,
    cost_price: 0,
    selling_price: 0,
    supplier: '',
  });

  // Stock adjustment
  const [adjustQuantity, setAdjustQuantity] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setInventory(getAllInventory());
    setLowStock(getLowStockItems());
    setStats(getInventoryStats());
  };

  const handleSearch = () => {
    if (!searchTerm.trim()) {
      setInventory(getAllInventory());
      return;
    }
    // Simple client-side search
    const all = getAllInventory();
    const filtered = all.filter((item: any) => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setInventory(filtered);
  };

  const handleAddItem = () => {
    try {
      createInventoryItem({
        ...formData,
        is_active: true,
      });
      toast.success('Item added successfully');
      setShowAddDialog(false);
      setFormData({
        name: '',
        category: 'medicine',
        description: '',
        stock_quantity: 0,
        min_stock_level: 10,
        cost_price: 0,
        selling_price: 0,
        supplier: '',
      });
      loadData();
    } catch (error) {
      toast.error('Failed to add item');
    }
  };

  const handleUpdateItem = () => {
    if (!editingItem) return;

    try {
      updateInventoryItem(editingItem.id, formData);
      toast.success('Item updated successfully');
      setEditingItem(null);
      loadData();
    } catch (error) {
      toast.error('Failed to update item');
    }
  };

  const handleAdjustStock = (itemId: number, isAdd: boolean) => {
    const quantity = parseInt(adjustQuantity);
    if (!quantity || quantity <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    try {
      if (isAdd) {
        addStock(itemId, quantity);
        toast.success('Stock added');
      } else {
        // Deduct stock
        const item = inventory.find((i) => i.id === itemId);
        if (item && item.stock_quantity < quantity) {
          toast.error('Not enough stock to deduct');
          return;
        }
        addStock(itemId, -quantity);
        toast.success('Stock deducted');
      }
      setAdjustQuantity('');
      loadData();
    } catch (error) {
      toast.error('Failed to adjust stock');
    }
  };

  const handleDeleteItem = (itemId: number) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      deleteInventoryItem(itemId);
      toast.success('Item deleted');
      loadData();
    } catch (error) {
      toast.error('Failed to delete item');
    }
  };

  const openEditDialog = (item: any) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      description: item.description || '',
      stock_quantity: item.stock_quantity,
      min_stock_level: item.min_stock_level,
      cost_price: item.cost_price,
      selling_price: item.selling_price,
      supplier: item.supplier || '',
    });
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Items</p>
                  <p className="text-2xl font-bold">{stats.totalItems}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Package className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Low Stock</p>
                  <p className="text-2xl font-bold text-red-600">{stats.lowStock}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Inventory Value</p>
                  <p className="text-2xl font-bold">₹{stats.totalValue.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Categories</p>
                  <p className="text-2xl font-bold">{stats.categoryWise?.length || 0}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Package className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="all">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">All Items</TabsTrigger>
          <TabsTrigger value="lowstock">Low Stock</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        {/* All Items Tab */}
        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Inventory Items</CardTitle>
              <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add New Item</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Item name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select 
                        value={formData.category} 
                        onValueChange={(v: InventoryCategory) => setFormData({ ...formData, category: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Stock Quantity</Label>
                        <Input
                          type="number"
                          value={formData.stock_quantity}
                          onChange={(e) => setFormData({ ...formData, stock_quantity: parseInt(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Min Stock Level</Label>
                        <Input
                          type="number"
                          value={formData.min_stock_level}
                          onChange={(e) => setFormData({ ...formData, min_stock_level: parseInt(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Cost Price</Label>
                        <Input
                          type="number"
                          value={formData.cost_price}
                          onChange={(e) => setFormData({ ...formData, cost_price: parseFloat(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Selling Price</Label>
                        <Input
                          type="number"
                          value={formData.selling_price}
                          onChange={(e) => setFormData({ ...formData, selling_price: parseFloat(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Supplier</Label>
                      <Input
                        value={formData.supplier}
                        onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                        placeholder="Supplier name"
                      />
                    </div>
                    <Button onClick={handleAddItem} className="w-full">
                      Add Item
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Search items..."
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

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Name</th>
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Category</th>
                      <th className="text-right py-2 text-sm font-medium text-slate-500">Stock</th>
                      <th className="text-right py-2 text-sm font-medium text-slate-500">Cost</th>
                      <th className="text-right py-2 text-sm font-medium text-slate-500">Price</th>
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Status</th>
                      <th className="text-right py-2 text-sm font-medium text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="py-3">{item.name}</td>
                        <td className="py-3 text-sm text-slate-500">{item.category}</td>
                        <td className="py-3 text-right">{item.stock_quantity}</td>
                        <td className="py-3 text-right">₹{item.cost_price}</td>
                        <td className="py-3 text-right">₹{item.selling_price}</td>
                        <td className="py-3">
                          {item.stock_quantity <= item.min_stock_level ? (
                            <Badge className="bg-red-100 text-red-800">Low</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800">OK</Badge>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline" onClick={() => openEditDialog(item)}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Edit Item</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div className="space-y-2">
                                    <Label>Name</Label>
                                    <Input
                                      value={formData.name}
                                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <Label>Cost Price</Label>
                                      <Input
                                        type="number"
                                        value={formData.cost_price}
                                        onChange={(e) => setFormData({ ...formData, cost_price: parseFloat(e.target.value) })}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Selling Price</Label>
                                      <Input
                                        type="number"
                                        value={formData.selling_price}
                                        onChange={(e) => setFormData({ ...formData, selling_price: parseFloat(e.target.value) })}
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Min Stock Level</Label>
                                    <Input
                                      type="number"
                                      value={formData.min_stock_level}
                                      onChange={(e) => setFormData({ ...formData, min_stock_level: parseInt(e.target.value) })}
                                    />
                                  </div>
                                  <Button onClick={handleUpdateItem} className="w-full">
                                    Update
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handleDeleteItem(item.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Low Stock Tab */}
        <TabsContent value="lowstock" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Low Stock Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lowStock.length > 0 ? (
                <div className="space-y-2">
                  {lowStock.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-slate-500">{item.category}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium text-red-600">{item.stock_quantity} left</p>
                          <p className="text-xs text-slate-500">Min: {item.min_stock_level}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            placeholder="Qty"
                            className="w-20"
                            value={adjustQuantity}
                            onChange={(e) => setAdjustQuantity(e.target.value)}
                          />
                          <Button 
                            size="sm" 
                            onClick={() => handleAdjustStock(item.id, true)}
                          >
                            <TrendingUp className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No low stock items</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Category-wise Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.categoryWise && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stats.categoryWise.map((cat: any) => (
                    <Card key={cat.category}>
                      <CardContent className="p-4">
                        <p className="font-medium capitalize">{cat.category}</p>
                        <p className="text-2xl font-bold">{cat.count} items</p>
                        <p className="text-sm text-slate-500">
                          Value: ₹{cat.value.toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
