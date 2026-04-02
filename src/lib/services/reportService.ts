import { query, getOne } from '../database';
import type { DailyReport, RoomWiseReport, PaymentWiseReport, DoctorReport } from '@/types';

// Get daily report
export function getDailyReport(date?: string): DailyReport {
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  const summary = getOne(
    `SELECT 
      COUNT(*) as total_bills,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COALESCE(SUM(discount_amount), 0) as total_discount,
      COALESCE(SUM(final_amount), 0) as net_revenue
     FROM bills 
     WHERE DATE(created_at) = ? AND status = 'completed'`,
    [targetDate]
  );
  
  const roomWise = query(
    `SELECT 
      bi.room_id,
      bi.room_name,
      COALESCE(SUM(bi.total_price), 0) as total_charges,
      COUNT(*) as item_count
     FROM bill_items bi
     JOIN bills b ON bi.bill_id = b.id
     WHERE DATE(b.created_at) = ? AND b.status = 'completed'
     GROUP BY bi.room_id, bi.room_name`
  ) as RoomWiseReport[];
  
  const paymentWise = query(
    `SELECT 
      payment_method,
      COALESCE(SUM(amount), 0) as total_amount,
      COUNT(*) as count
     FROM payments
     WHERE DATE(created_at) = ?
     GROUP BY payment_method`
  ) as PaymentWiseReport[];
  
  return {
    date: targetDate,
    total_bills: summary?.total_bills || 0,
    total_revenue: summary?.total_revenue || 0,
    total_discount: summary?.total_discount || 0,
    net_revenue: summary?.net_revenue || 0,
    room_wise: roomWise,
    payment_wise: paymentWise,
  };
}

// Get date range report
export function getDateRangeReport(startDate: string, endDate: string) {
  const summary = getOne(
    `SELECT 
      COUNT(*) as total_bills,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COALESCE(SUM(discount_amount), 0) as total_discount,
      COALESCE(SUM(final_amount), 0) as net_revenue
     FROM bills 
     WHERE DATE(created_at) BETWEEN ? AND ? AND status = 'completed'`,
    [startDate, endDate]
  );
  
  const dailyBreakdown = query(
    `SELECT 
      DATE(created_at) as date,
      COUNT(*) as bill_count,
      COALESCE(SUM(final_amount), 0) as revenue
     FROM bills 
     WHERE DATE(created_at) BETWEEN ? AND ? AND status = 'completed'
     GROUP BY DATE(created_at)
     ORDER BY date`
  );
  
  const roomWise = query(
    `SELECT 
      bi.room_id,
      bi.room_name,
      COALESCE(SUM(bi.total_price), 0) as total_charges,
      COUNT(*) as item_count
     FROM bill_items bi
     JOIN bills b ON bi.bill_id = b.id
     WHERE DATE(b.created_at) BETWEEN ? AND ? AND b.status = 'completed'
     GROUP BY bi.room_id, bi.room_name`
  );
  
  const paymentWise = query(
    `SELECT 
      payment_method,
      COALESCE(SUM(amount), 0) as total_amount,
      COUNT(*) as count
     FROM payments
     WHERE DATE(created_at) BETWEEN ? AND ?
     GROUP BY payment_method`
  );
  
  return {
    start_date: startDate,
    end_date: endDate,
    summary: {
      total_bills: summary?.total_bills || 0,
      total_revenue: summary?.total_revenue || 0,
      total_discount: summary?.total_discount || 0,
      net_revenue: summary?.net_revenue || 0,
    },
    daily_breakdown: dailyBreakdown,
    room_wise: roomWise,
    payment_wise: paymentWise,
  };
}

// Get doctor-wise report
export function getDoctorReport(startDate?: string, endDate?: string): DoctorReport[] {
  let dateFilter = '';
  const params: any[] = [];
  
  if (startDate && endDate) {
    dateFilter = 'AND DATE(b.created_at) BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else if (startDate) {
    dateFilter = 'AND DATE(b.created_at) = ?';
    params.push(startDate);
  }
  
  return query(
    `SELECT 
      bi.operator_id as doctor_id,
      bi.operator_name as doctor_name,
      COUNT(DISTINCT bi.bill_id) as total_patients,
      COALESCE(SUM(bi.total_price), 0) as total_charges
     FROM bill_items bi
     JOIN bills b ON bi.bill_id = b.id
     WHERE bi.item_type = 'consultation' AND b.status = 'completed' ${dateFilter}
     GROUP BY bi.operator_id, bi.operator_name
     ORDER BY total_charges DESC`,
    params
  ) as DoctorReport[];
}

