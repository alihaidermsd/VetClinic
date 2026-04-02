import { query, getOne, run } from '../database';
import type { InventoryItem, InventoryCategory } from '@/types';

// Get all inventory items
export function getAllInventory(): InventoryItem[] {
  return query('SELECT * FROM inventory ORDER BY name') as InventoryItem[];
}

// Get inventory item by ID
export function getInventoryItemById(id: number): InventoryItem | null {
  return getOne('SELECT * FROM inventory WHERE id = ?', [id]) as InventoryItem | null;
}

// Get inventory by category
export function getInventoryByCategory(category: InventoryCategory): InventoryItem[] {
  return query('SELECT * FROM inventory WHERE category = ? AND is_active = 1 ORDER BY name', [category]) as InventoryItem[];
}

// Get low stock items
export function getLowStockItems(): InventoryItem[] {
  return query(
    'SELECT * FROM inventory WHERE stock_quantity <= min_stock_level AND is_active = 1 ORDER BY stock_quantity'
  ) as InventoryItem[];
}

// Search inventory
export function searchInventory(searchTerm: string): InventoryItem[] {
  return query(
    'SELECT * FROM inventory WHERE name LIKE ? OR description LIKE ? ORDER BY name',
    [`%${searchTerm}%`, `%${searchTerm}%`]
  ) as InventoryItem[];
}

// Create inventory item
export function createInventoryItem(data: Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'>): InventoryItem {
  const result = run(
    `INSERT INTO inventory 
     (name, category, description, stock_quantity, min_stock_level, cost_price, selling_price, supplier, expiry_date, is_active) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name,
      data.category,
      data.description || null,
      data.stock_quantity,
      data.min_stock_level,
      data.cost_price,
      data.selling_price,
      data.supplier || null,
      data.expiry_date || null,
      data.is_active ? 1 : 0,
    ]
  );
  
  return getInventoryItemById(result.lastInsertRowid) as InventoryItem;
}

// Update inventory item
export function updateInventoryItem(id: number, updates: Partial<InventoryItem>): InventoryItem | null {
  const sets: string[] = [];
  const values: any[] = [];
  
  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.category !== undefined) {
    sets.push('category = ?');
    values.push(updates.category);
  }
  if (updates.description !== undefined) {
    sets.push('description = ?');
    values.push(updates.description);
  }
  if (updates.stock_quantity !== undefined) {
    sets.push('stock_quantity = ?');
    values.push(updates.stock_quantity);
  }
  if (updates.min_stock_level !== undefined) {
    sets.push('min_stock_level = ?');
    values.push(updates.min_stock_level);
  }
  if (updates.cost_price !== undefined) {
    sets.push('cost_price = ?');
    values.push(updates.cost_price);
  }
  if (updates.selling_price !== undefined) {
    sets.push('selling_price = ?');
    values.push(updates.selling_price);
  }
  if (updates.supplier !== undefined) {
    sets.push('supplier = ?');
    values.push(updates.supplier);
  }
  if (updates.expiry_date !== undefined) {
    sets.push('expiry_date = ?');
    values.push(updates.expiry_date);
  }
  if (updates.is_active !== undefined) {
    sets.push('is_active = ?');
    values.push(updates.is_active ? 1 : 0);
  }
  
  if (sets.length === 0) return getInventoryItemById(id);
  
  sets.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  run(`UPDATE inventory SET ${sets.join(', ')} WHERE id = ?`, values);
  return getInventoryItemById(id);
}

// Add stock
export function addStock(id: number, quantity: number): InventoryItem | null {
  run(
    'UPDATE inventory SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [quantity, id]
  );
  return getInventoryItemById(id);
}

// Deduct stock
export function deductStock(id: number, quantity: number): { success: boolean; item?: InventoryItem; error?: string } {
  const item = getInventoryItemById(id);
  if (!item) return { success: false, error: 'Item not found' };
  
  if (item.stock_quantity < quantity) {
    return { success: false, error: 'Insufficient stock' };
  }
  
  run(
    'UPDATE inventory SET stock_quantity = stock_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [quantity, id]
  );
  
  return { success: true, item: getInventoryItemById(id) as InventoryItem };
}

// Delete inventory item (soft delete)
export function deleteInventoryItem(id: number): boolean {
  const result = run('UPDATE inventory SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  return result.changes > 0;
}

// Get inventory statistics
export function getInventoryStats() {
  const totalItems = getOne('SELECT COUNT(*) as count FROM inventory WHERE is_active = 1') as { count: number };
  const lowStock = getOne('SELECT COUNT(*) as count FROM inventory WHERE stock_quantity <= min_stock_level AND is_active = 1') as { count: number };
  const totalValue = getOne('SELECT COALESCE(SUM(stock_quantity * cost_price), 0) as value FROM inventory WHERE is_active = 1') as { value: number };
  
  const categoryWise = query(
    `SELECT category, COUNT(*) as count, COALESCE(SUM(stock_quantity * cost_price), 0) as value
     FROM inventory 
     WHERE is_active = 1 
     GROUP BY category`
  );
  
  return {
    totalItems: totalItems.count,
    lowStock: lowStock.count,
    totalValue: totalValue.value,
    categoryWise,
  };
}

// Get items for pharmacy (medicines, supplements, food)
export function getPharmacyItems(): InventoryItem[] {
  return query(
    "SELECT * FROM inventory WHERE category IN ('medicine', 'supplement', 'food') AND is_active = 1 AND stock_quantity > 0 ORDER BY name"
  ) as InventoryItem[];
}

// Check if item is low on stock
export function isLowStock(itemId: number): boolean {
  const item = getInventoryItemById(itemId);
  if (!item) return false;
  return item.stock_quantity <= item.min_stock_level;
}
