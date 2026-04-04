import { query, getOne, run, listTable } from '../database';
import { getPatientById, getAnimalById } from './patientService';
import { deductStock, addStock } from './inventoryService';
import type { Bill, BillItem, Payment, BillItemFormData, PaymentFormData, ItemType } from '@/types';

function enrichBillForList(b: Bill) {
  const patient = getPatientById(b.patient_id);
  const animal = getAnimalById(b.animal_id);
  return {
    ...b,
    owner_name: patient?.owner_name ?? '',
    owner_phone: patient?.owner_phone ?? '',
    animal_name: animal?.name ?? '',
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

// Get bill by ID
export function getBillById(id: number): Bill | null {
  return getOne('SELECT * FROM bills WHERE id = ?', [id]) as Bill | null;
}

// Get bill by code
export function getBillByCode(code: string): Bill | null {
  return getOne('SELECT * FROM bills WHERE bill_code = ?', [code]) as Bill | null;
}

// Get bill by token ID
export function getBillByTokenId(tokenId: number): Bill | null {
  return getOne('SELECT * FROM bills WHERE token_id = ?', [tokenId]) as Bill | null;
}

// Get bill with all details
export function getBillWithDetails(billId: number) {
  const bill = getBillById(billId);
  if (!bill) return null;
  
  const patient = getOne('SELECT * FROM patients WHERE id = ?', [bill.patient_id]);
  const animal = getOne('SELECT * FROM animals WHERE id = ?', [bill.animal_id]);
  const token = getOne('SELECT * FROM tokens WHERE id = ?', [bill.token_id]);
  const items = query('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY created_at DESC', [billId]);
  const payments = query('SELECT * FROM payments WHERE bill_id = ? ORDER BY created_at DESC', [billId]);
  const medicalRecords = query('SELECT * FROM medical_records WHERE bill_id = ?', [billId]);
  
  return {
    bill,
    patient,
    animal,
    token,
    items,
    payments,
    medicalRecords,
  };
}

// Get bill items
export function getBillItems(billId: number): BillItem[] {
  return query(
    'SELECT * FROM bill_items WHERE bill_id = ? ORDER BY created_at DESC',
    [billId]
  ) as BillItem[];
}

// Add item to bill
export function addBillItem(
  billId: number,
  data: BillItemFormData,
  roomId: number,
  roomName: string,
  operatorId: number,
  operatorName: string
): BillItem {
  const totalPrice = data.quantity * data.unit_price;
  const ts = new Date().toISOString();

  const result = run(
    `INSERT INTO bill_items 
     (bill_id, item_name, item_type, room_id, room_name, operator_id, operator_name, quantity, unit_price, total_price, notes, inventory_id, created_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      billId,
      data.item_name,
      data.item_type,
      roomId,
      roomName,
      operatorId,
      operatorName,
      data.quantity,
      data.unit_price,
      totalPrice,
      data.notes || null,
      data.inventory_id || null,
      ts,
    ]
  );

  // Deduct from inventory after line item exists (rollback line if stock fails)
  if (data.inventory_id && data.quantity > 0) {
    const inv = deductStock(data.inventory_id, data.quantity);
    if (!inv.success) {
      run('DELETE FROM bill_items WHERE id = ?', [result.lastInsertRowid]);
      updateBillTotals(billId);
      throw new Error(inv.error || 'Insufficient stock');
    }
  }

  updateBillTotals(billId);

  return getOne('SELECT * FROM bill_items WHERE id = ?', [result.lastInsertRowid]) as BillItem;
}

// Update bill item (with inventory stock adjustment when quantity changes)
export function updateBillItem(
  itemId: number,
  updates: Partial<Pick<BillItem, 'item_name' | 'quantity' | 'unit_price' | 'notes'>>
): BillItem | null {
  const item = getOne('SELECT * FROM bill_items WHERE id = ?', [itemId]) as BillItem | null;
  if (!item) return null;

  const nextName = (updates.item_name ?? item.item_name)?.toString().trim();
  const nextQtyRaw = updates.quantity ?? item.quantity;
  const nextUnitRaw = updates.unit_price ?? item.unit_price;
  const nextQty = Number(nextQtyRaw);
  const nextUnit = Number(nextUnitRaw);

  if (!nextName) throw new Error('Item name is required');
  if (!Number.isFinite(nextQty) || nextQty <= 0) throw new Error('Quantity must be greater than zero');
  if (!Number.isFinite(nextUnit) || nextUnit <= 0) throw new Error('Unit price must be greater than zero');

  // If this line is linked to inventory, reconcile stock by quantity delta.
  if (item.inventory_id && Number(item.inventory_id) > 0) {
    const prevQty = Number(item.quantity) || 0;
    const delta = nextQty - prevQty;
    if (delta > 0) {
      const inv = deductStock(Number(item.inventory_id), delta);
      if (!inv.success) throw new Error(inv.error || 'Insufficient stock');
    } else if (delta < 0) {
      addStock(Number(item.inventory_id), Math.abs(delta));
    }
  }

  const totalPrice = roundMoney(nextQty * nextUnit);
  run(
    'UPDATE bill_items SET item_name = ?, quantity = ?, unit_price = ?, total_price = ?, notes = ? WHERE id = ?',
    [nextName, nextQty, nextUnit, totalPrice, updates.notes ?? item.notes ?? null, itemId]
  );
  updateBillTotals(item.bill_id);

  return getOne('SELECT * FROM bill_items WHERE id = ?', [itemId]) as BillItem | null;
}

// Remove bill item
export function removeBillItem(itemId: number): boolean {
  const item = getOne('SELECT * FROM bill_items WHERE id = ?', [itemId]) as BillItem;
  if (!item) return false;
  
  // Restore inventory if applicable
  if (item.inventory_id && item.quantity > 0) {
    addStock(item.inventory_id, item.quantity);
  }

  run('DELETE FROM bill_items WHERE id = ?', [itemId]);
  updateBillTotals(item.bill_id);
  
  return true;
}

const ISO_DATE_IN_FIELD = /\d{4}-\d{2}-\d{2}T\d{2}:/;

function createdAtFromBillCode(billCode: unknown): string | null {
  const m = String(billCode ?? '').match(/-(\d{8})-/);
  if (!m) return null;
  const d = m[1];
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T12:00:00.000Z`;
}

/**
 * Fixes bills/tokens created when INSERT used mixed `?` and literals: params were mapped to the
 * wrong columns, so `created_at` was often missing and reports saw every date filter as empty.
 * Idempotent — safe to run on every app load.
 */
export function migrateLegacyBillCorruption(): void {
  const bills = listTable('bills') as any[];
  const tokens = listTable('tokens') as any[];
  const tokenById = Object.fromEntries(tokens.map((t) => [t.id, t]));

  for (const b of bills) {
    if (b?.id == null) continue;

    let created: string | null =
      b.created_at != null && String(b.created_at).trim() !== '' ? String(b.created_at) : null;

    if (!created) {
      const tok = tokenById[b.token_id];
      if (tok?.created_at && String(tok.created_at).trim() !== '') {
        created = String(tok.created_at);
      }
    }
    if (!created) {
      for (const cand of [b.discount_percent, b.final_amount, b.updated_at]) {
        if (typeof cand === 'string' && ISO_DATE_IN_FIELD.test(cand)) {
          created = cand;
          break;
        }
      }
    }
    if (!created) {
      created = createdAtFromBillCode(b.bill_code);
    }

    if (created && (!b.created_at || String(b.created_at).trim() === '')) {
      run('UPDATE bills SET created_at = ? WHERE id = ?', [created, b.id]);
    }

    if (b.status === undefined || b.status === null || String(b.status).trim() === '') {
      run('UPDATE bills SET status = ? WHERE id = ?', ['active', b.id]);
    }

    if (typeof b.discount_percent === 'string' && ISO_DATE_IN_FIELD.test(b.discount_percent)) {
      run('UPDATE bills SET discount_percent = 0 WHERE id = ?', [b.id]);
    }
  }

  // Legacy token INSERT also mis-mapped params; bill row has correct patient/animal.
  for (const b of listTable('bills') as any[]) {
    if (b?.token_id == null) continue;
    run('UPDATE tokens SET patient_id = ?, animal_id = ? WHERE id = ?', [
      b.patient_id,
      b.animal_id,
      b.token_id,
    ]);
  }

  for (const b of listTable('bills') as any[]) {
    if (b?.id == null) continue;
    try {
      updateBillTotals(b.id);
    } catch {
      /* ignore per-bill errors */
    }
  }
}

// Update bill totals
function updateBillTotals(billId: number): void {
  const totals = getOne(
    'SELECT COALESCE(SUM(total_price), 0) as total FROM bill_items WHERE bill_id = ?',
    [billId]
  );

  const bill = getBillById(billId);
  if (!bill) return;

  const totalAmount = roundMoney(Number(totals?.total) || 0);
  const pct = Number(bill.discount_percent) || 0;
  const discountAmount = roundMoney((totalAmount * pct) / 100);
  const finalAmount = roundMoney(totalAmount - discountAmount);
  const ts = new Date().toISOString();

  run(
    'UPDATE bills SET total_amount = ?, discount_amount = ?, final_amount = ?, updated_at = ? WHERE id = ?',
    [totalAmount, discountAmount, finalAmount, ts, billId]
  );

  updatePaymentStatus(billId);
}

// Apply discount
export function applyDiscount(billId: number, discountPercent: number): Bill | null {
  const bill = getBillById(billId);
  if (!bill) return null;

  const totalAmount = roundMoney(Number(bill.total_amount) || 0);
  const discountAmount = roundMoney((totalAmount * discountPercent) / 100);
  const finalAmount = roundMoney(totalAmount - discountAmount);
  const ts = new Date().toISOString();

  run(
    'UPDATE bills SET discount_percent = ?, discount_amount = ?, final_amount = ?, updated_at = ? WHERE id = ?',
    [discountPercent, discountAmount, finalAmount, ts, billId]
  );

  updatePaymentStatus(billId);
  return getBillById(billId);
}

// Add payment
export function addPayment(
  billId: number,
  data: PaymentFormData,
  receivedBy: number,
  receivedByName: string
): Payment {
  const amount = roundMoney(Number(data.amount) || 0);
  const result = run(
    'INSERT INTO payments (bill_id, amount, payment_method, transaction_id, notes, received_by, received_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      billId,
      amount,
      data.payment_method,
      data.transaction_id || null,
      data.notes || null,
      receivedBy,
      receivedByName,
      new Date().toISOString(),
    ]
  );
  
  // Update bill payment status
  updatePaymentStatus(billId);
  
  return getOne('SELECT * FROM payments WHERE id = ?', [result.lastInsertRowid]) as Payment;
}

// Update payment status
function updatePaymentStatus(billId: number): void {
  const bill = getBillById(billId);
  if (!bill) return;
  
  const payments = getOne(
    'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE bill_id = ?',
    [billId]
  );
  
  const paidAmount = roundMoney(Number(payments?.total) || 0);
  const finalAmt = roundMoney(Number(bill.final_amount) || 0);
  let paymentStatus: string;

  if (paidAmount >= finalAmt && finalAmt > 0) {
    paymentStatus = 'paid';
  } else if (paidAmount > 0) {
    paymentStatus = 'partial';
  } else {
    paymentStatus = 'pending';
  }

  const ts = new Date().toISOString();
  run(
    'UPDATE bills SET paid_amount = ?, payment_status = ?, updated_at = ? WHERE id = ?',
    [paidAmount, paymentStatus, ts, billId]
  );
}

// Complete bill
export function completeBill(billId: number, paymentMethod?: string): Bill | null {
  const ts = new Date().toISOString();
  // In-memory DB ignores SQL CURRENT_TIMESTAMP; pass explicit ISO strings so completed_at is stored.
  run(
    'UPDATE bills SET status = ?, payment_method = ?, completed_at = ?, updated_at = ? WHERE id = ?',
    ['completed', paymentMethod || null, ts, ts, billId]
  );

  // Also complete the token
  const bill = getBillById(billId);
  if (bill) {
    run('UPDATE tokens SET status = ?, completed_at = ? WHERE id = ?', ['completed', ts, bill.token_id]);
  }

  return getBillById(billId);
}

// Cancel bill
export function cancelBill(billId: number): Bill | null {
  const ts = new Date().toISOString();
  run('UPDATE bills SET status = ?, updated_at = ? WHERE id = ?', ['cancelled', ts, billId]);
  
  // Also cancel the token
  const bill = getBillById(billId);
  if (bill) {
    run('UPDATE tokens SET status = ? WHERE id = ?', ['cancelled', bill.token_id]);
  }
  
  return getBillById(billId);
}

// Get today's bills
export function getTodayBills(): Bill[] {
  const today = new Date().toISOString().split('T')[0];
  return query(
    "SELECT * FROM bills WHERE DATE(created_at) = ? ORDER BY created_at DESC",
    [today]
  ) as Bill[];
}

// Get pending bills
export function getPendingBills(): Bill[] {
  return query(
    "SELECT * FROM bills WHERE status = 'active' ORDER BY created_at DESC"
  ) as Bill[];
}

/** Active bills with owner/pet names for billing UI lists. */
export function getPendingBillsForDisplay() {
  return (listTable('bills') as Bill[])
    .filter((b) => {
      const billStatus = String(b.status ?? '').toLowerCase();
      const payStatus = String(b.payment_status ?? '').toLowerCase();

      // Pending bills = not completed/cancelled AND not fully paid.
      // Using this logic (instead of only `status === "active"`) makes the UI resilient
      // to legacy rows / any case differences in the in-memory DB.
      const isCancelled = billStatus === 'cancelled';
      const isCompleted = billStatus === 'completed';
      const isPaid = payStatus === 'paid';
      return !isCancelled && !isCompleted && !isPaid;
    })
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 25)
    .map((b) => enrichBillForList(b));
}

function isPendingBillForBillingUI(b: Bill): boolean {
  const billStatus = String(b.status ?? '').toLowerCase();
  const payStatus = String(b.payment_status ?? '').toLowerCase();

  // "Pending" = not completed/cancelled AND not fully paid
  return billStatus !== 'cancelled' && billStatus !== 'completed' && payStatus !== 'paid';
}

/**
 * Billing page list:
 * - Pending bills at the top
 * - Completed/paid bills below
 */
export function getBillsForBillingPageDisplay() {
  const all = (listTable('bills') as Bill[]).map((b) => enrichBillForList(b));

  const pending = all
    .filter((b) => isPendingBillForBillingUI(b))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 50);

  const completedPaid = all
    .filter((b) => !isPendingBillForBillingUI(b) && String(b.status ?? '').toLowerCase() !== 'cancelled')
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 50);

  return { pending, completedPaid };
}

