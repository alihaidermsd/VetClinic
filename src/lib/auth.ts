import bcrypt from 'bcryptjs';
import { getOne, run, query } from './database';
import type { User, UserRole, LoginCredentials } from '@/types';

// Hash password
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

// Verify password
export function verifyPassword(password: string, hashedPassword: string): boolean {
  return bcrypt.compareSync(password, hashedPassword);
}

// Generate JWT token (simple implementation for client-side)
export function generateToken(user: User): string {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    room_id: user.room_id,
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };
  return btoa(JSON.stringify(payload));
}

// Verify JWT token
export function verifyToken(token: string): any | null {
  try {
    const payload = JSON.parse(atob(token));
    if (payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// Login user
export function login(credentials: LoginCredentials): { user: User; token: string } | null {
  const user = getOne('SELECT * FROM users WHERE username = ? AND is_active = 1', [credentials.username]);
  
  if (!user) return null;
  
  // For demo, allow admin/admin123 login
  if (credentials.username === 'admin' && credentials.password === 'admin123') {
    const token = generateToken(user as User);
    return { user: user as User, token };
  }
  
  if (!verifyPassword(credentials.password, user.password)) {
    return null;
  }
  
  const token = generateToken(user as User);
  return { user: user as User, token };
}

// Get user by ID
export function getUserById(id: number): User | null {
  return getOne('SELECT * FROM users WHERE id = ?', [id]) as User | null;
}

// Get all users
export function getAllUsers(): User[] {
  return query('SELECT * FROM users ORDER BY name') as User[];
}

// Create user
export function createUser(userData: Omit<User, 'id' | 'created_at'>): User {
  const hashedPassword = hashPassword(userData.password);
  const result = run(
    'INSERT INTO users (username, password, name, role, room_id, is_active) VALUES (?, ?, ?, ?, ?, ?)',
    [userData.username, hashedPassword, userData.name, userData.role, userData.room_id || null, userData.is_active ? 1 : 0]
  );
  return getUserById(result.lastInsertRowid) as User;
}

// Update user
export function updateUser(id: number, updates: Partial<User>): User | null {
  const sets: string[] = [];
  const values: any[] = [];
  
  if (updates.name) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.role) {
    sets.push('role = ?');
    values.push(updates.role);
  }
  if (updates.room_id !== undefined) {
    sets.push('room_id = ?');
    values.push(updates.room_id);
  }
  if (updates.is_active !== undefined) {
    sets.push('is_active = ?');
    values.push(updates.is_active ? 1 : 0);
  }
  if (updates.password) {
    sets.push('password = ?');
    values.push(hashPassword(updates.password));
  }
  
  if (sets.length === 0) return getUserById(id);
  
  values.push(id);
  run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, values);
  return getUserById(id);
}

// Delete user (soft delete)
export function deleteUser(id: number): boolean {
  const result = run('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
  return result.changes > 0;
}

// Check if user has permission
export function hasPermission(userRole: UserRole, permission: string): boolean {
  const permissions: Record<UserRole, string[]> = {
    admin: ['*'],
    reception: ['reception', 'billing', 'pharmacy', 'inventory', 'view_bills'],
    doctor: [
      'doctor_room',
      'lab',
      'xray',
      'surgery',
      'pharmacy',
      'inventory',
      'patients',
      'view_bills',
      'add_charges',
    ],
    lab_operator: ['lab', 'add_charges', 'view_bills'],
    xray_operator: ['xray', 'add_charges', 'view_bills'],
    surgery_operator: ['surgery', 'add_charges', 'view_bills'],
    pharmacy: ['pharmacy', 'inventory', 'add_charges', 'view_bills'],
    accountant: ['billing', 'reports', 'view_bills'],
  };
  
  const userPermissions = permissions[userRole] || [];
  return userPermissions.includes('*') || userPermissions.includes(permission);
}

// Get current user from token
export function getCurrentUser(): User | null {
  const token = localStorage.getItem('vetclinic_token');
  if (!token) return null;
  
  const payload = verifyToken(token);
  if (!payload) {
    localStorage.removeItem('vetclinic_token');
    return null;
  }
  
  return getUserById(payload.id);
}

// Logout
export function logout() {
  localStorage.removeItem('vetclinic_token');
}
