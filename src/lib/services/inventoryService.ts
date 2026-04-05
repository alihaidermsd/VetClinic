import { query, getOne, run, listTable } from '../database';
import type { InventoryItem, InventoryCategory } from '@/types';

// Get all inventory items (active only — matches typical stock UI)
export function getAllInventory(): InventoryItem[] {
  return (listTable('inventory') as InventoryItem[])
    .filter((row) => isInventoryActive(row))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

// Get inventory item by ID
export function getInventoryItemById(id: number): InventoryItem | null {
  return getOne('SELECT * FROM inventory WHERE id = ?', [id]) as InventoryItem | null;
}

// Get inventory by category
export function getInventoryByCategory(category: InventoryCategory): InventoryItem[] {
  return query('SELECT * FROM inventory WHERE category = ? AND is_active = 1 ORDER BY name', [category]) as InventoryItem[];
}

function isInventoryActive(row: { is_active?: number | boolean }): boolean {
  return row.is_active === 1 || row.is_active === true;
}

// Get low stock items
export function getLowStockItems(): InventoryItem[] {
  return (listTable('inventory') as InventoryItem[])
    .filter(
      (row) =>
        isInventoryActive(row) &&
        (Number(row.stock_quantity) || 0) <= (Number(row.min_stock_level) || 0)
    )
    .sort((a, b) => (Number(a.stock_quantity) || 0) - (Number(b.stock_quantity) || 0));
}

// Search inventory
export function searchInventory(searchTerm: string): InventoryItem[] {
  const q = searchTerm.trim().toLowerCase();
  if (!q) return [];
  return (listTable('inventory') as InventoryItem[])
    .filter(
      (row) =>
        isInventoryActive(row) &&
        (String(row.name).toLowerCase().includes(q) ||
          String(row.description || '').toLowerCase().includes(q))
    )
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

// Create inventory item
export function createInventoryItem(data: Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'>): InventoryItem {
  const ts = new Date().toISOString();
  const result = run(
    `INSERT INTO inventory 
     (name, category, description, stock_quantity, min_stock_level, cost_price, selling_price, supplier, expiry_date, is_active, created_at, updated_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ts,
      ts,
    ]
  );

  return getInventoryItemById(result.lastInsertRowid) as InventoryItem;
}

export type BulkCreateResult = { created: number; failed: { index: number; message: string }[] };

/** Insert many items; each successful row is saved immediately. */
export function createInventoryItemsBulk(
  items: Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'>[]
): BulkCreateResult {
  let created = 0;
  const failed: { index: number; message: string }[] = [];
  items.forEach((item, index) => {
    try {
      const name = String(item.name ?? '').trim();
      if (!name) {
        failed.push({ index, message: 'Missing name' });
        return;
      }
      createInventoryItem({
        ...item,
        name,
        is_active: item.is_active !== false,
      });
      created++;
    } catch (e) {
      failed.push({ index, message: e instanceof Error ? e.message : String(e) });
    }
  });
  return { created, failed };
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

  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  run(`UPDATE inventory SET ${sets.join(', ')} WHERE id = ?`, values);
  return getInventoryItemById(id);
}

// Add stock (in-memory UPDATE cannot do column + param; compute in JS)
export function addStock(id: number, quantity: number): InventoryItem | null {
  const item = getInventoryItemById(id);
  if (!item) return null;
  const next = (Number(item.stock_quantity) || 0) + quantity;
  const ts = new Date().toISOString();
  run('UPDATE inventory SET stock_quantity = ?, updated_at = ? WHERE id = ?', [next, ts, id]);
  return getInventoryItemById(id);
}

// Deduct stock
export function deductStock(id: number, quantity: number): { success: boolean; item?: InventoryItem; error?: string } {
  const item = getInventoryItemById(id);
  if (!item) return { success: false, error: 'Item not found' };

  const cur = Number(item.stock_quantity) || 0;
  if (cur < quantity) {
    return { success: false, error: 'Insufficient stock' };
  }

  const next = cur - quantity;
  const ts = new Date().toISOString();
  run('UPDATE inventory SET stock_quantity = ?, updated_at = ? WHERE id = ?', [next, ts, id]);

  return { success: true, item: getInventoryItemById(id) as InventoryItem };
}

// Delete inventory item (soft delete)
export function deleteInventoryItem(id: number): boolean {
  const ts = new Date().toISOString();
  const result = run('UPDATE inventory SET is_active = ?, updated_at = ? WHERE id = ?', [0, ts, id]);
  return result.changes > 0;
}

// Get inventory statistics
export function getInventoryStats() {
  const rows = (listTable('inventory') as InventoryItem[]).filter((r) => isInventoryActive(r));
  const totalItems = rows.length;
  const lowStock = rows.filter(
    (r) => (Number(r.stock_quantity) || 0) <= (Number(r.min_stock_level) || 0)
  ).length;
  const totalValue = rows.reduce(
    (s, r) => s + (Number(r.stock_quantity) || 0) * (Number(r.cost_price) || 0),
    0
  );

  const catMap = new Map<string, { count: number; value: number }>();
  for (const r of rows) {
    const c = String(r.category);
    const prev = catMap.get(c) || { count: 0, value: 0 };
    prev.count += 1;
    prev.value += (Number(r.stock_quantity) || 0) * (Number(r.cost_price) || 0);
    catMap.set(c, prev);
  }
  const categoryWise = Array.from(catMap.entries()).map(([category, v]) => ({
    category,
    count: v.count,
    value: v.value,
  }));

  return {
    totalItems,
    lowStock,
    totalValue,
    categoryWise,
  };
}

// Get items for pharmacy (medicines, supplements, food)
export function getPharmacyItems(): InventoryItem[] {
  const allowed = new Set(['medicine', 'supplement', 'food']);
  return (listTable('inventory') as InventoryItem[])
    .filter(
      (row) =>
        isInventoryActive(row) &&
        allowed.has(String(row.category)) &&
        (Number(row.stock_quantity) || 0) > 0
    )
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

// Check if item is low on stock
export function isLowStock(itemId: number): boolean {
  const item = getInventoryItemById(itemId);
  if (!item) return false;
  return item.stock_quantity <= item.min_stock_level;
}
