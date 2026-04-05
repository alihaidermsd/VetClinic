// Simple in-memory database for Animal Care Hospital
// This provides a reliable fallback that works in all browsers

interface Table {
  [id: number]: any;
}

interface Database {
  [tableName: string]: Table;
}

let db: Database = {};
let lastIds: { [table: string]: number } = {};

// Initialize the database
export async function initDatabase(): Promise<any> {
  try {
    // Try to load from localStorage
    const savedDb = localStorage.getItem('vetclinic_db_v2');
    if (savedDb) {
      const parsed = JSON.parse(savedDb);
      db = parsed.data || {};
      lastIds = parsed.lastIds || {};
      if (!db.token_referrals) {
        db.token_referrals = {};
      }
      if (lastIds.token_referrals == null) {
        lastIds.token_referrals = 0;
      }
      if (!db.staff_attendance) {
        db.staff_attendance = {};
      }
      if (lastIds.staff_attendance == null) {
        lastIds.staff_attendance = 0;
      }
      if (!db.salary_payments) {
        db.salary_payments = {};
      }
      if (lastIds.salary_payments == null) {
        lastIds.salary_payments = 0;
      }
      for (const uid of Object.keys(db.users || {})) {
        const u = db.users[Number(uid)];
        if (u && (u.monthly_salary == null || u.monthly_salary === '')) {
          u.monthly_salary = 0;
        }
      }
      saveDatabase();
    } else {
      // Create fresh database
      db = {};
      lastIds = {};
      createTables();
      seedData();
    }
  } catch (error) {
    console.error('Database initialization error:', error);
    // Fallback to fresh database
    db = {};
    lastIds = {};
    createTables();
    seedData();
  } finally {
    try {
      const { migrateLegacyBillCorruption } = await import('./services/billingService');
      migrateLegacyBillCorruption();
    } catch (e) {
      console.error('Legacy bill migration failed:', e);
    }
  }
  return db;
}

// Save database to localStorage
export function saveDatabase() {
  try {
    localStorage.setItem('vetclinic_db_v2', JSON.stringify({ data: db, lastIds }));
  } catch (e) {
    console.error('Failed to save database:', e);
  }
}

// Create all tables
function createTables() {
  const tables = [
    'users', 'rooms', 'patients', 'animals', 'tokens', 'bills',
    'bill_items', 'inventory', 'medical_records', 'payments', 'audit_logs', 'app_settings',
    'token_referrals', 'staff_attendance', 'salary_payments',
  ];
  
  tables.forEach(table => {
    if (!db[table]) {
      db[table] = {};
    }
    if (!lastIds[table]) {
      lastIds[table] = 0;
    }
  });
}

