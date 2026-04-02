import { query, getOne, run } from '../database';
import type { User, UserRole } from '@/types';
import { hashPassword } from '../auth';

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
  room_id?: number;
  is_active: boolean;
}): User {
  const hashedPassword = hashPassword(userData.password);
  const result = run(
    'INSERT INTO users (username, password, name, role, room_id, is_active) VALUES (?, ?, ?, ?, ?, ?)',
    [
      userData.username,
      hashedPassword,
      userData.name,
      userData.role,
      userData.room_id || null,
      userData.is_active ? 1 : 0,
    ]
  );
  return getUserById(result.lastInsertRowid) as User;
}

// Update user
export function updateUser(id: number, updates: Partial<User>): User | null {
  const sets: string[] = [];
  const values: any[] = [];
  
  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.role !== undefined) {
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
