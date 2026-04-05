import { query, getOne, run } from '../database';
import type { User, UserRole } from '@/types';
import { hashPassword } from '../auth';

/** Active users with the admin role (used to protect the last admin account). */
export function getActiveAdminUserCount(): number {
  return (getAllUsers() as User[]).filter((u) => u.role === 'admin' && u.is_active).length;
}

// Get all users
export function getAllUsers(): User[] {
  return query('SELECT * FROM users ORDER BY name') as User[];
}

// Get user by ID
export function getUserById(id: number): User | null {
  return getOne('SELECT * FROM users WHERE id = ?', [id]) as User | null;
}

// Get user by username
export function getUserByUsername(username: string): User | null {
  return getOne('SELECT * FROM users WHERE username = ?', [username]) as User | null;
}

// Create user
export function createUser(userData: {
  username: string;
  password: string;
  name: string;
  role: UserRole;
  room_id?: number | null;
  is_active: boolean;
  monthly_salary?: number;
}): User {
  const username = userData.username.trim();
  const name = userData.name.trim();
  if (!username) {
    throw new Error('Username is required');
  }
  if (!name) {
    throw new Error('Name is required');
  }
  if (!userData.password || userData.password.length < 4) {
    throw new Error('Password must be at least 4 characters');
  }
  const taken = getUserByUsername(username);
  if (taken) {
    throw new Error('That username is already in use');
  }

  const hashedPassword = hashPassword(userData.password);
  const salary = Number(userData.monthly_salary);
  const monthlySalary = Number.isFinite(salary) && salary >= 0 ? salary : 0;
  const result = run(
    'INSERT INTO users (username, password, name, role, room_id, is_active, monthly_salary) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      username,
      hashedPassword,
      name,
      userData.role,
      userData.room_id != null && userData.room_id > 0 ? userData.room_id : null,
      userData.is_active ? 1 : 0,
      monthlySalary,
    ]
  );
  return getUserById(result.lastInsertRowid) as User;
}

export type UserUpdateInput = Partial<Pick<User, 'name' | 'role' | 'is_active' | 'username' | 'monthly_salary'>> & {
  /** Pass `null` to clear assigned room */
  room_id?: number | null;
  /** Plain-text new password (will be hashed) */
  password?: string;
};

// Update user
export function updateUser(id: number, updates: UserUpdateInput): User | null {
  const sets: string[] = [];
  const values: any[] = [];

  if (updates.username !== undefined) {
    const u = String(updates.username).trim();
    if (!u) {
      throw new Error('Username cannot be empty');
    }
    const existing = getUserByUsername(u);
    if (existing && existing.id !== id) {
      throw new Error('That username is already in use');
    }
    sets.push('username = ?');
    values.push(u);
  }

  if (updates.name !== undefined) {
    const n = String(updates.name).trim();
    if (!n) {
      throw new Error('Name cannot be empty');
    }
    sets.push('name = ?');
    values.push(n);
  }
  if (updates.role !== undefined) {
    sets.push('role = ?');
    values.push(updates.role);
  }
  if (updates.room_id !== undefined) {
    sets.push('room_id = ?');
    values.push(
      updates.room_id != null && Number(updates.room_id) > 0 ? updates.room_id : null
    );
  }
  if (updates.is_active !== undefined) {
    sets.push('is_active = ?');
    values.push(updates.is_active ? 1 : 0);
  }
  if (updates.monthly_salary !== undefined) {
    const s = Number(updates.monthly_salary);
    if (!Number.isFinite(s) || s < 0) {
      throw new Error('Monthly salary must be a non-negative number');
    }
    sets.push('monthly_salary = ?');
    values.push(s);
  }
  if (updates.password !== undefined && updates.password.length > 0) {
    if (updates.password.length < 4) {
      throw new Error('Password must be at least 4 characters');
    }
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

// Hard delete user (permanent)
export function permanentlyDeleteUser(id: number): boolean {
  const result = run('DELETE FROM users WHERE id = ?', [id]);
  return result.changes > 0;
}

// Get users by role
export function getUsersByRole(role: UserRole): User[] {
  return query('SELECT * FROM users WHERE role = ? AND is_active = 1 ORDER BY name', [role]) as User[];
}

// Get active users
export function getActiveUsers(): User[] {
  return query('SELECT * FROM users WHERE is_active = 1 ORDER BY name') as User[];
}