// Seed initial data
function seedData() {
  // Insert default rooms
  const rooms = [
    { name: 'Reception', type: 'reception', is_active: 1 },
    { name: 'Doctor Room 1', type: 'doctor_room', is_active: 1 },
    { name: 'Doctor Room 2', type: 'doctor_room', is_active: 1 },
    { name: 'Laboratory', type: 'lab', is_active: 1 },
    { name: 'X-Ray Room', type: 'xray', is_active: 1 },
    { name: 'Surgery Room', type: 'surgery', is_active: 1 },
    { name: 'Pharmacy', type: 'pharmacy', is_active: 1 },
  ];

  rooms.forEach(room => {
    insert('rooms', room);
  });

  // Insert default admin user with hashed password (admin123)
  insert('users', {
    username: 'admin',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // bcrypt hash for 'admin123'
    name: 'Administrator',
    role: 'admin',
    is_active: 1,
    monthly_salary: 0,
    created_at: new Date().toISOString(),
  });

  // Insert sample inventory items
  const inventoryItems = [
    { name: 'Amoxicillin 500mg', category: 'medicine', stock_quantity: 100, min_stock_level: 20, cost_price: 50, selling_price: 75, is_active: 1 },
    { name: 'Rabies Vaccine', category: 'medicine', stock_quantity: 50, min_stock_level: 10, cost_price: 200, selling_price: 350, is_active: 1 },
    { name: 'Dog Food Premium', category: 'food', stock_quantity: 30, min_stock_level: 5, cost_price: 500, selling_price: 750, is_active: 1 },
    { name: 'Cat Food Premium', category: 'food', stock_quantity: 25, min_stock_level: 5, cost_price: 400, selling_price: 600, is_active: 1 },
    { name: 'Multivitamin Syrup', category: 'supplement', stock_quantity: 40, min_stock_level: 10, cost_price: 150, selling_price: 250, is_active: 1 },
    { name: 'Calcium Tablets', category: 'supplement', stock_quantity: 60, min_stock_level: 15, cost_price: 80, selling_price: 120, is_active: 1 },
    { name: 'Bandage Roll', category: 'equipment', stock_quantity: 100, min_stock_level: 25, cost_price: 30, selling_price: 50, is_active: 1 },
    { name: 'Cotton Balls', category: 'equipment', stock_quantity: 200, min_stock_level: 50, cost_price: 20, selling_price: 35, is_active: 1 },
  ];

  inventoryItems.forEach(item => {
    insert('inventory', { ...item, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  });

  // Set initial token counter
  insert('app_settings', { key: 'last_token_number', value: '0' });
  insert('app_settings', { key: 'last_bill_number', value: '0' });

  saveDatabase();
}

// Insert a record
function insert(table: string, data: any): number {
  if (!db[table]) {
    db[table] = {};
  }
  lastIds[table] = (lastIds[table] || 0) + 1;
  const id = lastIds[table];
  db[table][id] = { ...data, id };
  return id;
}

function extractFromTable(sql: string): string | null {
  const m = sql.match(/\bFROM\s+(\w+)/i);
  return m ? m[1] : null;
}

function extractWhereClause(sql: string): string | null {
  const lower = sql.toLowerCase();
  const i = lower.indexOf(' where ');
  if (i < 0) return null;
  const rest = sql.slice(i + 7);
  const stop = rest.search(/\s+ORDER\s+BY|\s+LIMIT|\s+GROUP\s+BY/i);
  const clause = (stop >= 0 ? rest.slice(0, stop) : rest).trim();
  return clause || null;
}

function filterLikeOrWhere(rows: any[], whereClause: string, params: any[]): any[] {
  const orParts = whereClause.split(/\s+OR\s+/i).map((s) => s.trim());
  return rows.filter((row) => {
    let paramIndex = 0;
    for (const part of orParts) {
      const m = part.match(/^(\w+)\s+LIKE\s+\?$/i);
      if (m) {
        const pat = String(params[paramIndex] ?? '');
        paramIndex++;
        const needle = pat.replace(/^%|%$/g, '').toLowerCase();
        const hay = String(row[m[1]] ?? '').toLowerCase();
        if (needle === '' || hay.includes(needle)) return true;
      }
    }
    return false;
  });
}

function filterWhere(rows: any[], whereClause: string, params: any[]): any[] {
  if (/\bLIKE\b/i.test(whereClause) && /\s+OR\s+/i.test(whereClause)) {
    return filterLikeOrWhere(rows, whereClause, params);
  }
  return filterByWhereClause(rows, whereClause, params);
}

/** Loose match for SQL `=?` (ids often differ as number vs string after JSON/localStorage). */
function rowValueEquals(cell: any, param: any): boolean {
  if (Object.is(cell, param)) return true;
  if (cell == null || param == null) return cell == null && param == null;
  if (typeof cell === 'boolean' || typeof param === 'boolean') {
    return Boolean(cell) === Boolean(param);
  }
  if (typeof cell === 'number' || typeof param === 'number') {
    return Number(cell) === Number(param);
  }
  const cn = Number(cell);
  const pn = Number(param);
  if (
    cell !== '' &&
    param !== '' &&
    !Number.isNaN(cn) &&
    !Number.isNaN(pn) &&
    String(cn) === String(String(cell).trim()) &&
    String(pn) === String(String(param).trim())
  ) {
    return cn === pn;
  }
  return String(cell) === String(param);
}

/** AND-combined conditions: col = ?, literals, col IN (...), col != 'x', DATE(col) = ? */
function filterByWhereClause(rows: any[], whereClause: string, params: any[]): any[] {
  const parts = whereClause.split(/\s+AND\s+/i).map((s) => s.trim());
  return rows.filter((row) => {
    let paramIndex = 0;
    for (const part of parts) {
      const dateEq = part.match(/^DATE\s*\(\s*(\w+)\s*\)\s*=\s*\?$/i);
      if (dateEq) {
        const col = dateEq[1];
        const want = String(params[paramIndex] ?? '').split('T')[0];
        const got = String(row[col] ?? '').split('T')[0];
        if (got !== want) return false;
        paramIndex++;
        continue;
      }
      const eqQ = part.match(/^(\w+)\s*=\s*\?$/i);
      if (eqQ) {
        if (!rowValueEquals(row[eqQ[1]], params[paramIndex])) return false;
        paramIndex++;
        continue;
      }
      const eqNum = part.match(/^(\w+)\s*=\s*(\d+)$/i);
      if (eqNum) {
        const v = row[eqNum[1]];
        if (Number(v) !== Number(eqNum[2]) && v != eqNum[2]) return false;
        continue;
      }
      const eqStr = part.match(/^(\w+)\s*=\s*'([^']*)'$/i);
      if (eqStr) {
        if (String(row[eqStr[1]]) !== eqStr[2]) return false;
        continue;
      }
      const neStr = part.match(/^(\w+)\s*!=\s*'([^']*)'$/i);
      if (neStr) {
        if (String(row[neStr[1]]) === neStr[2]) return false;
        continue;
      }
      const inList = part.match(/^(\w+)\s+IN\s*\(([^)]+)\)$/i);
      if (inList) {
        const col = inList[1];
        const vals = inList[2].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
        const cell = row[col];
        if (!vals.some((v) => rowValueEquals(cell, v))) return false;
        continue;
      }
      return false;
    }
    return true;
  });
}