// Get medicine sales report
export function getMedicineSalesReport(startDate?: string, endDate?: string) {
  let dateFilter = '';
  const params: any[] = [];
  
  if (startDate && endDate) {
    dateFilter = 'AND DATE(b.created_at) BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else if (startDate) {
    dateFilter = 'AND DATE(b.created_at) = ?';
    params.push(startDate);
  }
  
  const summary = getOne(
    `SELECT 
      COUNT(*) as total_sales,
      COALESCE(SUM(bi.total_price), 0) as total_revenue
     FROM bill_items bi
     JOIN bills b ON bi.bill_id = b.id
     WHERE bi.item_type = 'medicine' AND b.status = 'completed' ${dateFilter}`,
    params
  );
  
  const itemWise = query(
    `SELECT 
      bi.item_name,
      SUM(bi.quantity) as total_quantity,
      COALESCE(SUM(bi.total_price), 0) as total_revenue
     FROM bill_items bi
     JOIN bills b ON bi.bill_id = b.id
     WHERE bi.item_type = 'medicine' AND b.status = 'completed' ${dateFilter}
     GROUP BY bi.item_name
     ORDER BY total_revenue DESC`,
    params
  );
  
  return {
    summary: {
      total_sales: summary?.total_sales || 0,
      total_revenue: summary?.total_revenue || 0,
    },
    item_wise: itemWise,
  };
}

// Get dashboard statistics
export function getDashboardStats() {
  const today = new Date().toISOString().split('T')[0];
  
  // Today's tokens
  const todayTokens = getOne(
    'SELECT COUNT(*) as count FROM tokens WHERE date = ?',
    [today]
  ) as { count: number };
  
  // Today's revenue
  const todayRevenue = getOne(
    `SELECT COALESCE(SUM(final_amount), 0) as amount FROM bills 
     WHERE DATE(created_at) = ? AND status = 'completed'`,
    [today]
  ) as { amount: number };
  
  // Pending tokens
  const pendingTokens = getOne(
    `SELECT COUNT(*) as count FROM tokens 
     WHERE date = ? AND status IN ('waiting', 'in_progress')`,
    [today]
  ) as { count: number };
  
  // Low stock items
  const lowStockItems = getOne(
    `SELECT COUNT(*) as count FROM inventory 
     WHERE stock_quantity <= min_stock_level AND is_active = 1`
  ) as { count: number };
  
  // Waiting patients
  const waitingPatients = getOne(
    `SELECT COUNT(*) as count FROM tokens 
     WHERE date = ? AND status = 'waiting'`,
    [today]
  ) as { count: number };
  
  // Recent bills
  const recentBills = query(
    `SELECT b.*, p.owner_name, a.name as animal_name
     FROM bills b
     JOIN patients p ON b.patient_id = p.id
     JOIN animals a ON b.animal_id = a.id
     WHERE DATE(b.created_at) = ?
     ORDER BY b.created_at DESC
     LIMIT 10`,
    [today]
  );
  
  // Room-wise today's stats
  const roomStats = query(
    `SELECT 
      r.name as room_name,
      COUNT(t.id) as token_count
     FROM rooms r
     LEFT JOIN tokens t ON r.id = t.room_id AND t.date = ?
     WHERE r.is_active = 1
     GROUP BY r.id, r.name`
  );
  
  return {
    today_tokens: todayTokens.count,
    today_revenue: todayRevenue.amount,
    pending_tokens: pendingTokens.count,
    low_stock_items: lowStockItems.count,
    waiting_patients: waitingPatients.count,
    recent_bills: recentBills,
    room_stats: roomStats,
  };
}

// Get monthly report
export function getMonthlyReport(year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  
  return getDateRangeReport(startDate, endDate);
}

// Get yearly report
export function getYearlyReport(year: number) {
  const monthlyData = [];
  
  for (let month = 1; month <= 12; month++) {
    const report = getMonthlyReport(year, month);
    monthlyData.push({
      month,
      month_name: new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' }),
      ...report.summary,
    });
  }
  
  const yearlySummary = monthlyData.reduce(
    (acc, curr) => ({
      total_bills: acc.total_bills + curr.total_bills,
      total_revenue: acc.total_revenue + curr.total_revenue,
      total_discount: acc.total_discount + curr.total_discount,
      net_revenue: acc.net_revenue + curr.net_revenue,
    }),
    { total_bills: 0, total_revenue: 0, total_discount: 0, net_revenue: 0 }
  );
  
  return {
    year,
    summary: yearlySummary,
    monthly_breakdown: monthlyData,
  };
}

// Export data for backup
export function exportAllData() {
  const tables = [
    'users', 'rooms', 'patients', 'animals', 'tokens', 'bills', 
    'bill_items', 'inventory', 'medical_records', 'payments', 'audit_logs'
  ];
  
  const data: Record<string, any[]> = {};
  
  tables.forEach(table => {
    data[table] = query(`SELECT * FROM ${table}`);
  });
  
  return data;
}
