import { query, getOne, run } from '../database';
import type { Bill, BillItem, Payment, BillItemFormData, PaymentFormData, ItemType } from '@/types';

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
  
  const result = run(
    `INSERT INTO bill_items 
     (bill_id, item_name, item_type, room_id, room_name, operator_id, operator_name, quantity, unit_price, total_price, notes, inventory_id) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ]
  );
  
  // Update bill totals
  updateBillTotals(billId);
  
  // Deduct from inventory if applicable
  if (data.inventory_id && data.quantity > 0) {
    run(
      'UPDATE inventory SET stock_quantity = stock_quantity - ? WHERE id = ?',
      [data.quantity, data.inventory_id]
    );
  }
  
  return getOne('SELECT * FROM bill_items WHERE id = ?', [result.lastInsertRowid]) as BillItem;
}

// Remove bill item
export function removeBillItem(itemId: number): boolean {
  const item = getOne('SELECT * FROM bill_items WHERE id = ?', [itemId]) as BillItem;
  if (!item) return false;
  
  // Restore inventory if applicable
  if (item.inventory_id && item.quantity > 0) {
    run(
      'UPDATE inventory SET stock_quantity = stock_quantity + ? WHERE id = ?',
      [item.quantity, item.inventory_id]
    );
  }
  
  run('DELETE FROM bill_items WHERE id = ?', [itemId]);
  updateBillTotals(item.bill_id);
  
  return true;
}

// Update bill totals
function updateBillTotals(billId: number): void {
  const totals = getOne(
    'SELECT COALESCE(SUM(total_price), 0) as total FROM bill_items WHERE bill_id = ?',
    [billId]
  );
  
  const bill = getBillById(billId);
  if (!bill) return;
  
  const totalAmount = totals.total || 0;
  const discountAmount = (totalAmount * bill.discount_percent) / 100;
  const finalAmount = totalAmount - discountAmount;
  
  run(
    'UPDATE bills SET total_amount = ?, discount_amount = ?, final_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [totalAmount, discountAmount, finalAmount, billId]
  );
}

// Apply discount
export function applyDiscount(billId: number, discountPercent: number): Bill | null {
  const bill = getBillById(billId);
  if (!bill) return null;
  
  const discountAmount = (bill.total_amount * discountPercent) / 100;
  const finalAmount = bill.total_amount - discountAmount;
  
  run(
    'UPDATE bills SET discount_percent = ?, discount_amount = ?, final_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [discountPercent, discountAmount, finalAmount, billId]
  );
  
  return getBillById(billId);
}

// Add payment
export function addPayment(
  billId: number,
  data: PaymentFormData,
  receivedBy: number,
  receivedByName: string
): Payment {
  const result = run(
    'INSERT INTO payments (bill_id, amount, payment_method, transaction_id, notes, received_by, received_by_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      billId,
      data.amount,
      data.payment_method,
      data.transaction_id || null,
      data.notes || null,
      receivedBy,
      receivedByName,
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
  
  const paidAmount = payments.total || 0;
  let paymentStatus: string;
  
  if (paidAmount >= bill.final_amount) {
    paymentStatus = 'paid';
  } else if (paidAmount > 0) {
    paymentStatus = 'partial';
  } else {
    paymentStatus = 'pending';
  }
  
  run(
    'UPDATE bills SET paid_amount = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [paidAmount, paymentStatus, billId]
  );
}

// Complete bill
export function completeBill(billId: number, paymentMethod?: string): Bill | null {
  run(
    'UPDATE bills SET status = ?, payment_method = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    ['completed', paymentMethod || null, billId]
  );
  
  // Also complete the token
  const bill = getBillById(billId);
  if (bill) {
    run('UPDATE tokens SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', ['completed', bill.token_id]);
  }
  
  return getBillById(billId);
}

// Cancel bill
export function cancelBill(billId: number): Bill | null {
  run(
    'UPDATE bills SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    ['cancelled', billId]
  );
  
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

// Search bills
export function searchBills(searchTerm: string) {
  const bills = query(
    `SELECT b.*, p.owner_name, p.owner_phone, a.name as animal_name
     FROM bills b
     JOIN patients p ON b.patient_id = p.id
     JOIN animals a ON b.animal_id = a.id
     WHERE b.bill_code LIKE ? OR p.owner_name LIKE ? OR p.owner_phone LIKE ?
     ORDER BY b.created_at DESC
     LIMIT 20`,
    [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]
  );
  
  return bills;
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