// Query helpers
export function query(sql: string, params: any[] = []): any[] {
  const lowerSql = sql.toLowerCase().trim();

  const selectMatch = lowerSql.match(/\bfrom\s+(\w+)/);
  if (!selectMatch) return [];

  const table = selectMatch[1];
  if (!db[table]) return [];

  let results = Object.values(db[table]);

  const whereClause = extractWhereClause(sql);
  if (whereClause) {
    results = filterWhere(results, whereClause, params);
  } else if (params.length > 0) {
    // Legacy: LIKE search across tables that don't use structured WHERE
    results = results.filter((row) => {
      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        for (const key of Object.keys(row)) {
          if (row[key] === param) return true;
          if (typeof row[key] === 'string' && row[key].toLowerCase().includes(String(param).toLowerCase())) return true;
        }
      }
      return false;
    });
  }

  const orderMatch = lowerSql.match(/order\s+by\s+(\w+)(?:\s+(asc|desc))?/i);
  if (orderMatch) {
    const field = orderMatch[1];
    const dir = orderMatch[2] || 'asc';
    results.sort((a, b) => {
      if (a[field] < b[field]) return dir === 'asc' ? -1 : 1;
      if (a[field] > b[field]) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const limitMatch = lowerSql.match(/limit\s+(\d+)/i);
  if (limitMatch) {
    const limit = parseInt(limitMatch[1], 10);
    results = results.slice(0, limit);
  }

  return results;
}

export function run(sql: string, params: any[] = []): { lastInsertRowid: number; changes: number } {
  const lowerSql = sql.toLowerCase().trim();
  
  // Handle INSERT
  if (lowerSql.startsWith('insert')) {
    const tableMatch = lowerSql.match(/into\s+(\w+)/);
    if (!tableMatch) return { lastInsertRowid: 0, changes: 0 };
    
    const table = tableMatch[1];
    const id = insert(table, paramsToObject(sql, params));
    saveDatabase();
    return { lastInsertRowid: id, changes: 1 };
  }
  
  // Handle UPDATE
  if (lowerSql.startsWith('update')) {
    const tableMatch = lowerSql.match(/update\s+(\w+)/);
    if (!tableMatch) return { lastInsertRowid: 0, changes: 0 };
    
    const table = tableMatch[1];
    const whereMatch = lowerSql.match(/where\s+id\s*=\s*\?/);
    
    if (whereMatch && params.length > 0) {
      const id = params[params.length - 1];
      if (db[table] && db[table][id]) {
        // Update fields
        const setMatch = lowerSql.match(/set\s+(.+?)\s+where/);
        if (setMatch) {
          const setClause = setMatch[1];
          const fields = setClause.split(',').map(s => s.trim().split('=')[0].trim());
          for (let i = 0; i < fields.length && i < params.length - 1; i++) {
            db[table][id][fields[i]] = params[i];
          }
          saveDatabase();
          return { lastInsertRowid: id, changes: 1 };
        }
      }
    }
    return { lastInsertRowid: 0, changes: 0 };
  }
  
  // Handle DELETE
  if (lowerSql.startsWith('delete')) {
    const tableMatch = lowerSql.match(/from\s+(\w+)/);
    if (!tableMatch) return { lastInsertRowid: 0, changes: 0 };
    
    const table = tableMatch[1];
    const whereMatch = lowerSql.match(/where\s+id\s*=\s*\?/);
    
    if (whereMatch && params.length > 0) {
      const id = params[0];
      if (db[table] && db[table][id]) {
        delete db[table][id];
        saveDatabase();
        return { lastInsertRowid: 0, changes: 1 };
      }
    }
    return { lastInsertRowid: 0, changes: 0 };
  }
  
  return { lastInsertRowid: 0, changes: 0 };
}

// Convert params array to object based on SQL
function paramsToObject(sql: string, params: any[]): any {
  const obj: any = {};
  const matches = sql.match(/\(([^)]+)\)/);
  if (matches) {
    const fields = matches[1].split(',').map(f => f.trim());
    fields.forEach((field, i) => {
      if (i < params.length) {
        obj[field] = params[i];
      }
    });
  }
  return obj;
}

export function getOne(sql: string, params: any[] = []): any | null {
  const s = sql.trim();

  const countM = s.match(/SELECT\s+COUNT\(\*\)\s+AS\s+(\w+)/i);
  if (countM) {
    const tbl = extractFromTable(s);
    if (!tbl || !db[tbl]) return { [countM[1]]: 0 } as any;
    let rows = Object.values(db[tbl]);
    const wc = extractWhereClause(s);
    if (wc) rows = filterWhere(rows, wc, params);
    return { [countM[1]]: rows.length } as any;
  }

  const sumM = s.match(
    /SELECT\s+COALESCE\s*\(\s*SUM\s*\(\s*(\w+)\s*\)\s*,\s*[^)]+\)\s+AS\s+(\w+)/i
  );
  if (sumM) {
    const sumCol = sumM[1];
    const alias = sumM[2];
    const tbl = extractFromTable(s);
    if (!tbl || !db[tbl]) return { [alias]: 0 } as any;
    let rows = Object.values(db[tbl]);
    const wc = extractWhereClause(s);
    if (wc) rows = filterWhere(rows, wc, params);
    const total = rows.reduce((acc, r) => acc + (Number(r[sumCol]) || 0), 0);
    return { [alias]: total } as any;
  }

  const maxM = s.match(/SELECT\s+MAX\s*\(\s*(\w+)\s*\)\s+AS\s+(\w+)/i);
  if (maxM) {
    const col = maxM[1];
    const alias = maxM[2];
    const tbl = extractFromTable(s);
    if (!tbl || !db[tbl]) return { [alias]: null } as any;
    let rows = Object.values(db[tbl]);
    const wc = extractWhereClause(s);
    if (wc) rows = filterWhere(rows, wc, params);
    const nums = rows.map((r) => Number(r[col])).filter((n) => !Number.isNaN(n));
    return { [alias]: nums.length ? Math.max(...nums) : null } as any;
  }

  const results = query(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Get database instance
export function getDb() {
  return db;
}

/** All rows in a table (in-memory store has no real SQL engine). */
export function listTable(table: string): any[] {
  if (!db[table]) return [];
  return Object.values(db[table]);
}

// Check if database is ready
export function isDbReady(): boolean {
  return Object.keys(db).length > 0;
}

// Reset database (for testing)
export async function resetDatabase() {
  db = {};
  lastIds = {};
  localStorage.removeItem('vetclinic_db_v2');
  createTables();
  seedData();
  return db;
}

// Export database as JSON
export function exportDatabase(): string {
  return JSON.stringify({ data: db, lastIds });
}

// Import database from JSON
export function importDatabase(data: string) {
  try {
    const parsed = JSON.parse(data);
    db = parsed.data || {};
    lastIds = parsed.lastIds || {};
    if (!db.staff_attendance) db.staff_attendance = {};
    if (lastIds.staff_attendance == null) lastIds.staff_attendance = 0;
    if (!db.salary_payments) db.salary_payments = {};
    if (lastIds.salary_payments == null) lastIds.salary_payments = 0;
    for (const uid of Object.keys(db.users || {})) {
      const u = db.users[Number(uid)];
      if (u && (u.monthly_salary == null || u.monthly_salary === '')) {
        u.monthly_salary = 0;
      }
    }
    saveDatabase();
  } catch (e) {
    console.error('Failed to import database:', e);
    throw e;
  }
}