// Search bills (in-memory DB: scan bills + patient/animal — no SQL JOIN)
export function searchBills(searchTerm: string) {
  const term = searchTerm.trim().toLowerCase();
  const allBills = listTable('bills') as Bill[];
  const sorted = [...allBills].sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  );
  const enriched = sorted.map((b) => enrichBillForList(b));

  if (!term) {
    return enriched.slice(0, 20);
  }

  const digits = term.replace(/\D/g, '');
  const tokens = listTable('tokens') as { id: number; bill_id: number; token_number: number; date?: string }[];

  return enriched
    .filter((b) => {
      if (String(b.bill_code).toLowerCase().includes(term)) return true;
      if (String(b.owner_name).toLowerCase().includes(term)) return true;
      if (String(b.owner_phone).toLowerCase().includes(term)) return true;
      const phoneDigits = String(b.owner_phone || '').replace(/\D/g, '');
      if (digits.length >= 2 && phoneDigits.includes(digits)) return true;
      if (String(b.animal_name).toLowerCase().includes(term)) return true;
      if (/^\d+$/.test(term)) {
        const n = parseInt(term, 10);
        return tokens.some((t) => t.bill_id === b.id && t.token_number === n);
      }
      return false;
    })
    .slice(0, 20);
}

// Get bill statistics
export function getBillStats() {
  const today = new Date().toISOString().split('T')[0];
  
  const todayStats = getOne(
    `SELECT 
      COUNT(*) as count,
      COALESCE(SUM(final_amount), 0) as revenue
     FROM bills 
     WHERE DATE(created_at) = ? AND status = 'completed'`,
    [today]
  );
  
  const pendingStats = getOne(
    `SELECT 
      COUNT(*) as count,
      COALESCE(SUM(final_amount - paid_amount), 0) as pending_amount
     FROM bills 
     WHERE status = 'active' AND payment_status != 'paid'`
  );
  
  return {
    today: {
      count: todayStats?.count || 0,
      revenue: todayStats?.revenue || 0,
    },
    pending: {
      count: pendingStats?.count || 0,
      amount: pendingStats?.pending_amount || 0,
    },
  };
}

// Get common services for quick selection
export function getCommonServices(): { name: string; type: ItemType; price: number }[] {
  return [
    { name: 'General Consultation', type: 'consultation', price: 200 },
    { name: 'Follow-up Consultation', type: 'consultation', price: 100 },
    { name: 'Vaccination', type: 'procedure', price: 350 },
    { name: 'Deworming', type: 'procedure', price: 150 },
    { name: 'Blood Test', type: 'lab_test', price: 500 },
    { name: 'Urine Test', type: 'lab_test', price: 300 },
    { name: 'X-Ray', type: 'xray', price: 800 },
    { name: 'Ultrasound', type: 'xray', price: 1200 },
    { name: 'Minor Surgery', type: 'surgery', price: 2500 },
    { name: 'Major Surgery', type: 'surgery', price: 5000 },
    { name: 'Wound Dressing', type: 'procedure', price: 200 },
    { name: 'Nail Trimming', type: 'procedure', price: 100 },
  ];
}
