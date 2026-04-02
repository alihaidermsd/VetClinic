// Simple in-memory database for VetClinic Pro
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
    } else {
      // Create fresh database
      db = {};
      lastIds = {};
      createTables();
      seedData();
    }
    return db;
  } catch (error) {
    console.error('Database initialization error:', error);
    // Fallback to fresh database
    db = {};
    lastIds = {};
    createTables();
    seedData();
    return db;
  }
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
    'bill_items', 'inventory', 'medical_records', 'payments', 'audit_logs', 'app_settings'
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

// Query helpers
export function query(sql: string, params: any[] = []): any[] {
  // Simple SQL parsing for basic queries
  const lowerSql = sql.toLowerCase().trim();
  
  // Extract table name from SELECT
  const selectMatch = lowerSql.match(/from\s+(\w+)/);
  if (!selectMatch) return [];
  
  const table = selectMatch[1];
  if (!db[table]) return [];
  
  let results = Object.values(db[table]);
  
  // Handle WHERE clauses
  const whereMatch = lowerSql.match(/where\s+(.+?)(?:order|limit|$)/i);
  if (whereMatch && params.length > 0) {
    // Simple param matching
    results = results.filter(row => {
      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        // Check if any field matches
        for (const key of Object.keys(row)) {
          if (row[key] === param) return true;
          if (typeof row[key] === 'string' && row[key].toLowerCase().includes(String(param).toLowerCase())) return true;
        }
      }
      return false;
    });
  }
  
  // Handle ORDER BY
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
  
  // Handle LIMIT
  const limitMatch = lowerSql.match(/limit\s+(\d+)/);
  if (limitMatch) {
    const limit = parseInt(limitMatch[1]);
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
  const results = query(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Get database instance
export function getDb() {
  return db;
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
    saveDatabase();
  } catch (e) {
    console.error('Failed to import database:', e);
    throw e;
  }
}
