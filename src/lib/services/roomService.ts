import { query, getOne, run } from '../database';
import type { Room, RoomType } from '@/types';

// Get all rooms
export function getAllRooms(): Room[] {
  return query('SELECT * FROM rooms WHERE is_active = 1 ORDER BY name') as Room[];
}

// Get room by ID
export function getRoomById(id: number): Room | null {
  return getOne('SELECT * FROM rooms WHERE id = ?', [id]) as Room | null;
}

// Get rooms by type
export function getRoomsByType(type: RoomType): Room[] {
  return query('SELECT * FROM rooms WHERE type = ? AND is_active = 1 ORDER BY name', [type]) as Room[];
}

// Create room
export function createRoom(name: string, type: RoomType): Room {
  const result = run(
    'INSERT INTO rooms (name, type, is_active) VALUES (?, ?, 1)',
    [name, type]
  );
  
  return getRoomById(result.lastInsertRowid) as Room;
}

// Update room
export function updateRoom(id: number, updates: { name?: string; type?: RoomType; is_active?: boolean }): Room | null {
  const sets: string[] = [];
  const values: any[] = [];
  
  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.type !== undefined) {
    sets.push('type = ?');
    values.push(updates.type);
  }
  if (updates.is_active !== undefined) {
    sets.push('is_active = ?');
    values.push(updates.is_active ? 1 : 0);
  }
  
  if (sets.length === 0) return getRoomById(id);
  
  values.push(id);
  run(`UPDATE rooms SET ${sets.join(', ')} WHERE id = ?`, values);
  
  return getRoomById(id);
}

// Delete room (soft delete)
export function deleteRoom(id: number): boolean {
  const result = run('UPDATE rooms SET is_active = 0 WHERE id = ?', [id]);
  return result.changes > 0;
}

// Get room statistics
export function getRoomStats(roomId: number, date?: string) {
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  const tokenStats = getOne(
    `SELECT 
      COUNT(*) as total_tokens,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tokens
     FROM tokens 
     WHERE room_id = ? AND date = ?`,
    [roomId, targetDate]
  );
  
  const revenue = getOne(
    `SELECT COALESCE(SUM(bi.total_price), 0) as total_revenue
     FROM bill_items bi
     JOIN bills b ON bi.bill_id = b.id
     WHERE bi.room_id = ? AND DATE(b.created_at) = ? AND b.status = 'completed'`,
    [roomId, targetDate]
  );
  
  return {
    total_tokens: tokenStats?.total_tokens || 0,
    completed_tokens: tokenStats?.completed_tokens || 0,
    total_revenue: revenue?.total_revenue || 0,
  };
}

// Get all room types with labels
export function getRoomTypeOptions() {
  return [
    { value: 'reception', label: 'Reception' },
    { value: 'doctor_room', label: 'Doctor Room' },
    { value: 'lab', label: 'Laboratory' },
    { value: 'xray', label: 'X-Ray Room' },
    { value: 'surgery', label: 'Surgery Room' },
    { value: 'pharmacy', label: 'Pharmacy' },
  ];
}
