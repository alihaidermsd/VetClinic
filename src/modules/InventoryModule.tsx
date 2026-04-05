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
  Trash2,
  Upload,
  FileSpreadsheet,
  ImageIcon,
  Download,
} from 'lucide-react';
import { 
  getAllInventory, 
  getLowStockItems, 
  createInventoryItem, 
  createInventoryItemsBulk,
  updateInventoryItem,
  addStock,
  deleteInventoryItem,
  getInventoryStats
} from '@/lib/services/inventoryService';
import {
  parsePastedInventoryText,
  parseImportedGrid,
  parseXlsxFileToGrid,
  parseTextToGrid,
  INVENTORY_IMPORT_TEMPLATE_CSV,
  type BulkImportDraft,
} from '@/lib/inventoryImport';
import type { InventoryCategory } from '@/types';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkTab, setBulkTab] = useState('paste');
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [bulkDefaultCategory, setBulkDefaultCategory] = useState<InventoryCategory>('medicine');
  const [bulkPreview, setBulkPreview] = useState<BulkImportDraft[]>([]);
  const [bulkSkipped, setBulkSkipped] = useState<{ row: number; reason: string }[]>([]);
  const [bulkFileLoading, setBulkFileLoading] = useState(false);
  const [bulkOcrLoading, setBulkOcrLoading] = useState(false);

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

  const resetBulkImport = () => {
    setBulkPasteText('');
    setBulkPreview([]);
    setBulkSkipped([]);
    setBulkTab('paste');
  };

  const downloadImportTemplate = () => {
    const blob = new Blob([INVENTORY_IMPORT_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Template downloaded');
  };

  const runBulkPreviewFromText = (text: string) => {
    const { items, skipped } = parsePastedInventoryText(text, bulkDefaultCategory);
    setBulkPreview(items);
    setBulkSkipped(skipped);
    if (items.length === 0) {
      toast.error('No rows found. Use a header row (name, stock, …) or one item per line.');
    } else {
      toast.success(`${items.length} row(s) ready to import`);
    }
  };

  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const lower = file.name.toLowerCase();
    setBulkFileLoading(true);
    try {
      let grid: string[][];
      if (lower.endsWith('.csv')) {
        const text = await file.text();
        grid = parseTextToGrid(text);
      } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        grid = await parseXlsxFileToGrid(file);
      } else {
        toast.error('Please choose a .csv, .xlsx, or .xls file');
        return;
      }
      const { items, skipped } = parseImportedGrid(grid, bulkDefaultCategory);
      setBulkPreview(items);
      setBulkSkipped(skipped);
      if (items.length === 0) {
        toast.error('No rows found in file');
      } else {
        toast.success(`${items.length} row(s) loaded from file`);
      }
    } catch {
      toast.error('Could not read that file');
    } finally {
      setBulkFileLoading(false);
    }
  };

  const handleBulkImageOcr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setBulkOcrLoading(true);
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const {
        data: { text },
      } = await worker.recognize(file);
      await worker.terminate();
      setBulkPasteText(text);
      setBulkTab('paste');
      toast.success('Text extracted — clean up lines if needed, then Preview import');
    } catch {
      toast.error('OCR failed. Try a sharper photo, or copy from Excel / Google Sheets and paste.');
    } finally {
      setBulkOcrLoading(false);
    }
  };

  const confirmBulkImport = () => {
    if (bulkPreview.length === 0) {
      toast.error('Nothing to import — paste, upload, or preview first');
      return;
    }
    const payload = bulkPreview.map((d) => ({
      name: d.name,
      category: d.category,
      description: d.description?.trim() || undefined,
      stock_quantity: d.stock_quantity,
      min_stock_level: d.min_stock_level,
      cost_price: d.cost_price,
      selling_price: d.selling_price,
      supplier: d.supplier?.trim() || undefined,
      expiry_date: d.expiry_date?.trim() || undefined,
      is_active: true as const,
    }));
    const { created, failed } = createInventoryItemsBulk(payload);
    if (failed.length) {
      toast.warning(`Added ${created} item(s). ${failed.length} row(s) failed.`);
    } else {
      toast.success(`Added ${created} item(s)`);
    }
    setShowBulkDialog(false);
    resetBulkImport();
    loadData();
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
                <div className="w-12 h-12 bg-secondary rounded-lg flex items-center justify-center">
                  <Package className="w-6 h-6 text-primary" />
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
                  <p className="text-2xl font-bold">Rs. {stats.totalValue.toLocaleString()}</p>
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
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>Inventory Items</CardTitle>
              <div className="flex flex-wrap gap-2">
              <Dialog
                open={showBulkDialog}
                onOpenChange={(open) => {
                  setShowBulkDialog(open);
                  if (!open) resetBulkImport();
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="secondary">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Bulk import
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Bulk add inventory</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    Import many items from Excel, a CSV file, pasted rows, or text extracted from a photo.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-xs shrink-0">Default category (when not in sheet)</Label>
                    <Select
                      value={bulkDefaultCategory}
                      onValueChange={(v: InventoryCategory) => setBulkDefaultCategory(v)}
                    >
                      <SelectTrigger className="w-[160px]">
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
                    <Button type="button" variant="outline" size="sm" onClick={downloadImportTemplate}>
                      <Download className="w-4 h-4 mr-1" />
                      CSV template
                    </Button>
                  </div>
                  <Tabs value={bulkTab} onValueChange={setBulkTab} className="flex-1 min-h-0 flex flex-col gap-2">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="paste">Paste</TabsTrigger>
                      <TabsTrigger value="file">Excel / CSV</TabsTrigger>
                      <TabsTrigger value="photo">Photo</TabsTrigger>
                    </TabsList>
                    <TabsContent value="paste" className="space-y-2 mt-2">
                      <Label>Paste from Excel or Google Sheets (include header row if you have one)</Label>
                      <Textarea
                        className="min-h-[140px] font-mono text-sm"
                        placeholder={`name\tstock\tcost\tselling\nAmoxicillin 500mg\t100\t50\t75`}
                        value={bulkPasteText}
                        onChange={(e) => setBulkPasteText(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => runBulkPreviewFromText(bulkPasteText)}
                        disabled={!bulkPasteText.trim()}
                      >
                        Preview import
                      </Button>
                    </TabsContent>
                    <TabsContent value="file" className="space-y-3 mt-2">
                      <p className="text-sm text-muted-foreground">
                        Export your sheet as .xlsx or .csv, or use the CSV template above. First sheet is used for Excel files.
                      </p>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" disabled={bulkFileLoading} asChild>
                          <label className="cursor-pointer">
                            <Upload className="w-4 h-4 mr-2 inline" />
                            {bulkFileLoading ? 'Reading…' : 'Choose file'}
                            <input
                              type="file"
                              accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                              className="hidden"
                              onChange={handleBulkFileChange}
                            />
                          </label>
                        </Button>
                      </div>
                    </TabsContent>
                    <TabsContent value="photo" className="space-y-3 mt-2">
                      <p className="text-sm text-muted-foreground">
                        Take a clear photo of a printed list or screen. OCR works best for typed text; you can edit the result on the Paste tab.
                      </p>
                      <Button type="button" variant="outline" disabled={bulkOcrLoading} asChild>
                        <label className="cursor-pointer">
                          <ImageIcon className="w-4 h-4 mr-2 inline" />
                          {bulkOcrLoading ? 'Reading image…' : 'Choose image'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleBulkImageOcr}
                          />
                        </label>
                      </Button>
                    </TabsContent>
                  </Tabs>
                  {bulkSkipped.length > 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Skipped {bulkSkipped.length} row(s) (e.g. empty name). Check your data.
                    </p>
                  )}
                  {bulkPreview.length > 0 && (
                    <div className="space-y-2 flex-1 min-h-0">
                      <Label>Preview ({bulkPreview.length} items)</Label>
                      <ScrollArea className="h-[200px] rounded-md border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50 text-left">
                              <th className="p-2 font-medium">Name</th>
                              <th className="p-2 font-medium">Cat</th>
                              <th className="p-2 font-medium text-right">Stock</th>
                              <th className="p-2 font-medium text-right">Cost</th>
                              <th className="p-2 font-medium text-right">Sell</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkPreview.map((row, i) => (
                              <tr key={i} className="border-b border-border/60">
                                <td className="p-2 max-w-[140px] truncate" title={row.name}>
                                  {row.name}
                                </td>
                                <td className="p-2 capitalize text-muted-foreground">{row.category}</td>
                                <td className="p-2 text-right">{row.stock_quantity}</td>
                                <td className="p-2 text-right">{row.cost_price}</td>
                                <td className="p-2 text-right">{row.selling_price}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </ScrollArea>
                    </div>
                  )}
                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      className="flex-1"
                      onClick={confirmBulkImport}
                      disabled={bulkPreview.length === 0}
                    >
                      Add {bulkPreview.length > 0 ? `${bulkPreview.length} ` : ''}items
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowBulkDialog(false)}>
                      Cancel
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
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
              </div>
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
                        <td className="py-3 text-right">Rs. {item.cost_price}</td>
                        <td className="py-3 text-right">Rs. {item.selling_price}</td>
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
                          Value: Rs. {cat.value.toLocaleString()}
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
